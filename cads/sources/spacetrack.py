"""Space-Track.org adapter. PROTOTYPE: not exercised against the live service.

Status: query construction is unit-tested; login and download are written against the
public Space-Track API documentation but have NOT been run, because the team has no
approved account. Before enabling, confirm with CSA (Open Decision 1):

* which account and request class to use (the CSA samples carry ``CONSTELLATION =
  Canadian_Space_Agency`` and links into ``expandedspacedata``, i.e. the full ``cdm``
  class for satellite operators rather than ``cdm_public``);
* redistribution limits for downloaded CDMs;
* the polling interval, which must respect Space-Track's published rate limits
  (at most 30 requests per minute and 300 per hour at the time of writing).

Credentials come only from SPACETRACK_IDENTITY / SPACETRACK_PASSWORD (NFR04).
"""

from __future__ import annotations

from urllib.parse import quote

import httpx

from .base import RetrievalCriteria

BASE_URL = "https://www.space-track.org"
LOGIN_PATH = "/ajaxauth/login"
LOGOUT_PATH = "/ajaxauth/logout"


def build_cdm_query(criteria: RetrievalCriteria, constellation: str | None = None, limit: int = 100) -> str:
    """Build the REST path for the full ``cdm`` class, newest messages first.

    Predicate names mirror the CDM field names; verify them against the Space-Track
    model definition (``/basicspacedata/modeldef/class/cdm``) before first use.
    """
    parts = ["/expandedspacedata/query/class/cdm"]
    if constellation:
        parts += ["CONSTELLATION", quote(constellation, safe="")]
    if criteria.object_ids:
        parts += ["SAT1_OBJECT_DESIGNATOR", ",".join(quote(i, safe="") for i in criteria.object_ids)]
    if criteria.tca_from and criteria.tca_to:
        parts += ["TCA", f"{criteria.tca_from:%Y-%m-%dT%H:%M:%S}--{criteria.tca_to:%Y-%m-%dT%H:%M:%S}"]
    elif criteria.tca_from:
        parts += ["TCA", quote(f">{criteria.tca_from:%Y-%m-%dT%H:%M:%S}", safe="")]
    else:
        parts += ["TCA", quote(">now", safe="")]
    if criteria.min_pc is not None:
        parts += ["COLLISION_PROBABILITY", quote(f">{criteria.min_pc:.1E}", safe="")]
    parts += ["orderby", quote("CREATION_DATE desc", safe=""), "limit", str(limit), "format", "json"]
    return "/".join(parts)


class SpaceTrackSource:
    name = "space-track"

    def __init__(self, identity: str, password: str, constellation: str | None = None, base_url: str = BASE_URL):
        if not identity or not password:
            raise ValueError("Space-Track credentials are not configured (SPACETRACK_IDENTITY / SPACETRACK_PASSWORD)")
        self._identity = identity
        self._password = password
        self.constellation = constellation
        self.base_url = base_url

    def fetch(self, criteria: RetrievalCriteria) -> list[tuple[str, bytes]]:
        path = build_cdm_query(criteria, self.constellation)
        with httpx.Client(base_url=self.base_url, timeout=30.0) as client:
            login = client.post(LOGIN_PATH, data={"identity": self._identity, "password": self._password})
            login.raise_for_status()
            try:
                response = client.get(path)
                response.raise_for_status()
            finally:
                client.get(LOGOUT_PATH)
        return [("space-track-cdm.json", response.content)]
