# CADS MVP (Project 12, ENG 4000)

Decision-support web app for conjunction assessment: ingest CDMs, group them into encounters, show revision history, alert on rules, and run experimental analysis. It does **not** command spacecraft. Source Pc values are shown exactly as reported; recalculated values are labelled experimental.

## Run (no credentials needed)

```
python -m venv .venv && .venv\Scripts\activate
pip install -r requirements-dev.txt
pytest                                   # 10 tests
python -m cads                           # starts the server and opens http://127.0.0.1:8000 (API docs at /docs)
```

The page starts empty (the database is wiped on every start; set `CADS_PERSIST=true` to keep it). Press **1. Load data** (9 sample CDMs become 3 events), then **2. Run risk analysis** to fill the Severity and Why columns. **Reset** clears everything. Copy `.env.example` to `.env` to change settings. If this folder is OneDrive-synced, point `CADS_DATABASE_URL` outside it.

## Web app (Next.js, runs entirely in the browser): `web/`

Live demo: https://project12-code.vercel.app (also https://project12code.vercel.app)

Same workflow as the Python app, but the core logic (parser, grouping, severity, experimental Pc, maneuver trade, alerts) is a TypeScript port that runs in the browser tab. Nothing is stored or sent anywhere; refresh or **Reset** clears it. UI: Next.js 16, Tailwind, shadcn and Animate UI components, light/dark/system theme toggle.

```
cd web
npm install
npm run dev        # http://localhost:3000
npm test           # 13 tests: port checked against the Python Pc results, plus a click-through UI test
npm run build
```

Press **1. Load data** (bundled sample CDMs from `web/public/fixtures`, re-dated to now), then **2. Run risk analysis** for Severity and Why, **Reset** to clear. Click a row for revisions, data quality and the maneuver study.

**Deploy to Vercel:** import the repo and set *Root Directory* to `project12_code/web`. No environment variables or backend are needed.

Differences from the Python app: alerts appear in an in-page list (download as `alerts.jsonl`); email/webhook delivery, persistence and live Space-Track access are not possible in a browser-only app. Timestamps are millisecond precision (JS `Date`). The Python app remains the reference implementation and the path to a real backend.

Licence note: Animate UI is MIT + Commons Clause (fine inside an app, not an OSI open-source licence). Decide the project licence with this in mind.

## What is built (Python app)

| Area | Where | Status |
|---|---|---|
| CDM parsing/validation (Space-Track JSON, CCSDS KVN), raw payload and Pc text preserved | `cads/cdm/` | working, tested |
| Encounter correlation (object pair + TCA window, order independent) | `cads/correlation.py`, `cads/ingest.py` | working, tested (all 720 orders) |
| Event/revision store, audit log, import report | `cads/models.py` | SQLite (PostgreSQL via URL, untested) |
| Alert rules, outbox, retries, file/log/webhook/email channels | `cads/alerts/` | file/webhook tested; email untested |
| Quality indicators, experimental 2D Pc, impulsive maneuver trade | `cads/analysis/` | prototype, **not validated** |
| REST API + minimal UI | `cads/api/`, `cads/static/` | working, minimal |
| Space-Track adapter | `cads/sources/spacetrack.py` | written, **never run live** |

Not built: accounts/organizations/RBAC (R2), API auth, 3D visualization, Pc validation against reference cases, SMS.

## Data caveat

The six original CSA CDM files are not in the repo. `data/fixtures/reconstructed/` rebuilds them from Progress Report 1 Appendix A; see `data/fixtures/PROVENANCE.md`. Regenerate with `python scripts/build_fixtures.py`. To use the real files, upload them in the UI or drop them in a folder and import.

## Open decisions (need CSA)

Correlation window (60 s assumed), Pc reference method/tolerance, maneuver fidelity, alert thresholds (1e-4 action, 1e-7 watch are assumptions), data-quality limits, licence, Space-Track access.
