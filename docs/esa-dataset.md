# ESA Kelvins sample

The [Kelvins collision-avoidance challenge](https://kelvins.esa.int/collision-avoidance-challenge/data/) publishes real conjunction messages from ESA: `train_data.csv` (162,634 messages in 13,154 events) and `test_data.csv` (24,484 messages in 2,167 events). CADS shows a **30-event slice** of them.

**Hosting.** The page states no licence and carries "Copyright © European Space Agency". This is a university project, and the team has been told that the school and CSA allow the data to be hosted for it, so the converted 30-event slice (about 840 KB) is committed in `web/public/esa-sample/` and served with the dashboard. The two source CSVs (about 320 MB) are **not** committed; they stay in `data/esa/`, which is git-ignored. If this ever becomes more than a project, check the terms with ESA first. Credit: ESA Advanced Concepts Team, Kelvins Collision Avoidance Challenge.

**Which events.** Real action-level events are rare: only 13 of the 13,154 training events end at Pc 1 in 10,000 or higher. ESA built the test file to over-represent high-risk events, and its rows do carry a `risk` value for every message (the final risk, at closest approach, is the part it holds back). So the converter picks events by how their latest message rates, taking turns between the two files, and defaults to **18 red (Pc at or above 0.01%), 6 watch, 4 low and 2 near-zero**, each with at least 6 to 8 messages so the charts have a history. Events from the test file have a leading `T` in the id (for example `T645`), because the two files reuse the same ids. The latest message of a test-file event is at least 2 days before closest approach, which is how ESA cut that file.

## What one row becomes

Each row is one CDM. `event_id` is one encounter. The target columns (`t_`) are the ESA satellite, stored as SAT1. The chaser columns (`c_`) are the other object, stored as SAT2. The file has no calendar date and no NORAD designator.

| CSV column | CDM field |
| --- | --- |
| `time_to_tca` (days) | `CREATION_DATE` = shared TCA minus this many days |
| shared anchor | `TCA` = `2026-12-01T00:00:00.000Z` for every event in the files; see below |
| `risk` | `COLLISION_PROBABILITY` = `10^risk`, stored as text |
| blank `risk` | field omitted, shown as not provided |
| `risk` at or below `-30` | `COLLISION_PROBABILITY` = `0` exactly |
| `mission_id` | SAT1 name `ESA mission <mission_id>` |
| `c_object_type` | SAT2 name `<c_object_type> object` |
| `event_id`, `mission_id` | SAT1 designator `ESA-<mission_id>-<event_id>` |
| `event_id` | SAT2 designator `ESA-C-<event_id>` |
| `miss_distance`, relative position, velocity, and speed | the same CDM fields, in metres and metres per second |
| `t_` / `c_` `sigma_r`, `sigma_t`, `sigma_n` | position variances `sigma^2` on `CR_R`, `CT_T`, `CN_N` |
| `t_` / `c_` `ct_r`, `cn_r`, `cn_t` | covariances `correlation * sigma_a * sigma_b` on `CT_R`, `CN_R`, `CN_T`, unit `m**2` |

The oldest message in an event is the one with the largest `time_to_tca`.

The dates in the files are only a fixed starting point. When you press **Load ESA sample**, CADS moves the closest approach to a week from that moment and moves each event a fixed amount earlier (up to 6 days, worked out from the event's designator), so the events always read as upcoming, at different times between 1 and 7 days away, and every event keeps the spacing between its messages. The same events get the same spread on every load. The script stops with an error if one event has more than one `mission_id`, because the designators below would split it.

Designators include `event_id` on purpose. CADS groups messages by the unordered pair of designators and a TCA within 60 seconds. It does not read `event_id`. In the files every ESA event shares one TCA, and many share a mission, so designators without the event id would collapse those encounters into one.

Absolute position and velocity are not written. The sample has none. Recalculated probability needs a state vector, so that calculation stays off. Severity still follows the probability that came in the row. Charts and the 2D pass use miss distance, the relative RTN vectors, creation time, TCA, and that source probability.

The first local run prints the minimum `risk` in the file. The default floor is `-30`. If the printed minimum is lower, run the script again with `--pc-floor` set to that minimum so the clipped rows stay at Pc `0`.

## Commands

From the repository root, after you download `train_data.zip` and `test_data.csv` from the Kelvins data page and unzip the first, so that `data/esa/train_data.csv` and `data/esa/test_data.csv` exist:

```powershell
New-Item -ItemType Directory -Force data\esa | Out-Null
python scripts/esa_to_cdm.py
```

```bash
mkdir -p data/esa
python scripts/esa_to_cdm.py
```

The script writes one file, `web/public/esa-sample/manifest.json`, holding every message oldest first (the converted slice is committed, so you only need to run it to change the selection). Then open the dashboard and choose **Load ESA sample**: the messages arrive oldest first, 10 at a time with a short pause, about 15 s in all. The status line reads `Loading ESA CDM 120 of 475`. If the file is missing, the status line tells you to run this script.

The default selection is 30 events and 475 messages. Optional flags: `--mix red=18,watch=6,low=4,zero=2` (events per band, by the latest message), `--test-csv PATH` (the script uses `data/esa/test_data.csv` when it exists, and with only the training file there are too few red events to fill the default), `--pc-floor -30`, `--tca 2026-12-01T00:00:00.000Z`, `--out DIR`, and a training CSV path if the file is not at `data/esa/train_data.csv`.
