"""Request / response shapes shared across the API."""
from __future__ import annotations
from typing import Literal, Optional
from pydantic import BaseModel, Field


class Info(BaseModel):
    """The person's details, sent only for the duration of a job."""
    name: str = ""
    address: str = ""
    city: str = ""
    state: str = ""
    phone: str = ""
    email: str = ""

    def is_enough(self) -> bool:
        return bool(self.name.strip()) and bool(
            self.city.strip() or self.state.strip() or self.address.strip()
        )


class ScanRequest(BaseModel):
    info: Info


class CleanRequest(BaseModel):
    job_id: str
    broker_ids: list[str] = Field(default_factory=list)
    info: Info


class Finding(BaseModel):
    broker_id: str
    name: str
    # scan states:  checking | exposed | clear | error
    # clean states: submitting | submitted | needs_you | error
    state: Literal[
        "checking", "exposed", "clear",
        "submitting", "submitted", "needs_you", "error",
    ] = "checking"
    listing_url: Optional[str] = None
    message: Optional[str] = None


class JobView(BaseModel):
    job_id: str
    kind: Literal["scan", "clean"]
    status: Literal["running", "done", "error"]
    progress: int = 0
    results: list[Finding] = Field(default_factory=list)
    message: Optional[str] = None
