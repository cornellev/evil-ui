from fastapi.testclient import TestClient

from evil_ui_backend.main import create_app


def test_upload_proxies_file_and_run_id_to_the_real_upstream(
    dummy_mcp_url, fake_tern_llm_url, fake_evil_upload_url
):
    app = create_app(mcp_url=dummy_mcp_url, tern_llm_url=fake_tern_llm_url, upload_url=fake_evil_upload_url)
    client = TestClient(app)

    resp = client.post(
        "/upload",
        data={"run_id": "run-42"},
        files={"file": ("recording.csv", b"global_ts,gps.lat,gps.long\n0,1,2\n", "text/csv")},
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["run_id"] == "run-42"
    assert body["filename"] == "recording.csv"
    assert body["bytes_received"] == len(b"global_ts,gps.lat,gps.long\n0,1,2\n")


def test_upload_returns_502_when_evil_upload_service_is_unreachable(dummy_mcp_url, fake_tern_llm_url):
    app = create_app(mcp_url=dummy_mcp_url, tern_llm_url=fake_tern_llm_url, upload_url="http://127.0.0.1:1")
    client = TestClient(app)

    resp = client.post(
        "/upload",
        data={"run_id": "run-1"},
        files={"file": ("recording.csv", b"data", "text/csv")},
    )

    assert resp.status_code == 502
