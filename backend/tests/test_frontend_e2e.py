"""Real browser, real frontend (vite dev server), real backend, real (dummy)
MCP/tern-llm/upload upstreams -- replaces the manual, one-off Playwright
verification from the design write-up with something that actually runs and
fails loudly. See conftest.py's running_backend_url/running_frontend_url/
chromium_launch_kwargs for how each layer is wired up.

Locators are scoped to <table> (or use exact=True) throughout on purpose:
ChatPanel's always-visible hint text ("...how was I in turn 3 during
run-1?") contains "run-1" and "turn 3" as literal substrings, and
get_by_text() substring-matches case-insensitively by default -- an
unscoped get_by_text("run-1") silently matches that decoy text instead of
the real table cell, so the click lands nowhere and the test passes for the
wrong reason (found this the hard way: the very first version of this test
"passed" a wait_for() against the ChatPanel hint without ever navigating).
"""

from __future__ import annotations

from playwright.sync_api import expect, sync_playwright

from tests.conftest import chromium_launch_kwargs


def test_runs_list_and_detail_render_real_data(running_frontend_url: str) -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, **chromium_launch_kwargs())
        try:
            page = browser.new_page()
            errors: list[str] = []
            page.on("pageerror", lambda exc: errors.append(str(exc)))
            page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)

            page.goto(running_frontend_url)
            runs_table = page.locator("table")
            runs_table.get_by_text("run-1", exact=True).wait_for(timeout=10_000)

            runs_table.get_by_text("run-1", exact=True).click()
            expect(page).to_have_url(f"{running_frontend_url}/runs/run-1", timeout=10_000)

            detail_table = page.locator("table")
            detail_table.get_by_text("Turn 3", exact=True).wait_for(timeout=10_000)

            page.get_by_role("tab", name="Laps").click()
            detail_table.get_by_text("120.50", exact=True).wait_for(timeout=10_000)  # this lap's energy_wh

            assert errors == [], f"console/page errors while browsing: {errors}"
        finally:
            browser.close()


def test_upload_flow_reaches_the_real_proxy_chain(running_frontend_url: str) -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, **chromium_launch_kwargs())
        try:
            page = browser.new_page()
            errors: list[str] = []
            page.on("pageerror", lambda exc: errors.append(str(exc)))

            page.goto(f"{running_frontend_url}/upload")
            page.get_by_label("Run ID").fill("upload-demo")

            with page.expect_file_chooser() as chooser_info:
                page.get_by_text("Choose file").click()
            chooser_info.value.set_files(
                files=[{"name": "recording.csv", "mimeType": "text/csv", "buffer": b"seq,x\n1,2\n"}]
            )

            page.get_by_role("button", name="Upload and ingest").click()
            page.get_by_text("Ingested 1 row.", exact=True).wait_for(timeout=10_000)

            assert errors == [], f"console/page errors during upload: {errors}"
        finally:
            browser.close()
