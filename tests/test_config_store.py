import json, os, sys, tempfile, pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Patch IS_DATABRICKS_APP to False so we exercise the local path
import importlib
os.environ.pop("DATABRICKS_APP_NAME", None)

from server import config_store


def test_defaults_returned_when_file_missing(tmp_path, monkeypatch):
    monkeypatch.setattr(config_store, "_local_path", str(tmp_path / "app_config.json"))
    result = config_store.read_config()
    assert result["program_name"] == "SNAP QC Guard"
    assert result["accent_color"] == "#ef4444"
    assert isinstance(result["data_sources"], list)
    assert isinstance(result["use_cases"], list)


def test_write_then_read_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setattr(config_store, "_local_path", str(tmp_path / "app_config.json"))
    data = config_store.read_config()
    data["program_name"] = "Kansas SNAP"
    data["accent_color"] = "#3b82f6"
    saved = config_store.write_config(data)
    assert saved["program_name"] == "Kansas SNAP"
    loaded = config_store.read_config()
    assert loaded["program_name"] == "Kansas SNAP"


def test_invalid_accent_color_rejected(tmp_path, monkeypatch):
    monkeypatch.setattr(config_store, "_local_path", str(tmp_path / "app_config.json"))
    data = config_store.read_config()
    data["accent_color"] = "not-a-color"
    with pytest.raises(ValueError, match="accent_color"):
        config_store.write_config(data)


def test_missing_branding_key_rejected(tmp_path, monkeypatch):
    monkeypatch.setattr(config_store, "_local_path", str(tmp_path / "app_config.json"))
    data = config_store.read_config()
    del data["tagline"]
    with pytest.raises(ValueError, match="tagline"):
        config_store.write_config(data)


def test_data_source_missing_id_rejected(tmp_path, monkeypatch):
    monkeypatch.setattr(config_store, "_local_path", str(tmp_path / "app_config.json"))
    data = config_store.read_config()
    data["data_sources"] = [{"name": "No ID", "domain": "Healthcare"}]
    with pytest.raises(ValueError, match="data_sources"):
        config_store.write_config(data)


def test_use_case_missing_analytical_question_rejected(tmp_path, monkeypatch):
    monkeypatch.setattr(config_store, "_local_path", str(tmp_path / "app_config.json"))
    data = config_store.read_config()
    data["use_cases"] = [{"id": "uc1", "title": "No question"}]
    with pytest.raises(ValueError, match="use_cases"):
        config_store.write_config(data)
