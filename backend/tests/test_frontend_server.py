"""The production frontend server (frontend/server.ts) and its /api proxy, for real: a production
`vite build` with VITE_API_BASE_URL=/api, served by `bun run server.ts`, proxying to the real
backend app. The browser tests in test_frontend_e2e.py use vite's dev server instead, which never
runs server.ts -- so without these, the path the deployed UI takes (and the one HTTPS depends on:
same origin, no http:// API address in the page) would be untested.
"""

from __future__ import annotations

import asyncio
import os
import subprocess
from collections.abc import Iterator

import httpx
import pytest
import uvicorn
from fastapi import FastAPI
from playwright.sync_api import sync_playwright

from tests.conftest import FRONTEND_DIR, _free_port, _wait_for_port, chromium_launch_kwargs

BUN_DEFAULT_IDLE_TIMEOUT_S = 10


@pytest.fixture(scope="module")
def production_bundle() -> None:
    """One production build for the module, with the bundle calling /api on its own origin."""
    subprocess.run(["bun", "run", "build"], cwd=FRONTEND_DIR, check=True, capture_output=True,
                   env={**os.environ, "VITE_API_BASE_URL": "/api"})
    bundle = "".join(p.read_text() for p in (FRONTEND_DIR / "dist" / "assets").glob("*.js"))
    assert "localhost:8080" not in bundle  # the page must not name an http:// API address


def _serve_frontend(upstream: str) -> Iterator[str]:
    port = _free_port()
    process = subprocess.Popen(["bun", "run", "server.ts"], cwd=FRONTEND_DIR,
                               env={**os.environ, "PORT": str(port), "API_UPSTREAM": upstream},
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        _wait_for_port(port, timeout_s=10.0)
        yield f"http://127.0.0.1:{port}"
    finally:
        process.terminate()
        process.wait(timeout=5)


@pytest.fixture
def frontend_url(production_bundle: None, running_backend_url: str) -> Iterator[str]:
    yield from _serve_frontend(running_backend_url)


@pytest.fixture
def slow_upstream_url() -> Iterator[str]:
    """Answers only after Bun's default idle timeout has passed, like a long Tern answer or an
    upload whose reply waits until EVIL has stored the whole file."""
    port = _free_port()
    app = FastAPI()

    @app.get("/slow")
    async def slow() -> dict:
        await asyncio.sleep(BUN_DEFAULT_IDLE_TIMEOUT_S + 2)
        return {"ok": True}

    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning"))
    import threading
    threading.Thread(target=server.run, daemon=True).start()
    _wait_for_port(port)
    yield f"http://127.0.0.1:{port}"
    server.should_exit = True


def test_api_calls_go_through_the_proxy_to_the_backend(frontend_url: str, running_backend_url: str) -> None:
    via_proxy = httpx.get(f"{frontend_url}/api/runs", timeout=10)
    direct = httpx.get(f"{running_backend_url}/runs", timeout=10)
    assert via_proxy.status_code == 200
    assert via_proxy.json() == direct.json()
    assert httpx.get(f"{frontend_url}/api/locations?x=1", timeout=10).json()[0]["name"] == "B-lot"  # query kept


def test_a_large_upload_streams_through_intact(frontend_url: str) -> None:
    size = 64 * 1024 * 1024
    response = httpx.post(f"{frontend_url}/api/recordings", data={"label": "big"},
                          files=[("files", ("big.db3", b"\0" * size, "application/octet-stream"))], timeout=120)
    assert response.status_code == 201, response.text
    assert response.json()["total_bytes"] == size
    assert response.json()["label"] == "big"


def test_a_reply_slower_than_buns_default_idle_timeout_still_arrives(production_bundle: None,
                                                                      slow_upstream_url: str) -> None:
    for url in _serve_frontend(slow_upstream_url):
        response = httpx.get(f"{url}/api/slow", timeout=30)
        assert response.status_code == 200 and response.json() == {"ok": True}


def test_an_unreachable_backend_is_a_502_not_a_hang(production_bundle: None) -> None:
    for url in _serve_frontend(f"http://127.0.0.1:{_free_port()}"):
        response = httpx.get(f"{url}/api/runs", timeout=10)
        assert response.status_code == 502


def test_client_side_routes_still_get_the_app(frontend_url: str) -> None:
    response = httpx.get(f"{frontend_url}/runs/run-1", timeout=10)
    assert response.status_code == 200 and "<div id=\"root\">" in response.text


def test_the_production_page_works_in_a_real_browser(frontend_url: str) -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, **chromium_launch_kwargs())
        try:
            page = browser.new_page()
            errors: list[str] = []
            page.on("pageerror", lambda exc: errors.append(str(exc)))
            page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
            requests: list[str] = []
            page.on("request", lambda req: requests.append(req.url))

            page.goto(frontend_url)
            page.locator("table").get_by_text("run-1", exact=True).wait_for(timeout=10_000)

            assert errors == [], f"console/page errors: {errors}"
            api_calls = [u for u in requests if "/runs" in u or "/api/" in u]
            assert api_calls and all(u.startswith(f"{frontend_url}/api/") for u in api_calls), api_calls
        finally:
            browser.close()
