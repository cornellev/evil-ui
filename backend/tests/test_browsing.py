from fastapi.testclient import TestClient

from evil_ui_backend.main import create_app


def _client(dummy_mcp_url, fake_tern_llm_url) -> TestClient:
    app = create_app(mcp_url=dummy_mcp_url, tern_llm_url=fake_tern_llm_url)
    return TestClient(app)


def test_healthz(dummy_mcp_url, fake_tern_llm_url):
    resp = _client(dummy_mcp_url, fake_tern_llm_url).get("/healthz")
    assert resp.status_code == 200


def test_get_runs_calls_list_runs_over_real_mcp(dummy_mcp_url, fake_tern_llm_url):
    resp = _client(dummy_mcp_url, fake_tern_llm_url).get("/runs")

    assert resp.status_code == 200
    assert resp.json() == [{"run_id": "run-1", "sample_count": 10, "start_ts": 0.0, "end_ts": 10.0,
                            "distance_m": 14346.0, "energy_wh": 300.3, "efficiency_mi_per_kwh": 29.7}]


def test_get_turns_passes_run_id_and_pagination(dummy_mcp_url, fake_tern_llm_url):
    resp = _client(dummy_mcp_url, fake_tern_llm_url).get("/runs/run-1/turns?limit=10&offset=5")

    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["turns"][0]["run_id"] == "run-1"


def test_get_laps(dummy_mcp_url, fake_tern_llm_url):
    resp = _client(dummy_mcp_url, fake_tern_llm_url).get("/runs/run-1/laps")
    assert resp.status_code == 200
    assert resp.json()["laps"][0]["lap_number"] == 1


def test_get_straights(dummy_mcp_url, fake_tern_llm_url):
    resp = _client(dummy_mcp_url, fake_tern_llm_url).get("/runs/run-1/straights")
    assert resp.status_code == 200
    assert resp.json()["total"] == 1


def test_evil_unreachable_returns_502_not_a_crash(fake_tern_llm_url):
    app = create_app(mcp_url="http://127.0.0.1:1/mcp", tern_llm_url=fake_tern_llm_url)
    resp = TestClient(app).get("/runs")

    assert resp.status_code == 502
