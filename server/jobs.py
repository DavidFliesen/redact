"""
A tiny in-memory job store.

Jobs live only in RAM and are wiped a short time after they finish, so a
person's details never sit on disk. If you restart the server, all jobs
vanish — which is exactly what we want for a privacy tool.
"""
from __future__ import annotations
import time
import uuid
from dataclasses import dataclass, field
from threading import Lock

from models import Finding, JobView

# how long a finished job stays readable before it's purged (seconds)
JOB_TTL = 900  # 15 minutes


@dataclass
class Job:
    job_id: str
    kind: str  # "scan" | "clean"
    status: str = "running"  # running | done | error
    progress: int = 0
    results: list[Finding] = field(default_factory=list)
    message: str | None = None
    finished_at: float | None = None


class JobStore:
    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}
        self._lock = Lock()

    def create(self, kind: str, results: list[Finding]) -> Job:
        job = Job(job_id=uuid.uuid4().hex, kind=kind, results=results)
        with self._lock:
            self._purge_locked()
            self._jobs[job.job_id] = job
        return job

    def get(self, job_id: str) -> Job | None:
        with self._lock:
            self._purge_locked()
            return self._jobs.get(job_id)

    def update(self, job: Job) -> None:
        with self._lock:
            self._jobs[job.job_id] = job

    def finish(self, job: Job, status: str = "done") -> None:
        job.status = status
        job.progress = 100
        job.finished_at = time.time()
        self.update(job)

    def view(self, job: Job) -> JobView:
        return JobView(
            job_id=job.job_id, kind=job.kind, status=job.status,
            progress=job.progress, results=job.results, message=job.message,
        )

    def _purge_locked(self) -> None:
        now = time.time()
        stale = [
            jid for jid, j in self._jobs.items()
            if j.finished_at and now - j.finished_at > JOB_TTL
        ]
        for jid in stale:
            del self._jobs[jid]


store = JobStore()
