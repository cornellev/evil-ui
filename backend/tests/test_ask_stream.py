"""/ask/stream: Tern's progress events passed through line by line, with a plain-/ask fallback
for a Tern that has no stream endpoint, and every failure as one final error line."""

import json
import threading

import pytest
import uvicorn
from fastapi import FastAPI
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.testclient import TestClient

from conftest import _free_port, _wait_for_port
from evil_ui_backend.main import create_app

EVENTS = [{"type": "started", "queue_wait_ms": 0}, {"type": "thinking", "turn": 1},
          {"type": "tool", "name": "list_laps", "args": {"run_id": "r1"}},
          {"type": "tool_done", "name": "list_laps", "ok": True, "summary": "3 rows"},
          {"type": "thinking", "turn": 2}, {"type": "answer", "text": "3 laps.", "outcome": "answered"}]


def _serve(app):
    port = _free_port()
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning"))
    threading.Thread(target=server.run, daemon=True).start()
    _wait_for_port(port)
    return server, f"http://127.0.0.1:{port}"


@pytest.fixture
def streaming_tern():
    app = FastAPI()
    seen = {}

    @app.post("/ask/stream")
    async def stream(payload: dict):
        seen["body"] = payload
        return StreamingResponse((json.dumps(e) + "\n" for e in EVENTS), media_type="application/x-ndjson")

    server, url = _serve(app)
    yield url, seen
    server.should_exit = True


@pytest.fixture
def ask_only_tern():
    app = FastAPI()

    @app.post("/ask")
    async def ask(payload: dict) -> dict:
        return {"answer": f"echo: {payload['question']}"}

    server, url = _serve(app)
    yield url
    server.should_exit = True


@pytest.fixture
def busy_tern():
    app = FastAPI()

    @app.post("/ask/stream")
    async def stream(payload: dict):
        return JSONResponse({"detail": "queue full"}, status_code=429)

    server, url = _serve(app)
    yield url
    server.should_exit = True


def _events(resp):
    return [json.loads(line) for line in resp.text.splitlines() if line.strip()]


def test_events_pass_through_in_order_as_evil_ui(dummy_mcp_url, streaming_tern):
    url, seen = streaming_tern
    resp = TestClient(create_app(mcp_url=dummy_mcp_url, tern_llm_url=url)).post(
        "/ask/stream", json={"question": "lap times?"})
    assert resp.status_code == 200 and resp.headers["content-type"].startswith("application/x-ndjson")
    assert _events(resp) == EVENTS
    assert seen["body"] == {"question": "lap times?", "client": "evil-ui"}


def test_a_tern_without_the_stream_endpoint_falls_back_to_one_ask(dummy_mcp_url, ask_only_tern):
    resp = TestClient(create_app(mcp_url=dummy_mcp_url, tern_llm_url=ask_only_tern)).post(
        "/ask/stream", json={"question": "hi"})
    events = _events(resp)
    assert events[0] == {"type": "thinking", "turn": 1}
    assert events[-1]["type"] == "answer" and events[-1]["text"] == "echo: hi"


def test_a_busy_tern_is_one_error_line(dummy_mcp_url, busy_tern):
    resp = TestClient(create_app(mcp_url=dummy_mcp_url, tern_llm_url=busy_tern)).post(
        "/ask/stream", json={"question": "hi"})
    assert _events(resp) == [{"type": "error", "status": 429,
                              "detail": "Tern is busy answering other questions, try again shortly"}]


def test_an_unreachable_tern_is_one_error_line(dummy_mcp_url):
    resp = TestClient(create_app(mcp_url=dummy_mcp_url, tern_llm_url="http://127.0.0.1:1")).post(
        "/ask/stream", json={"question": "hi"})
    assert _events(resp) == [{"type": "error", "status": 502, "detail": "tern-llm unreachable"}]
