"""FastAPI backend for evil-ui: browses EVIL's data via MCP (list_runs/
list_turns/list_laps/list_straights -- the browsing-shaped tools, not the
narrow LLM ones), and proxies chat questions to tern-llm's real /ask
endpoint. The proxy is the same shape as
RaceEngineerDashboard/backend/main.py's forward_bag_request: this backend
never re-implements the LLM harness, it just forwards.

Every MCPToolClient.invoke() call is wrapped in asyncio.to_thread(): invoke()
calls asyncio.run() internally, which raises if called directly from
inside a route handler's already-running event loop -- same reason
tern-llm's api.py wraps its own ask() call in asyncio.to_thread().
"""

from __future__ import annotations

import asyncio
import json
import os

import httpx
from fastapi import FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from starlette.requests import ClientDisconnect

from evil_ui_backend.mcp_client import MCPToolClient

DEFAULT_EVIL_MCP_URL = os.getenv("EVIL_MCP_URL", "http://127.0.0.1:8765/mcp")
DEFAULT_EVIL_UPLOAD_URL = os.getenv("EVIL_UPLOAD_URL", "http://127.0.0.1:8766")
DEFAULT_TERN_LLM_URL = os.getenv("TERN_LLM_URL", "http://127.0.0.1:8000")
ASK_PROXY_TIMEOUT_SEC = float(os.getenv("TERN_LLM_ASK_TIMEOUT_SEC", "160"))
UPLOAD_PROXY_TIMEOUT_SEC = float(os.getenv("EVIL_UPLOAD_TIMEOUT_SEC", "120"))
# Recording uploads can be GBs; the upstream replies only after storing everything.
RECORDING_PROXY_TIMEOUT_SEC = float(os.getenv("EVIL_RECORDING_TIMEOUT_SEC", "1800"))


class AskRequest(BaseModel):
    question: str


def create_app(
    mcp_url: str | None = None,
    tern_llm_url: str | None = None,
    upload_url: str | None = None,
) -> FastAPI:
    app = FastAPI()
    app.state.mcp_url = mcp_url or DEFAULT_EVIL_MCP_URL
    app.state.tern_llm_url = tern_llm_url or DEFAULT_TERN_LLM_URL
    app.state.upload_url = upload_url or DEFAULT_EVIL_UPLOAD_URL

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    async def _call_tool(name: str, arguments: dict) -> object:
        """Catches Exception broadly on purpose: a connection failure (evil
        unreachable) and a tool-level error (RuntimeError from mcp_client.py)
        are both "the browsing UI couldn't get this data," not a 500 crash."""
        client = MCPToolClient(app.state.mcp_url)
        try:
            return await asyncio.to_thread(client.invoke, name, arguments)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"evil unreachable or tool error: {exc}") from exc

    @app.get("/healthz")
    async def healthz() -> dict:
        return {"status": "ok"}

    @app.get("/runs")
    async def get_runs(include_live_twins: bool = False) -> object:
        """Both tiers: uploads and live runs (tier, status 'recording' | 'closed', linked_run_id)."""
        # The Runs page lists everything: EVIL's list_runs returns 20 by default (sized for Tern).
        args = {"limit": 500, **({"include_live_twins": True} if include_live_twins else {})}
        return await _call_tool("list_runs", args)

    @app.get("/live/status")
    async def get_live_status() -> object:
        """Is the car's live feed alive, is a run recording, its latest numbers (EVIL get_live_status)."""
        return await _call_tool("get_live_status", {})

    @app.get("/runs/{run_id}/turns")
    async def get_turns(run_id: str, limit: int = 50, offset: int = 0) -> object:
        return await _call_tool("list_turns", {"run_id": run_id, "limit": limit, "offset": offset})

    @app.get("/runs/{run_id}/laps")
    async def get_laps(run_id: str, limit: int = 50, offset: int = 0) -> object:
        return await _call_tool("list_laps", {"run_id": run_id, "limit": limit, "offset": offset})

    @app.get("/runs/{run_id}/straights")
    async def get_straights(run_id: str, limit: int = 50, offset: int = 0) -> object:
        return await _call_tool("list_straights", {"run_id": run_id, "limit": limit, "offset": offset})

    @app.post("/ask")
    async def ask_proxy(payload: AskRequest) -> object:
        url = f"{app.state.tern_llm_url}/ask"
        timeout = httpx.Timeout(ASK_PROXY_TIMEOUT_SEC, connect=5.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            try:
                # client steers Tern's default run (agent._build_run_context): evil-ui means the
                # latest completed run unless the question is about "now".
                response = await client.post(url, json={"question": payload.question, "client": "evil-ui"})
            except httpx.TransportError as exc:
                raise HTTPException(status_code=502, detail="tern-llm unreachable") from exc

        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=response.text)
        return response.json()

    @app.post("/ask/stream")
    async def ask_stream_proxy(payload: AskRequest) -> StreamingResponse:
        """Tern's progress (queued, thinking, tool calls) and then the answer, one JSON object per
        line, passed through as they come. Every failure is a final {"type": "error"} line, so the
        chat never has to parse an HTTP error. A Tern without /ask/stream gets one plain /ask."""
        base = app.state.tern_llm_url
        body = {"question": payload.question, "client": "evil-ui"}

        async def events():
            timeout = httpx.Timeout(ASK_PROXY_TIMEOUT_SEC, connect=5.0)
            fallback = False
            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    async with client.stream("POST", f"{base}/ask/stream", json=body) as response:
                        if response.status_code in (404, 405):
                            fallback = True
                        elif response.status_code != 200:
                            await response.aread()
                            yield _line(_error_event(response.status_code, response.text))
                            return
                        else:
                            async for line in response.aiter_lines():
                                if line.strip():
                                    yield line.strip() + "\n"
                            return
                    if fallback:
                        yield _line({"type": "thinking", "turn": 1})
                        response = await client.post(f"{base}/ask", json=body)
                        if response.status_code != 200:
                            yield _line(_error_event(response.status_code, response.text))
                        else:
                            data = response.json()
                            yield _line({"type": "answer", "text": data.get("answer", ""),
                                         "outcome": data.get("outcome"), "trace_id": data.get("trace_id")})
            except (httpx.ConnectError, httpx.ConnectTimeout):
                yield _line({"type": "error", "status": 502, "detail": "tern-llm unreachable"})
            except httpx.TimeoutException:
                yield _line({"type": "error", "status": 504, "detail": "tern-llm did not respond in time"})
            except httpx.TransportError:
                yield _line({"type": "error", "status": 502, "detail": "tern-llm unreachable"})

        return StreamingResponse(events(), media_type="application/x-ndjson",
                                 headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    @app.post("/upload")
    async def upload_proxy(run_id: str = Form(...), file: UploadFile = File(...)) -> object:
        content = await file.read()
        url = f"{app.state.upload_url}/upload"
        timeout = httpx.Timeout(UPLOAD_PROXY_TIMEOUT_SEC, connect=5.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            try:
                response = await client.post(
                    url,
                    data={"run_id": run_id},
                    files={"file": (file.filename, content, file.content_type)},
                )
            except httpx.TransportError as exc:
                raise HTTPException(status_code=502, detail="evil upload service unreachable") from exc

        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail=response.text)
        return response.json()

    async def _forward_json(method: str, path: str, request: Request) -> Response:
        """Plain request/response passthrough to evil's upload service
        (catalog endpoints): status and body are returned untouched."""
        timeout = httpx.Timeout(UPLOAD_PROXY_TIMEOUT_SEC, connect=5.0)
        body = await request.body() if method in ("PATCH", "POST") else None
        headers = {"content-type": request.headers["content-type"]} if body and "content-type" in request.headers else {}
        async with httpx.AsyncClient(timeout=timeout) as client:
            try:
                upstream = await client.request(
                    method, f"{app.state.upload_url}{path}", params=request.query_params, content=body, headers=headers
                )
            except httpx.TransportError as exc:
                raise HTTPException(status_code=502, detail="evil upload service unreachable") from exc
        return Response(
            content=upstream.content,
            status_code=upstream.status_code,
            media_type=upstream.headers.get("content-type", "application/json"),
        )

    @app.get("/recordings")
    async def list_recordings_proxy(request: Request) -> Response:
        return await _forward_json("GET", "/recordings", request)

    @app.get("/recordings/{recording_id}")
    async def get_recording_proxy(recording_id: str, request: Request) -> Response:
        return await _forward_json("GET", f"/recordings/{recording_id}", request)

    @app.patch("/recordings/{recording_id}")
    async def patch_recording_proxy(recording_id: str, request: Request) -> Response:
        return await _forward_json("PATCH", f"/recordings/{recording_id}", request)

    @app.post("/recordings/{recording_id}/reparse")
    async def reparse_recording_proxy(recording_id: str, request: Request) -> Response:
        return await _forward_json("POST", f"/recordings/{recording_id}/reparse", request)

    @app.get("/system/status")
    async def system_status_proxy(request: Request) -> Response:
        return await _forward_json("GET", "/system/status", request)

    @app.get("/locations")
    async def list_locations_proxy(request: Request) -> Response:
        return await _forward_json("GET", "/locations", request)

    @app.post("/locations")
    async def add_location_proxy(request: Request) -> Response:
        return await _forward_json("POST", "/locations", request)

    @app.post("/recordings")
    async def create_recording_proxy(request: Request) -> Response:
        """Streams the multipart body straight through to evil without parsing
        or buffering it (recordings can be GBs). If the browser disconnects
        mid-upload the stream breaks, httpx aborts the upstream request, and
        evil discards its staging folder -- nothing is stored."""
        headers = {"content-type": request.headers.get("content-type", "")}
        if "content-length" in request.headers:
            headers["content-length"] = request.headers["content-length"]
        timeout = httpx.Timeout(RECORDING_PROXY_TIMEOUT_SEC, connect=5.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            try:
                upstream = await client.post(
                    f"{app.state.upload_url}/recordings", content=request.stream(), headers=headers
                )
            except ClientDisconnect:
                # Browser went away mid-upload: evil sees the broken stream and stores nothing.
                return Response(status_code=499)
            except httpx.TransportError as exc:
                raise HTTPException(status_code=502, detail="evil upload service unreachable") from exc
        return Response(
            content=upstream.content,
            status_code=upstream.status_code,
            media_type=upstream.headers.get("content-type", "application/json"),
        )

    return app


app = create_app()


def _line(event: dict) -> str:
    return json.dumps(event) + "\n"


def _error_event(status: int, body: str) -> dict:
    if status in (409, 429, 503):
        detail = "Tern is busy answering other questions, try again shortly"
    elif status == 504:
        detail = "tern-llm did not respond in time"
    else:
        try:
            detail = str(json.loads(body).get("detail") or f"tern-llm returned HTTP {status}")
        except (ValueError, AttributeError):
            detail = f"tern-llm returned HTTP {status}"
    return {"type": "error", "status": status, "detail": detail}
