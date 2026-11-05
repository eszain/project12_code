"""CADS: Collision Avoidance Detection System modernization MVP.

ENG 4000 Capstone Project 12 (York University, Lassonde School of Engineering),
sponsored by the Canadian Space Agency.

The package is organised along the conceptual architecture of Progress Report 1
(Figure 6.3.1):

* ``cads.cdm``         CDM adapters and the ingestion validator
* ``cads.correlation`` event correlator (encounter vs. revision)
* ``cads.ingest``      ingestion pipeline and event repository updates
* ``cads.analysis``    risk analysis (experimental Pc, data quality, maneuver trades)
* ``cads.alerts``      alert rules, notification channels and the outbox dispatcher
* ``cads.api``         application API (FastAPI) and the web interface in ``static/``
"""

__version__ = "0.1.0"
