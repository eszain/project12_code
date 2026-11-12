# NASA CARA tools: what they are and what we can reuse

**Status:** review for the Nov 13 meeting with CSA. Sources are listed at the bottom. Items marked *to confirm* are things I could not verify from public pages.

## What CARA publishes

NASA's Conjunction Assessment Risk Analysis (CARA) team publishes software development kits (SDKs) for its key algorithms on GitHub: [nasa/CARA_Analysis_Tools](https://github.com/nasa/CARA_Analysis_Tools).

- **Not a finished product.** NASA says the SDKs are the building blocks needed to recode an algorithm, not a stand-alone, packaged tool.
- **What each SDK contains:** MATLAB source for the algorithm and its supporting routines, a simple driver, test cases with expected results, and documentation.
- **Technical papers** are archived in the repository's `technical_papers` folder.

### Algorithms listed

| Tool | What it does | Useful to CADS? |
|---|---|---|
| 2D Pc (Foster and Estes, 1992), with a fast alternative (Elrod) | Probability of collision from two state estimates and covariances | **Yes.** Same family as our recalculation. Their test cases can check ours. |
| 3D Pc | Pc when the 2D short-encounter assumption does not hold | Later, if CSA needs it |
| Monte Carlo Pc from TCA | Sampling-based Pc, used as a cross-check | Later, as a cross-check |
| Collision Consequence | Estimates how much debris a collision would make | Not in scope for now |
| Single Covariance Maximum Pc | Pc when only one object has a usable covariance | Maybe, for CDMs with missing covariance |
| Covariance Realism Assessment | Checks whether reported uncertainties are realistic | Maybe, for data-quality checks |

(Names from NASA's CARA software page and the NASA software catalog.)

## What CADS does today

| Area | In CADS now | Status |
|---|---|---|
| 2D Pc | `web/src/lib/cads/pc.ts`: projects the relative position and combined covariance onto the encounter plane and integrates over the combined hard-body circle (Foster-style, numerical) | Matches the source Pc within 1% for the three synthetic CDMs and the SCISAT 1 pass A (a test checks the synthetic ones). **Experimental, not validated against CARA.** |
| Miss against uncertainty | `details.ts`: miss distance compared with the combined uncertainty along the miss direction | Our own reading aid. Not a CARA output. |
| Maneuver study | `maneuver.ts`: impulsive burn, Clohessy-Wiltshire displacement, propellant | Prototype, not on screen. Fidelity not agreed with CSA. |
| Severity | `severity.ts`: bands from the source Pc, never from our recalculation | Action limit 1 × 10⁻⁴ from CSA. Watch limit 1 × 10⁻⁷ is our assumption. |

## What we can reuse

1. **Test cases and expected results.** The most useful part. Run each 2D Pc test case through our function and compare. If it agrees within an agreed tolerance, we can say "validated against NASA's reference cases". This is backlog item B35.
2. **The algorithm descriptions and papers**, as the written reference for our own TypeScript code.
3. **Later:** the 3D and Monte Carlo methods as cross-checks.

## What we cannot just drop in

- **It is MATLAB.** Our app runs in the browser, so we would re-implement the algorithm in TypeScript (as we did for 2D Pc), not call the MATLAB code. Running MATLAB or Octave on a server is possible but is a different architecture from today.
- **Licence.** The repository carries a NASA Open Source Agreement file (NOSA). Before copying any code or test data into our repository, check that its terms fit the licence we choose for the project (an open item in the report).
- **Maneuver tool: to confirm.** Patrick said on Nov 6 that a free NASA toolset on GitHub outputs the data for maneuver trade-space plots. I could not confirm a maneuver tool in the public SDK list. This is on the questions list for Patrick.

## Why the CARA methods are not yet the source of any rating

- Severity uses the **source Pc in each CDM**, as CSA does. Our recalculation is labelled experimental and shown beside it, never in place of it.
- Before we rely on any recalculated value, CSA should confirm the reference method and the tolerance (open decisions 3 and 4 in the report, section E.4).

## Proposed next steps

1. Download the CARA 2D Pc SDK test cases and compare our `pcCircle` against them (B35).
2. Write the comparison as a table in the report (which cases, our value, NASA's value, difference).
3. Ask Patrick which tool he meant for maneuver trade-space data.
4. Confirm the licence position with the supervisor before copying anything.

## Sources

- NASA CARA, [Publicly available CARA software](https://www.nasa.gov/cara/publicly-available-cara-software/)
- NASA Software Catalog, [CARA SDK: Two-Dimension Probability of Collision (GSC-18016-1)](https://software.nasa.gov/software/GSC-18016-1)
- GitHub, [nasa/CARA_Analysis_Tools](https://github.com/nasa/CARA_Analysis_Tools) (repository page not opened directly; contents taken from the NASA pages above)
- CSA meeting, Nov 6, 2026 (meeting summary in `Meeting Files/NovMeetings/6Nov`)
