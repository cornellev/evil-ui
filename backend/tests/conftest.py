"""Dummy MCP server (not evil's real one -- same reasoning as
tern-llm/tests/conftest.py: this repo's tests should prove its own plumbing,
not re-verify evil's tool logic) and a fake tern-llm upstream, both real
running servers in background threads, not mocks.
"""

from __future__ import annotations

import os
import shutil
import socket
import subprocess
import threading
import time
from collections.abc import Iterator
from pathlib import Path

import pytest
import uvicorn
from fastapi import FastAPI, File, Form, UploadFile
from mcp.server.mcpserver import MCPServer

from evil_ui_backend.main import create_app

FRONTEND_DIR = Path(__file__).resolve().parents[2] / "frontend"


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
        """Every field RunDetail.tsx's turns table renders (start_ts.toFixed(),
        entry/exit speed with no null-guard on undefined) -- the frontend
        e2e test in test_frontend_e2e.py renders this for real in a browser,
        so an incomplete stub here surfaces as a real page error, not a
        silently-passing test."""
        return {
            "total": 1,
            "turns": [
                {
                    "turn_id": 1,
                    "run_id": run_id,
                    "turn_name": "Turn 3",
                    "start_ts": 40.0,
                    "end_ts": 42.0,
                    "entry_speed": 9.0,
                    "exit_speed": 9.5,
                }
            ],
        }

    @server.tool(name="list_laps")
    async def list_laps(run_id: str, limit: int = 50, offset: int = 0) -> dict:
        return {
            "total": 1,
            "laps": [
                {
                    "lap_id": 1,
                    "run_id": run_id,
                    "lap_number": 1,
                    "start_ts": 0.0,
                    "end_ts": 60.0,
                    "turn_count": 3,
                    "energy_wh": 120.5,
                    "avg_speed": 8.2,
                }
            ],
        }

    @server.tool(name="list_straights")
    async def list_straights(run_id: str, limit: int = 50, offset: int = 0) -> dict:
        return {
            "total": 1,
            "straights": [
                {
                    "straight_id": 1,
                    "run_id": run_id,
                    "start_ts": 10.0,
                    "end_ts": 20.0,
                    "entry_speed": 8.0,
                    "exit_speed": 9.0,
                    "avg_speed": 8.5,
                    "energy_wh": 30.0,
                }
            ],
        }

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
        """rows_ingested/classifiers_advanced_to_seq match the real
        upload_server.py's response shape (see evil's own e2e scripts) --
        the frontend's UploadRecording.tsx renders rows_ingested, so a
        browser test needs this fixture to speak that shape, not just the
        run_id/filename/bytes_received this file's own test asserts on."""
        content = await file.read()
        return {
            "run_id": run_id,
            "filename": file.filename,
            "bytes_received": len(content),
            "rows_ingested": 1,
            "classifiers_advanced_to_seq": {"turns": 1, "laps": 1, "straights": 1},
        }

    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    _wait_for_port(port)

    yield f"http://127.0.0.1:{port}"

    server.should_exit = True


@pytest.fixture
def running_backend_url(
    dummy_mcp_url: str, fake_tern_llm_url: str, fake_evil_upload_url: str
) -> Iterator[str]:
    """The real backend app (create_app()), running for real in a background
    thread against the dummy/fake upstreams above -- what the Playwright
    tests in test_frontend_e2e.py point a real browser at."""
    port = _free_port()
    app = create_app(mcp_url=dummy_mcp_url, tern_llm_url=fake_tern_llm_url, upload_url=fake_evil_upload_url)
    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    _wait_for_port(port)

    yield f"http://127.0.0.1:{port}"

    server.should_exit = True


@pytest.fixture
def running_frontend_url(running_backend_url: str) -> Iterator[str]:
    """The real frontend, served by vite's own dev server (not a production
    build -- VITE_API_BASE_URL is read the same way at dev-server start,
    and a dev server starts far faster than `vite build` for every test
    run) pointed at running_backend_url."""
    port = _free_port()
    env = {**os.environ, "VITE_API_BASE_URL": running_backend_url}
    process = subprocess.Popen(
        ["bun", "run", "dev", "--", "--port", str(port), "--strictPort"],
        cwd=FRONTEND_DIR,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        _wait_for_port(port, timeout_s=20.0)
        yield f"http://127.0.0.1:{port}"
    finally:
        process.terminate()
        process.wait(timeout=5)


def chromium_launch_kwargs() -> dict:
    """Prefer an explicit system Chromium when one exists: Playwright's own
    bundled browser segfaults under at least one sandboxed dev environment
    this was built in (`--no-sandbox` and all), while the system install
    works fine there. On a normal dev machine with `playwright install`
    already run, this only takes effect if PLAYWRIGHT_CHROMIUM_PATH is set
    or one of the paths below happens to exist -- otherwise Playwright's
    own default resolution is used unchanged."""
    path = os.getenv("PLAYWRIGHT_CHROMIUM_PATH")
    if not path:
        for candidate in ("/usr/bin/chromium-browser", "/usr/bin/chromium", "/snap/bin/chromium"):
            if shutil.which(candidate) or os.path.exists(candidate):
                path = candidate
                break
    if path:
        return {"executable_path": path, "args": ["--no-sandbox"]}
    return {}
