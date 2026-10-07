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
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
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
        return [{"run_id": "run-1", "sample_count": 10, "start_ts": 0.0, "end_ts": 10.0,
                 "distance_m": 14346.0, "energy_wh": 300.3, "efficiency_mi_per_kwh": 29.7}]

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
                    "name": "Turn 3",
                    "start_ts": 40.0,
                    "end_ts": 42.0,
                    "entry_speed": 9.0,
                    "exit_speed": 9.5,
                    "avg_speed": 9.25,
                    "duration_s": 2.0,
                    "distance_m": 18.5,
                    "energy_wh": 0.4,
                    "efficiency_mi_per_kwh": 28.7,
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
                    "duration_s": 60.0,
                    "distance_m": 3787.0,
                    "efficiency_mi_per_kwh": 31.2,
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
                    "name": "Straight 6-7",
                    "duration_s": 10.0,
                    "distance_m": 664.0,
                    "efficiency_mi_per_kwh": 27.5,
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

    recordings: list[dict] = []

    @app.post("/recordings", status_code=201)
    async def create_recording(request: Request) -> dict:
        """Mirrors evil's POST /recordings response shape (catalog.py /
        upload_server.py). Reads the whole multipart body via Starlette so the
        proxy test proves the bytes arrive intact."""
        form = await request.form()
        parts = [p for p in form.getlist("files") if hasattr(p, "file")]
        sizes = [len(await p.read()) for p in parts]
        rec = {
            "recording_id": f"rec-{len(recordings) + 1}",
            "deduplicated": False,
            "files": len(parts),
            "total_bytes": sum(sizes),
            "parse_status": "pending",
            "names": [p.filename for p in parts],
            "label": form.get("label"),
            "category": form.get("category"),
            "uploaded_at": 1_700_000_000.0 + len(recordings),
            "container": "unknown",
            "car": form.get("car"),
            "event": form.get("event"),
            "notes": None, "category_method": "manual" if form.get("category") else None,
            "location_id": None, "location_method": None,
        }
        recordings.append(rec)
        return rec

    @app.get("/recordings")
    async def list_recordings(category: str | None = None) -> list[dict]:
        return [r for r in recordings if category is None or r["category"] == category]

    @app.get("/recordings/{recording_id}")
    async def get_recording(recording_id: str) -> dict:
        for r in recordings:
            if r["recording_id"] == recording_id:
                return r
        raise HTTPException(status_code=404, detail="recording not found")

    @app.patch("/recordings/{recording_id}")
    async def patch_recording(recording_id: str, changes: dict) -> dict:
        for r in recordings:
            if r["recording_id"] == recording_id:
                r.update(changes)
                if "category" in changes:      # same locking rule as evil's update_recording
                    r["category_method"] = "manual" if changes["category"] else None
                if "location_id" in changes:
                    r["location_method"] = "manual" if changes["location_id"] is not None else None
                return r
        raise HTTPException(status_code=404, detail="recording not found")

    @app.post("/recordings/{recording_id}/reparse", status_code=202)
    async def reparse(recording_id: str) -> dict:
        for r in recordings:
            if r["recording_id"] == recording_id:
                r["parse_status"] = "pending"
                return {"recording_id": recording_id, "job_id": 7, "status": "queued"}
        raise HTTPException(status_code=404, detail="recording not found")

    @app.get("/system/status")
    async def system_status() -> dict:
        """Same shape as evil's catalog.system_status()."""
        return {
            "jobs": {
                "counts": {"pending": 1, "running": 1, "done": 3, "failed": 0},
                "oldest_pending_age_sec": 4.0,
                "queue": [
                    {"job_id": 2, "recording_id": "rec-1", "kind": "parse", "lane": "deep", "status": "running",
                     "attempts": 1, "max_attempts": 2, "progress": 0.5, "error": None, "created_at": 1.0,
                     "started_at": 2.0, "finished_at": None, "name": "big bag", "size_bytes": 411_000_000},
                    {"job_id": 3, "recording_id": "rec-2", "kind": "parse", "lane": "deep", "status": "pending",
                     "attempts": 0, "max_attempts": 2, "progress": None, "error": None, "created_at": 3.0,
                     "started_at": None, "finished_at": None, "name": "small bag", "size_bytes": 1000},
                ],
            },
            "system": {"cpu_count": 8, "load_avg": [0.5, 0.4, 0.3], "mem_total_bytes": 16 * 1024**3,
                       "mem_available_bytes": 8 * 1024**3, "disk": {"total_bytes": 10**12, "free_bytes": 5 * 10**11},
                       "recordings_bytes": 10**9},
            "time": 100.0,
        }

    @app.get("/locations")
    async def locations() -> list[dict]:
        return [{"location_id": 1, "name": "B-lot", "center_lat": 42.0, "center_lon": -76.0, "radius_m": 100.0,
                 "default_category": "b_lot"}]

    @app.post("/locations", status_code=201)
    async def add_location(body: dict) -> dict:
        return {"location_id": 2, "name": body["name"]}

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
