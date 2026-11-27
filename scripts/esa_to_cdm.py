#!/usr/bin/env python3
"""Turn a local ESA Kelvins training CSV into CDM JSON for the dashboard.

Reads data/esa/train_data.csv by default and writes the first 8 events, oldest
message first, to web/public/esa-sample/. Both folders are gitignored. The
formulas match web/src/lib/cads/esa.ts. This script never prints a data row.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import OrderedDict
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CSV = ROOT / "data" / "esa" / "train_data.csv"
DEFAULT_OUT = ROOT / "web" / "public" / "esa-sample"
DEFAULT_TCA = "2026-12-01T00:00:00.000Z"
DEFAULT_FLOOR = -30.0
DEFAULT_EVENTS = 8

STATE_KEYS = {
    "SAT1_X",
    "SAT1_Y",
    "SAT1_Z",
    "SAT1_X_DOT",
    "SAT1_Y_DOT",
    "SAT1_Z_DOT",
    "SAT2_X",
    "SAT2_Y",
    "SAT2_Z",
    "SAT2_X_DOT",
    "SAT2_Y_DOT",
    "SAT2_Z_DOT",
}


def cell(row: dict[str, str], key: str) -> str | None:
    raw = row.get(key)
    if raw is None:
        return None
    text = raw.strip()
    if not text or text.lower() == "null":
        return None
    return text


def number(row: dict[str, str], key: str) -> float | None:
    text = cell(row, key)
    if text is None:
        return None
    try:
        value = float(text)
    except ValueError:
        return None
    if value != value or value in (float("inf"), float("-inf")):
        return None
    return value


def sci(value: float) -> str:
    if value == 0:
        return "0"
    return f"{value:.6E}"


def collision_probability(risk_text: str | None, floor: float) -> str | None:
    if risk_text is None:
        return None
    text = risk_text.strip()
    if not text or text.lower() == "null":
        return None
    try:
        risk = float(text)
    except ValueError:
        return None
    if risk <= floor:
        return "0"
    if risk.is_integer() and -15 <= risk < 0:
        return "0." + ("0" * (int(-risk) - 1)) + "1"
    pc = 10 ** risk
    if not pc > 0:
        return "0"
    return sci(pc)


def add_covariance(out: dict[str, str], prefix: str, src: str, row: dict[str, str]) -> None:
    sigma_r = number(row, f"{src}_sigma_r")
    sigma_t = number(row, f"{src}_sigma_t")
    sigma_n = number(row, f"{src}_sigma_n")
    if sigma_r is None or sigma_t is None or sigma_n is None:
        return
    ct_r = number(row, f"{src}_ct_r") or 0.0
    cn_r = number(row, f"{src}_cn_r") or 0.0
    cn_t = number(row, f"{src}_cn_t") or 0.0
    terms = {
        "CR_R": sigma_r * sigma_r,
        "CT_T": sigma_t * sigma_t,
        "CN_N": sigma_n * sigma_n,
        "CT_R": ct_r * sigma_t * sigma_r,
        "CN_R": cn_r * sigma_n * sigma_r,
        "CN_T": cn_t * sigma_n * sigma_t,
    }
    for name, value in terms.items():
        out[f"{prefix}_{name}"] = sci(value)
        out[f"{prefix}_{name}_UNIT"] = "m**2"
    out[f"{prefix}_COVARIANCE_METHOD"] = "CALCULATED"


def copy_measure(out: dict[str, str], row: dict[str, str], source: str, target: str, unit: str) -> None:
    text = cell(row, source)
    if text is None or number(row, source) is None:
        return
    out[target] = text
    out[f"{target}_UNIT"] = unit


def row_to_cdm(row: dict[str, str], tca: datetime, floor: float) -> dict[str, str] | None:
    event_id = cell(row, "event_id")
    mission_id = cell(row, "mission_id")
    lead_text = cell(row, "time_to_tca")
    lead = number(row, "time_to_tca")
    miss = cell(row, "miss_distance")
    if not event_id or not mission_id or lead is None or lead_text is None or not miss:
        return None
    creation = tca - timedelta(days=lead)
    object_type = cell(row, "c_object_type") or "object"
    message_id = f"ESA-{event_id}-{lead_text}"
    out = {
        "CCSDS_CDM_VERS": "1.0",
        "CREATION_DATE": creation.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
        "ORIGINATOR": "ESA",
        "MESSAGE_FOR": f"ESA mission {mission_id}",
        "MESSAGE_ID": message_id,
        "CDM_ID": message_id,
        "TCA": tca.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
        "MISS_DISTANCE": miss,
        "MISS_DISTANCE_UNIT": "m",
        "SAT1_OBJECT": "OBJECT1",
        "SAT1_OBJECT_DESIGNATOR": f"ESA-{mission_id}-{event_id}",
        "SAT1_OBJECT_NAME": f"ESA mission {mission_id}",
        "SAT1_OBJECT_TYPE": "PAYLOAD",
        "SAT2_OBJECT": "OBJECT2",
        "SAT2_OBJECT_DESIGNATOR": f"ESA-C-{event_id}",
        "SAT2_OBJECT_NAME": f"{object_type} object",
        "SAT2_OBJECT_TYPE": object_type,
        "COMMENT": "ESA Kelvins encounter. Times are measured from one fixed closest approach.",
    }
    pc = collision_probability(row.get("risk"), floor)
    if pc is not None:
        out["COLLISION_PROBABILITY"] = pc
    copy_measure(out, row, "relative_speed", "RELATIVE_SPEED", "m/s")
    copy_measure(out, row, "relative_position_r", "RELATIVE_POSITION_R", "m")
    copy_measure(out, row, "relative_position_t", "RELATIVE_POSITION_T", "m")
    copy_measure(out, row, "relative_position_n", "RELATIVE_POSITION_N", "m")
    copy_measure(out, row, "relative_velocity_r", "RELATIVE_VELOCITY_R", "m/s")
    copy_measure(out, row, "relative_velocity_t", "RELATIVE_VELOCITY_T", "m/s")
    copy_measure(out, row, "relative_velocity_n", "RELATIVE_VELOCITY_N", "m/s")
    add_covariance(out, "SAT1", "t", row)
    add_covariance(out, "SAT2", "c", row)
    if STATE_KEYS & out.keys():
        raise RuntimeError("converter wrote a state vector")
    return out


def parse_tca(text: str) -> datetime:
    return datetime.fromisoformat(text.replace("Z", "+00:00")).astimezone(timezone.utc)


def main() -> int:
    parser = argparse.ArgumentParser(description="Convert the first ESA training events into CDM JSON.")
    parser.add_argument("csv", nargs="?", default=str(DEFAULT_CSV), help="training CSV (not test_data.csv)")
    parser.add_argument("--events", type=int, default=DEFAULT_EVENTS, help="how many events to write")
    parser.add_argument("--pc-floor", type=float, default=DEFAULT_FLOOR, help="risk at or below this becomes Pc 0")
    parser.add_argument("--out", default=str(DEFAULT_OUT), help="directory for JSON files and manifest.json")
    parser.add_argument("--tca", default=DEFAULT_TCA, help="shared closest-approach time")
    args = parser.parse_args()

    csv_path = Path(args.csv)
    if not csv_path.is_file():
        print(
            f"Training CSV not found at {csv_path}.",
            "Download train_data.zip from the Kelvins collision-avoidance data page,",
            "unzip it, and place train_data.csv in data/esa/. See docs/esa-dataset.md.",
            sep="\n",
            file=sys.stderr,
        )
        return 1
    if csv_path.name.lower().startswith("test"):
        print("Use the training CSV. The test file's risk column is the value to predict.", file=sys.stderr)
        return 1

    tca = parse_tca(args.tca)
    events: OrderedDict[str, list[dict[str, str]]] = OrderedDict()
    minimum_risk: float | None = None
    skipped = 0
    with csv_path.open(newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            risk = number(row, "risk")
            if risk is not None:
                minimum_risk = risk if minimum_risk is None else min(minimum_risk, risk)
            event_id = cell(row, "event_id")
            if not event_id:
                skipped += 1
                continue
            events.setdefault(event_id, []).append(row)

    chosen = list(events.items())[: max(0, args.events)]
    written: list[tuple[float, str, dict[str, str]]] = []
    for event_id, rows in chosen:
        for row in rows:
            cdm = row_to_cdm(row, tca, args.pc_floor)
            if cdm is None:
                skipped += 1
                continue
            lead = number(row, "time_to_tca") or 0.0
            written.append((lead, event_id, cdm))
    written.sort(key=lambda item: (-item[0], item[1]))

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("*.json"):
        old.unlink()
    names: list[str] = []
    for index, (_, _, cdm) in enumerate(written, start=1):
        name = f"esa_{index:04d}.json"
        (out_dir / name).write_text(json.dumps(cdm, indent=2) + "\n", encoding="utf-8")
        names.append(name)
    manifest = {
        "source": "ESA Kelvins collision-avoidance training CSV",
        "tca": args.tca,
        "pcFloor": args.pc_floor,
        "events": len(chosen),
        "files": names,
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    print(f"events: {len(chosen)}")
    print(f"cdms: {len(names)}")
    print(f"skipped: {skipped}")
    print("minimum risk: " + ("none" if minimum_risk is None else repr(minimum_risk)))
    print(f"wrote: {out_dir}")
    if minimum_risk is not None and minimum_risk < args.pc_floor:
        print(
            f"The minimum risk is below the floor {args.pc_floor}. "
            f"Re-run with --pc-floor {minimum_risk} if that value is the dataset clip.",
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
