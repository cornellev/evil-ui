"""Dummy MCP server (not evil's real one -- same reasoning as
tern-llm/tests/conftest.py: this repo's tests should prove its own plumbing,
not re-verify evil's tool logic) and a fake tern-llm upstream, both real
running servers in background threads, not mocks.
"""

from __future__ import annotations

import socket
import threading
import time
from collections.abc import Iterator

import pytest
import uvicorn
from fastapi import FastAPI, File, Form, UploadFile
from mcp.server.mcpserver import MCPServer


def _free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def _wait_for_port(port: int, timeout_s: float = 5.0) -> None:
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.2):
                return
        except OSError:
            time.sleep(0.1)
    raise RuntimeError(f"nothing listening on 127.0.0.1:{port} after {timeout_s}s")


@pytest.fixture
def dummy_mcp_url() -> Iterator[str]:
    port = _free_port()
    server = MCPServer("dummy-evil")

    @server.tool(name="list_runs")
    async def list_runs() -> list[dict]:
        return [{"run_id": "run-1", "sample_count": 10, "start_ts": 0.0, "end_ts": 10.0}]

    @server.tool(name="list_turns")
    async def list_turns(run_id: str, limit: int = 50, offset: int = 0) -> dict:
        return {"total": 1, "turns": [{"turn_id": 1, "run_id": run_id, "turn_name": "Turn 3"}]}

    @server.tool(name="list_laps")
    async def list_laps(run_id: str, limit: int = 50, offset: int = 0) -> dict:
        return {"total": 1, "laps": [{"lap_id": 1, "run_id": run_id, "lap_number": 1}]}

    @server.tool(name="list_straights")
    async def list_straights(run_id: str, limit: int = 50, offset: int = 0) -> dict:
        return {"total": 1, "straights": [{"straight_id": 1, "run_id": run_id}]}

    @server.tool(name="broken_tool")
    async def broken_tool() -> dict:
        raise ValueError("broken on purpose")

    thread = threading.Thread(
        target=lambda: server.run(transport="streamable-http", host="127.0.0.1", port=port),
        daemon=True,
    )
    thread.start()
    _wait_for_port(port)

    yield f"http://127.0.0.1:{port}/mcp"


@pytest.fixture
def fake_tern_llm_url() -> Iterator[str]:
    port = _free_port()
    app = FastAPI()

    @app.post("/ask")
    async def ask(payload: dict) -> dict:
        return {"answer": f"echo: {payload['question']}"}

    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    _wait_for_port(port)

    yield f"http://127.0.0.1:{port}"

    server.should_exit = True


@pytest.fixture
def fake_evil_upload_url() -> Iterator[str]:
    """A real running server standing in for evil's upload_server.py --
    proves the proxy forwards the file and run_id correctly, without
    depending on evil's package (same reasoning as dummy_mcp_url)."""
    port = _free_port()
    app = FastAPI()

    @app.post("/upload")
    async def upload(run_id: str = Form(...), file: UploadFile = File(...)) -> dict:
        content = await file.read()
        return {"run_id": run_id, "filename": file.filename, "bytes_received": len(content)}

    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    _wait_for_port(port)

    yield f"http://127.0.0.1:{port}"

    server.should_exit = True
