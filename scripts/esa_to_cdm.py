#!/usr/bin/env python3
"""Turn the ESA Kelvins collision-avoidance CSVs into CDM JSON for the dashboard.

Reads data/esa/train_data.csv (and data/esa/test_data.csv when it is there) and picks a
mix of events by how the latest message of each event rates: red (Pc at or above the
action level), watch, low, and near-zero. The default is 30 events, 18 of them red.
Real red events are rare (13 of 13,154 in the training file), so the test file, which
ESA built to over-represent high-risk events, supplies more of them. Test-file events
are marked with a leading T in the event id, because the two files reuse the same ids.

Writes web/public/esa-sample/manifest.json, one file holding every message, oldest
first. The CSVs stay in data/esa/ (git-ignored). The formulas match
web/src/lib/cads/esa.ts. This script never prints a data row.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import sys
from collections import OrderedDict
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CSV = ROOT / "data" / "esa" / "train_data.csv"
DEFAULT_TEST_CSV = ROOT / "data" / "esa" / "test_data.csv"
DEFAULT_OUT = ROOT / "web" / "public" / "esa-sample"
DEFAULT_TCA = "2026-12-01T00:00:00.000Z"
DEFAULT_FLOOR = -30.0
DEFAULT_MIX = "red=18,watch=6,low=4,zero=2"
ACTION_RISK = -4.0  # log10 of the action level, Pc 1e-4
WATCH_RISK = -7.0  # log10 of the watch level, Pc 1e-7
MIN_CDMS = {"red": 6, "watch": 8, "low": 8, "zero": 8}  # enough history for the charts
BANDS = ("red", "watch", "low", "zero")

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
        "SAT1_OBJECT_NAME": f"ESA event {event_id} (mission {mission_id})",
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


def read_events(path: Path, prefix: str) -> OrderedDict[str, list[dict[str, str]]]:
    """Rows grouped by event. The prefix keeps train and test ids apart."""
    events: OrderedDict[str, list[dict[str, str]]] = OrderedDict()
    with path.open(newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            event_id = cell(row, "event_id")
            if not event_id:
                continue
            key = prefix + event_id
            row["event_id"] = key
            events.setdefault(key, []).append(row)
    return events


def latest_risk(rows: list[dict[str, str]]) -> float | None:
    """Risk of the latest message: the one with the smallest time_to_tca."""
    best: tuple[float, float] | None = None
    for row in rows:
        lead, risk = number(row, "time_to_tca"), number(row, "risk")
        if lead is None or risk is None:
            continue
        if best is None or lead < best[0]:
            best = (lead, risk)
    return None if best is None else best[1]


def band_of(risk: float, floor: float) -> str:
    if risk <= floor:
        return "zero"
    if risk >= ACTION_RISK:
        return "red"
    return "watch" if risk >= WATCH_RISK else "low"


def parse_mix(text: str) -> dict[str, int]:
    mix = {band: 0 for band in BANDS}
    for part in text.split(","):
        name, _, count = part.partition("=")
        name = name.strip()
        if name not in mix or not count.strip().isdigit():
            raise SystemExit(f"--mix must look like red=18,watch=6,low=4,zero=2 (got {text!r}).")
        mix[name] = int(count)
    return mix


def choose(sources: list[OrderedDict[str, list[dict[str, str]]]], mix: dict[str, int], floor: float):
    """Per band: events with the longest history first, taking turns between the files. Deterministic."""
    pools: dict[str, list[list[tuple[int, str, list[dict[str, str]]]]]] = {b: [[] for _ in sources] for b in BANDS}
    for index, events in enumerate(sources):
        for key, rows in events.items():
            risk = latest_risk(rows)
            if risk is None:
                continue
            band = band_of(risk, floor)
            if len(rows) >= MIN_CDMS[band]:
                pools[band][index].append((-len(rows), key, rows))
    chosen: list[tuple[str, str, list[dict[str, str]]]] = []
    shortfall: dict[str, int] = {}
    for band in BANDS:
        queues = [sorted(q, key=lambda item: (item[0], item[1])) for q in pools[band]]
        picked = 0
        while picked < mix[band] and any(queues):
            for queue in queues:
                if queue and picked < mix[band]:
                    _, key, rows = queue.pop(0)
                    chosen.append((band, key, rows))
                    picked += 1
        if picked < mix[band]:
            shortfall[band] = mix[band] - picked
    return chosen, shortfall


def main() -> int:
    parser = argparse.ArgumentParser(description="Convert a mix of ESA events into CDM JSON.")
    parser.add_argument("csv", nargs="?", default=str(DEFAULT_CSV), help="training CSV")
    parser.add_argument("--test-csv", default=str(DEFAULT_TEST_CSV), help="test CSV, used when the file exists (it has more high-risk events)")
    parser.add_argument("--mix", default=DEFAULT_MIX, help="events per band, by the latest message: red (Pc >= 1e-4), watch, low, zero")
    parser.add_argument("--pc-floor", type=float, default=DEFAULT_FLOOR, help="risk at or below this becomes a Pc too small to measure")
    parser.add_argument("--out", default=str(DEFAULT_OUT), help="directory for manifest.json")
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
        print("Pass the training CSV first; the test CSV goes in --test-csv.", file=sys.stderr)
        return 1

    mix = parse_mix(args.mix)
    sources = [read_events(csv_path, "")]
    test_path = Path(args.test_csv)
    if test_path.is_file():
        sources.append(read_events(test_path, "T"))

    chosen, shortfall = choose(sources, mix, args.pc_floor)
    for band, missing in shortfall.items():
        print(f"Only found {mix[band] - missing} of {mix[band]} {band} events.", file=sys.stderr)

    # Every message of each chosen event. A mission_id that changes inside an event would split it, because
    # the designators include it.
    tca = parse_tca(args.tca)
    written: list[tuple[float, str, dict[str, str]]] = []
    skipped = 0
    for band, key, rows in chosen:
        missions = {cell(r, "mission_id") for r in rows if cell(r, "mission_id")}
        if len(missions) > 1:
            print(f"Event {key} has more than one mission_id ({', '.join(sorted(missions))}). "
                  "CADS would split it into separate events, so the converter stops.", file=sys.stderr)
            return 1
        for row in rows:
            cdm = row_to_cdm(row, tca, args.pc_floor)
            if cdm is None:
                skipped += 1
                continue
            written.append((number(row, "time_to_tca") or 0.0, key, cdm))
    written.sort(key=lambda item: (-item[0], item[1]))

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in list(out_dir.glob("*.json")):
        old.unlink()
    names = [f"esa_{index:04d}.json" for index in range(1, len(written) + 1)]
    counts = {band: sum(1 for b, _, _ in chosen if b == band) for band in BANDS}
    manifest = {
        "source": "ESA Kelvins collision-avoidance challenge data (train_data.csv and test_data.csv)",
        "tca": args.tca,
        "pcFloor": args.pc_floor,
        "events": len(chosen),
        "eventsByLatestRating": counts,
        "files": names,
        "cdms": [cdm for _, _, cdm in written],
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, separators=(",", ":")) + "\n", encoding="utf-8")

    print(f"events: {len(chosen)} ({', '.join(f'{b} {n}' for b, n in counts.items())})")
    print(f"cdms: {len(names)}")
    print(f"skipped: {skipped}")
    print(f"wrote: {out_dir / 'manifest.json'} ({(out_dir / 'manifest.json').stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
