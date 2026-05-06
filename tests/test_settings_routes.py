import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.pop("DATABRICKS_APP_NAME", None)

import pytest
from fastapi.testclient import TestClient
from server import config_store


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(config_store, "_local_path", str(tmp_path / "app_config.json"))
    # Import app AFTER monkeypatching so config_store._local_path is already patched
    import importlib, app as app_module
    importlib.reload(app_module)
    from app import app as fastapi_app
    return TestClient(fastapi_app)


def test_get_config_returns_defaults(client):
    r = client.get("/api/settings/config")
    assert r.status_code == 200
    body = r.json()
    assert body["program_name"] == "SNAP QC Guard"
    assert isinstance(body["data_sources"], list)
    assert isinstance(body["use_cases"], list)


def test_put_config_saves_and_returns(client):
    r = client.get("/api/settings/config")
    body = r.json()
    body["program_name"] = "Kansas SNAP Guard"
    body["accent_color"] = "#3b82f6"
    r2 = client.put("/api/settings/config", json=body)
    assert r2.status_code == 200
    assert r2.json()["program_name"] == "Kansas SNAP Guard"
    r3 = client.get("/api/settings/config")
    assert r3.json()["program_name"] == "Kansas SNAP Guard"


def test_put_invalid_accent_color_returns_422(client):
    r = client.get("/api/settings/config")
    body = r.json()
    body["accent_color"] = "red"
    r2 = client.put("/api/settings/config", json=body)
    assert r2.status_code == 422
