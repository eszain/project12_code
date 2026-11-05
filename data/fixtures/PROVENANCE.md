# Fixture provenance

| Folder | What it is |
|---|---|
| `reconstructed/` | NOT the CSA/Space-Track originals. Creation time (to the minute), TCA (to the second), source Pc, SCISAT 1 identity and the A/B grouping come from Progress Report 1 Appendix A. Everything else (seconds, miss vectors, covariances, state vectors, OD stats, debris catalogue number 99999) is a placeholder. Miss distances are solved so the recalculated Pc equals the source Pc, so that agreement is **by construction and is not validation**. The two "Pc = 0" messages are given tiny positive placeholder geometry. |
| `synthetic/` | Fictitious objects (99901/99902) with high-risk Pc to exercise alerts. Their "source" Pc is CADS's own calculation. |
| `kvn/` | Synthetic CCSDS KVN version of one synthetic message (second adapter test). |
| `invalid/` | Negative tests derived from a reconstructed file. |

Every JSON fixture carries a `_FIXTURE_NOTE` field. Regenerate with `scripts/build_fixtures.py`. Reconstructed and synthetic data must never be presented as CSA data.
