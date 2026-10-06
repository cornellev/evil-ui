from fastapi.testclient import TestClient

from evil_ui_backend.main import create_app


def _client(dummy_mcp_url, fake_tern_llm_url, upload_url):
    return TestClient(create_app(mcp_url=dummy_mcp_url, tern_llm_url=fake_tern_llm_url, upload_url=upload_url))


def test_multi_file_upload_is_streamed_through_intact(dummy_mcp_url, fake_tern_llm_url, fake_evil_upload_url):
    client = _client(dummy_mcp_url, fake_tern_llm_url, fake_evil_upload_url)
    big = b"\x00\x01" * 400_000

    resp = client.post(
        "/recordings",
        data={"label": "garage", "category": "testing"},
        files=[
            ("files", ("bag_1/bag_1_0.db3", big, "application/octet-stream")),
            ("files", ("bag_1/metadata.yaml", b"x: 1", "text/yaml")),
        ],
    )

    assert resp.status_code == 201
    body = resp.json()
    assert body["files"] == 2 and body["total_bytes"] == len(big) + 4
    assert body["names"] == ["bag_1/bag_1_0.db3", "bag_1/metadata.yaml"]
    assert body["label"] == "garage" and body["category"] == "testing"


def test_catalog_reads_and_edits_pass_through(dummy_mcp_url, fake_tern_llm_url, fake_evil_upload_url):
    client = _client(dummy_mcp_url, fake_tern_llm_url, fake_evil_upload_url)
    created = client.post(
        "/recordings", data={"category": "testing"}, files=[("files", ("a.csv", b"a,b\n", "text/csv"))]
    ).json()

    listed = client.get("/recordings", params={"category": "testing"})
    assert listed.status_code == 200 and [r["recording_id"] for r in listed.json()] == [created["recording_id"]]
    assert client.get("/recordings", params={"category": "competition"}).json() == []
    assert client.get(f"/recordings/{created['recording_id']}").json()["files"] == 1

    patched = client.patch(f"/recordings/{created['recording_id']}", json={"label": "renamed"})
    assert patched.status_code == 200 and patched.json()["label"] == "renamed"
    assert client.get("/recordings/missing").status_code == 404
    assert client.patch("/recordings/missing", json={"label": "x"}).status_code == 404


def test_recordings_return_502_when_evil_upload_service_is_unreachable(dummy_mcp_url, fake_tern_llm_url):
    client = _client(dummy_mcp_url, fake_tern_llm_url, "http://127.0.0.1:1")

    assert client.get("/recordings").status_code == 502
    posted = client.post("/recordings", files=[("files", ("a.csv", b"x", "text/csv"))])
    assert posted.status_code == 502
