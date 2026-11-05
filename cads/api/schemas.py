"""Request bodies (validated by FastAPI and documented in the OpenAPI schema at /docs)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from ..alerts.channels import validate_channel


class ChannelSpec(BaseModel):
    type: Literal["file", "log", "webhook", "email"]
    target: str = Field("", max_length=300, description="file name, URL or email address(es), depending on type")

    @model_validator(mode="after")
    def _check(self) -> "ChannelSpec":
        error = validate_channel(self.type, self.target)
        if error:
            raise ValueError(error)
        return self


class AlertRuleIn(BaseModel):
    """An alert rule. All given conditions must hold (AND). Evaluated on the SOURCE Pc."""

    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(None, max_length=1000)
    enabled: bool = True
    pc_min: float | None = Field(None, ge=0, le=1, description="alert when source Pc >= this value (CSA action level: 1e-4)")
    miss_distance_max_m: float | None = Field(None, gt=0, description="alert when miss distance <= this many metres")
    hours_to_tca_max: float | None = Field(None, gt=0, description="alert when TCA is at most this many hours after CDM creation")
    object_ids: list[str] = Field(default_factory=list, description="NORAD/catalogue numbers to watch; empty = all objects")
    channels: list[ChannelSpec] = Field(default_factory=lambda: [ChannelSpec(type="file", target="alerts.jsonl")], max_length=10)
    actor: str = Field("anonymous", min_length=1, max_length=120, description="who made the change (free text until accounts exist, R2)")

    @field_validator("object_ids")
    @classmethod
    def _strip_ids(cls, value: list[str]) -> list[str]:
        return [v.strip() for v in value if v and v.strip()]


class StatusChangeIn(BaseModel):
    status: Literal["new", "acknowledged", "investigating", "closed"]
    reason: str = Field(min_length=3, max_length=1000)
    actor: str = Field(min_length=1, max_length=120)


class ManeuverCandidateIn(BaseModel):
    label: str = Field("candidate", max_length=60)
    dv_radial_ms: float = Field(0.0, ge=-10, le=10)
    dv_intrack_ms: float = Field(0.0, ge=-10, le=10)
    dv_crosstrack_ms: float = Field(0.0, ge=-10, le=10)
    lead_time_h: float = Field(gt=0, le=240, description="burn epoch = TCA minus this many hours")


class ManeuverRequest(BaseModel):
    revision_id: int | None = Field(None, description="defaults to the event's latest CDM")
    candidates: list[ManeuverCandidateIn] = Field(default_factory=list, max_length=12)
    spacecraft_mass_kg: float = Field(gt=0, le=100000)
    isp_s: float = Field(gt=0, le=10000)
    propellant_available_kg: float = Field(ge=0, le=100000)
    pc_threshold: float | None = Field(None, gt=0, le=1, description="defaults to CADS_PC_ACTION_THRESHOLD")
    hbr_m: float | None = Field(None, gt=0, le=100, description="override the hard-body radius")
    suggest_lead_time_h: float | None = Field(None, gt=0, le=240, description="also search the smallest single-axis burn at this lead time")
