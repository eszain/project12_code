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

**Version 0.4.** New since v0.3, from the CSA meeting on Nov 13:
- **3D view** under the near-miss player (CesiumJS, offline imagery, no token): both objects on Earth, a dashed gap line, and a replay from 10 s before the closest approach to 10 s after, slowing as they pass. Close-up and whole-Earth cameras. Positions come from a two-body orbit propagation of each object's CDM state vector.
- **Centre layout:** Pc and miss-distance charts first (real hours before closest approach on the x-axis, with the action and watch levels), then the 2D player, then the 3D view.
- **Real data:** a 30-event slice of the ESA Collision Avoidance Challenge data (475 messages, 18 events at the action level), loaded a few messages at a time with **Load ESA sample**. See `docs/esa-dataset.md`.
- **Risk analysis:** three Pc methods (Foster, Chan and an expanded-covariance worst case) with a green / yellow / red zone, a radial-separation check, and a chart of the smallest burn against lead time. The burn study only runs for close events, and is labelled a study, never a command.
- **Users:** a demo user switcher (Admin, CSA operator, Test operator). Each user sees only the events of their subscribed satellites. These are mock users, not real login.
- **Notifications:** acknowledge a notification (who, when, a note), and choose per rule where it is recorded: in-app, mock webhook or mock email. Nothing is ever sent outside the browser.
- **Percentages only:** every probability is a percentage, and none is ever shown as zero: a very small or zero Pc reads "< 0.0000001%". The original CDM text is in **View original CDM**.

From v0.3: the near-miss player with its "What if they hit? (imaginary)" burst, the two sidebars (data and events on the left, event details on the right), alert rules with an outbox, the risk checks, and a session that survives a refresh (IndexedDB in your browser; **Reset** clears it).

Still experimental, and to confirm with CSA: the recalculated Pc has not been validated against NASA CARA reference cases; the 0.5x to 3x covariance range, the yellow-zone limits and the spacecraft mass used in the burn study are our assumptions. Severity always comes from the source Pc in the CDM.

| Route | What it shows |
|---|---|
| `/` | Landing page: 3D Earth with orbits, feature overview, **Open Dashboard** |
| `/dashboard` | The visual dashboard (v0.4): data and event list on the left; charts, near-miss player and 3D view in the centre; event details on the right |
| `/old-dashboard` | The v0.2.5 console: Operator / Specialist views, CDM history and trend charts, plain-language explanation |
| `/site-visit` | Evidence for the Fall Agile Site Visit rubric, one section per criterion, with the as-built architecture and UML diagrams (sources in `docs/diagrams`) |
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
