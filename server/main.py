"""
Redact scanning engine — the backend behind the PWA's "Scan & clean".

Run locally:
    pip install -r requirements.txt
    playwright install chromium
    uvicorn main:app --reload --port 8000

Endpoints:
    GET  /health          liveness + which brokers are automatable
    POST /scan   {info}    -> {job_id}
    POST /clean  {job_id, broker_ids, info} -> {job_id}
    GET  /jobs/{job_id}    -> job view (poll this)

Privacy posture: details arrive per request, live only in the in-memory
job, and are purged shortly after the job finishes (see jobs.py). Nothing
is written to disk. Lock CORS to your site's origin in production.
"""
from __future__ import annotations
import asyncio
import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from models import ScanRequest, CleanRequest, JobView, Finding, Info
from jobs import store, Job
from engine import pool, ADAPTERS, BY_ID, catalog

# --- config ---
# Comma-separated list of allowed origins, e.g.
#   REDACT_ALLOW_ORIGIN="https://davidfliesen.github.io"
ALLOW = [o.strip() for o in os.getenv("REDACT_ALLOW_ORIGIN", "*").split(",") if o.strip()]
# how many brokers to hit at once (keep modest on the free tier)
CONCURRENCY = int(os.getenv("REDACT_CONCURRENCY", "4"))

app = FastAPI(title="Redact Engine", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOW or ["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.on_event("startup")
async def _startup() -> None:
    await pool.start()


@app.on_event("shutdown")
async def _shutdown() -> None:
    await pool.stop()


@app.get("/health")
async def health() -> dict:
    return {"ok": True, "brokers": catalog()}


@app.post("/scan")
async def scan(req: ScanRequest) -> dict:
    if not req.info.is_enough():
        raise HTTPException(400, "Need at least a name and a city or state.")
    seed = [Finding(broker_id=a.id, name=a.name, state="checking") for a in ADAPTERS]
    job = store.create("scan", seed)
    asyncio.create_task(_run_scan(job, req.info))
    return {"job_id": job.job_id}


@app.post("/clean")
async def clean(req: CleanRequest) -> dict:
    targets = [BY_ID[bid] for bid in req.broker_ids if bid in BY_ID]
    if not targets:
        raise HTTPException(400, "No known brokers to clean.")
    seed = [Finding(broker_id=a.id, name=a.name, state="submitting") for a in targets]
    job = store.create("clean", seed)
    asyncio.create_task(_run_clean(job, req.info, targets))
    return {"job_id": job.job_id}


@app.get("/jobs/{job_id}", response_model=JobView)
async def get_job(job_id: str) -> JobView:
    job = store.get(job_id)
    if job is None:
        raise HTTPException(404, "Job not found or expired.")
    return store.view(job)


# ---------------- background workers ----------------
async def _run_scan(job: Job, info: Info) -> None:
    await _run(job, info, [(a, None) for a in ADAPTERS], mode="scan")


async def _run_clean(job: Job, info: Info, targets: list) -> None:
    # map each target to its prior listing_url if the scan found one
    prior = {f.broker_id: f for f in job.results}
    work = [(a, prior.get(a.id)) for a in targets]
    await _run(job, info, work, mode="clean")


async def _run(job: Job, info: Info, work: list, mode: str) -> None:
    session = await pool.session()
    sem = asyncio.Semaphore(CONCURRENCY)
    by_id = {f.broker_id: f for f in job.results}
    total = len(work) or 1
    completed = 0

    async def one(adapter, prior) -> Finding:
        async with sem:
            try:
                if mode == "scan":
                    return await adapter.scan(session, info)
                base = prior or Finding(broker_id=adapter.id, name=adapter.name)
                return await adapter.submit(session, info, base)
            except Exception as e:  # never let one broker sink the job
                return Finding(broker_id=adapter.id, name=adapter.name,
                               state="error", message=str(e)[:120])

    try:
        tasks = [asyncio.create_task(one(a, p)) for a, p in work]
        for coro in asyncio.as_completed(tasks):
            result = await coro
            by_id[result.broker_id] = result
            job.results = list(by_id.values())
            completed += 1
            job.progress = int(completed / total * 100)
            store.update(job)
        store.finish(job, "done")
    except Exception as e:
        job.message = str(e)[:200]
        store.finish(job, "error")
    finally:
        await session.close()
