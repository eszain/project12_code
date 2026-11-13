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

**Version 0.3 (beta).** New in this version:
- **Near-miss player** in the centre of `/dashboard`: a plain-language verdict ("Safe pass", "Too close: a maneuver may be needed"), play / pause / reset, a scrub bar, Slower / Normal / Faster, and a clearly labelled "What if they hit? (imaginary)" burst. Built with GSAP and SVG.
- **Left sidebar:** load sample data, run risk analysis, load your own CDM files, add test events, the import report, and the event list (one row per event).
- **Right sidebar:** the chosen event in the operator or specialist view, with the original CDM fields (read-only).
- **Notifications:** alert rules, an outbox with delivery status, and mute / snooze. Delivery is a local simulation only; no email or webhook is sent.
- **Risk checks:** probability level, trend, confidence and time to act for each event.
- **Saved session:** events survive a page refresh (IndexedDB in your browser). **Reset** clears them.
- A CDM Pc of exactly 0 is shown as "less than 0.0000001%", never "0%".

Still experimental: the recalculated Pc has not been validated against NASA CARA reference cases. Severity always comes from the source Pc in the CDM.

| Route | What it shows |
|---|---|
| `/` | Landing page: 3D Earth with orbits, feature overview, **Open Dashboard** |
| `/dashboard` | The visual dashboard (v0.3 beta): data and event list on the left, near-miss player in the centre, event details on the right |
| `/old-dashboard` | The v0.2.5 console: Operator / Specialist views, CDM history and trend charts, plain-language explanation |
| `/events`, `/analysis`, `/alerts` | Placeholder pages for planned features |

Same workflow as the Python app, but the core logic (parser, grouping, severity, experimental Pc, maneuver trade, alerts) is a TypeScript port that runs in the browser tab. Nothing is stored or sent anywhere; refresh or **Reset** clears it. UI: Next.js 16, Tailwind, a dark console design, and a three.js Earth on the landing page.


```
cd web
npm install
npm run dev        # http://localhost:3000
npm test           # port checked against the Python Pc results, plus click-through UI tests
npm run build
```

On `/old-dashboard`, press **1. Load data**: the 9 bundled sample CDMs (`web/public/fixtures`, re-dated to now) load one at a time, oldest first. The six reconstructed SCISAT 1 CDMs form two encounters and the three synthetic CADS TEST CDMs form a third. Then press **2. Run risk analysis** for the severity of each event. The **Operator view** shows only TCA, miss distance, Pc and a one-line call summary; the **Specialist view** adds the radial / in-track / cross-track split, last observations, position uncertainty, and, after clicking an event, its CDM history, trend charts and explanation. **Reset** clears everything.

On Windows, run the tests from a shell whose path starts with an upper-case drive letter (for example PowerShell in `C:\...`); with a lower-case `c:` path Vitest loads twice and every suite fails.

On `/dashboard`, press **Load sample data** in the left sidebar, then choose an event to play its pass.

**Deploy to Vercel:** import the repo and set *Root Directory* to `project12_code/web`. No environment variables or backend are needed.

Differences from the Python app: alerts appear in an in-page list (download as `alerts.jsonl`); email/webhook delivery, persistence and live Space-Track access are not possible in a browser-only app. Timestamps are millisecond precision (JS `Date`). The Python app remains the reference implementation and the path to a real backend.

Third-party assets: the Earth textures are credited in `web/public/assets/earth/README.md` (NASA Blue Marble and three.js example textures).

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
