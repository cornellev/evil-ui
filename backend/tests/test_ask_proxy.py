from fastapi.testclient import TestClient

from evil_ui_backend.main import create_app


def test_ask_proxies_to_the_real_tern_llm_upstream(dummy_mcp_url, fake_tern_llm_url):
    app = create_app(mcp_url=dummy_mcp_url, tern_llm_url=fake_tern_llm_url)
    client = TestClient(app)

    resp = client.post("/ask", json={"question": "how was turn 3"})

    assert resp.status_code == 200
    assert resp.json() == {"answer": "echo: how was turn 3"}


def test_ask_returns_502_when_tern_llm_is_unreachable(dummy_mcp_url):
    app = create_app(mcp_url=dummy_mcp_url, tern_llm_url="http://127.0.0.1:1")
    client = TestClient(app)

    resp = client.post("/ask", json={"question": "hi"})

    assert resp.status_code == 502
