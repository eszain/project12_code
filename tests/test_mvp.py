"""MVP acceptance tests (AC01-AC03, AC06) against the reconstructed fixtures."""

from __future__ import annotations

import itertools
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from cads.api import create_app
from cads.cdm.parser import parse_document
from cads.config import Settings
from cads.correlation import group_messages

FIX = Path(__file__).resolve().parent.parent / "data" / "fixtures"
RECON = sorted((FIX / "reconstructed").glob("*.json"))
EXPECTED_PC = {1: "1.009416E-06", 2: "2.885737E-08", 3: "7.665263E-09", 4: "0", 5: "7.854690E-07", 6: "0"}
GROUPS = {frozenset({"cdm_set_1.json", "cdm_set_4.json"}), frozenset({"cdm_set_2.json", "cdm_set_3.json", "cdm_set_5.json", "cdm_set_6.json"})}


def _cdms():
    return {p.name: parse_document(p.read_bytes(), p.name)[0].cdm for p in RECON}


def test_ac01_two_encounters_in_every_file_order():
    cdms = _cdms()
    assert len(cdms) == 6
    for order in itertools.permutations(cdms):  # all 720 orders
        msgs = [(n, cdms[n].sat1.designator, cdms[n].sat2.designator, cdms[n].tca) for n in order]
        assert {frozenset(g) for g in group_messages(msgs, 60)} == GROUPS


def test_ac02_pc_text_preserved_and_zero_distinct():
    cdms = _cdms()
    for n, raw in EXPECTED_PC.items():
        c = cdms[f"cdm_set_{n}.json"]
        assert c.pc_raw == raw
    assert cdms["cdm_set_4.json"].pc == 0.0 and cdms["cdm_set_4.json"].pc is not None


def test_invalid_inputs_rejected_with_reasons():
    for p in (FIX / "invalid").iterdir():
        results = parse_document(p.read_bytes(), p.name)
        assert not any(r.ok for r in results), p.name
        assert all(r.errors for r in results)


def test_kvn_adapter_matches_json_values():
    kvn = parse_document((FIX / "kvn" / "synthetic_high_risk_3.kvn").read_bytes())[0].cdm
    js = parse_document((FIX / "synthetic" / "synthetic_high_risk_3.json").read_bytes())[0].cdm
    assert (kvn.tca, kvn.pc_raw, kvn.miss_distance_m) == (js.tca, js.pc_raw, js.miss_distance_m)


@pytest.fixture()
def client(tmp_path):
    s = Settings(database_url="sqlite:///" + (tmp_path / "t.db").as_posix(), notification_dir=tmp_path / "n",
                 clock="2026-02-26T15:00:00Z", dispatcher_enabled=False, retry_base_s=0.0)
    with TestClient(create_app(s)) as c:
        c.settings = s
        yield c


def test_api_import_events_and_idempotent_reimport(client):
    r = client.post("/api/import/fixtures/reconstructed").json()
    assert r["counts"] == {"imported": 6, "duplicate": 0, "rejected": 0, "filtered": 0}
    events = client.get("/api/events").json()
    assert sorted(e["revision_count"] for e in events) == [2, 4]
    assert client.post("/api/import/fixtures/reconstructed").json()["counts"]["duplicate"] == 6
    big = next(e for e in events if e["revision_count"] == 4)
    detail = client.get(f"/api/events/{big['id']}").json()
    assert [r["pc"]["raw"] for r in detail["revisions"]] == ["7.854690E-07", "2.885737E-08", "7.665263E-09", "0"]
    assert client.get(f"/api/events/{big['id']}/analysis").json()["recalculation"]["available"]


def test_ac03_alerts_match_only_qualifying_no_duplicates_and_retry(client):
    rule = {"name": "Pc>=1e-4", "pc_min": 1e-4, "channels": [{"type": "file", "target": "a.jsonl"}], "actor": "t"}
    assert client.post("/api/rules", json=rule).status_code == 201
    client.post("/api/import/fixtures/reconstructed")
    assert client.get("/api/alerts").json() == []  # all sample Pc < 1e-4
    client.post("/api/import/fixtures/synthetic")
    client.post("/api/import/fixtures/synthetic")  # repeat import
    alerts = client.get("/api/alerts").json()
    assert len(alerts) == 2  # only the two synthetic CDMs with Pc >= 1e-4; none duplicated
    client.post("/api/alerts/dispatch")
    lines = (client.settings.notification_dir / "a.jsonl").read_text().splitlines()
    assert len(lines) == 2 and json.loads(lines[0])["revision"]["pc_source"]
    client.post("/api/alerts/dispatch")
    assert len((client.settings.notification_dir / "a.jsonl").read_text().splitlines()) == 2  # sent never re-sent


def test_failed_delivery_is_retried_then_recorded(client):
    bad = {"name": "w", "pc_min": 1e-4, "channels": [{"type": "webhook", "target": "http://127.0.0.1:9/x"}], "actor": "t"}
    client.post("/api/rules", json=bad)
    client.post("/api/import/fixtures/synthetic")
    for _ in range(client.settings.max_delivery_attempts + 1):
        client.post("/api/alerts/dispatch")
    d = client.get("/api/alerts").json()[0]["deliveries"][0]
    assert d["status"] == "dead" and d["attempts"] == client.settings.max_delivery_attempts and d["last_error"]


def test_maneuver_trade_study_is_decision_support_only(client):
    client.post("/api/import/fixtures/synthetic")
    ev = client.get("/api/events").json()[0]
    body = {"candidates": [{"label": "small in-track", "dv_intrack_ms": 0.05, "lead_time_h": 12}],
            "spacecraft_mass_kg": 500, "isp_s": 220, "propellant_available_kg": 5}
    r = client.post(f"/api/events/{ev['id']}/maneuver", json=body).json()
    assert r["issues_commands"] is False and r["assumptions"] and r["limitations"]
    assert r["candidates"][0]["miss_distance_m"] != r["baseline"]["miss_distance_m"]


def test_demo_scenario_is_upcoming_relative_to_now_and_alerts(tmp_path):
    s = Settings(database_url="sqlite:///" + (tmp_path / "d.db").as_posix(), notification_dir=tmp_path / "n", dispatcher_enabled=False)
    with TestClient(create_app(s)) as c:  # default clock = system, no .env
        r = c.post("/api/import/demo").json()
        assert r["counts"]["imported"] == 9 and r["counts"]["rejected"] == 0
        events = c.get("/api/events").json()
        assert len(events) == 3 and all(0 < e["hours_to_tca"] < 24 for e in events)
        assert len(c.get("/api/alerts").json()) == 2
        assert c.post("/api/import/demo").json()["counts"]["duplicate"] == 9


def test_empty_start_then_load_analyze_reset(tmp_path):
    s = Settings(database_url="sqlite:///" + (tmp_path / "e.db").as_posix(), notification_dir=tmp_path / "n", dispatcher_enabled=False)
    with TestClient(create_app(s)) as c:
        assert c.get("/api/events").json() == []
        c.post("/api/import/demo")
        res = c.post("/api/analyze").json()
        assert len(res) == 3 and all(v["why"] for v in res.values())
        assert sorted(v["severity"] for v in res.values()) == ["ACTION", "ZERO", "ZERO"]
        c.post("/api/reset")
        assert c.get("/api/events").json() == [] and c.post("/api/analyze").json() == {}
    with TestClient(create_app(s)) as c2:  # restarting the server starts empty again
        c2.post("/api/import/demo")
    with TestClient(create_app(s)) as c3:
        assert c3.get("/api/events").json() == []
