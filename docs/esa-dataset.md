# ESA Kelvins sample

The [Kelvins collision-avoidance challenge](https://kelvins.esa.int/collision-avoidance-challenge/data/) publishes a training CSV of conjunction messages. CADS can show the first 8 events from that file. The CSV and the converted JSON stay on your computer. Neither is committed: the dataset has no licence.

Use `train_data.csv`, not `test_data.csv`. On the challenge page, `risk` in the test set is the value a model is supposed to predict, so those rows have no collision probability to show.

## What one row becomes

Each row is one CDM. `event_id` is one encounter. The target columns (`t_`) are the ESA satellite, stored as SAT1. The chaser columns (`c_`) are the other object, stored as SAT2. The file has no calendar date and no NORAD designator.

| CSV column | CDM field |
| --- | --- |
| `time_to_tca` (days) | `CREATION_DATE` = shared TCA minus this many days |
| shared anchor | `TCA` = `2026-12-01T00:00:00.000Z` for every event |
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

Designators include `event_id` on purpose. CADS groups messages by the unordered pair of designators and a TCA within 60 seconds. It does not read `event_id`. Every ESA event in this sample shares one TCA, and many share a mission, so designators without the event id would collapse those encounters into one.

Absolute position and velocity are not written. The sample has none. Recalculated probability needs a state vector, so that calculation stays off. Severity still follows the probability that came in the row. Charts and the 2D pass use miss distance, the relative RTN vectors, creation time, TCA, and that source probability.

The first local run prints the minimum `risk` in the file. The default floor is `-30`. If the printed minimum is lower, run the script again with `--pc-floor` set to that minimum so the clipped rows stay at Pc `0`.

## Commands

From the repository root, after you download `train_data.zip` from the Kelvins data page:

```powershell
New-Item -ItemType Directory -Force data\esa | Out-Null
# Unzip train_data.zip so the CSV is data\esa\train_data.csv
python scripts/esa_to_cdm.py
```

```bash
mkdir -p data/esa
# unzip train_data.zip so the CSV is data/esa/train_data.csv
python scripts/esa_to_cdm.py
```

The script writes one JSON file per CDM, plus `manifest.json`, into `web/public/esa-sample/`. Then open the dashboard and choose **Load ESA sample**. Messages arrive oldest first, five at a time, with a short pause between batches. The status line reads `Loading ESA CDM 6 of N`. If the folder is missing, the status line tells you to run this script.

Optional flags: `--events 8`, `--pc-floor -30`, `--tca 2026-12-01T00:00:00.000Z`, and a CSV path if the file is not at `data/esa/train_data.csv`.
