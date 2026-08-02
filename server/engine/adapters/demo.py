"""
Offline demo broker. Registered only when REDACT_DEMO=1.

It needs no network: scan reports "exposed", clean reports "submitted".
Use it once after deploying to confirm the whole pipe works — PWA ->
engine -> job polling -> UI states — before you tune the real adapters.
"""
from __future__ import annotations
import asyncio

from models import Finding, Info
from ..base import BrokerAdapter
from ..browser import Session


class DemoBroker(BrokerAdapter):
    id = "demo"
    name = "Demo Records (test)"
    optout_url = "https://example.com/optout"

    async def scan(self, session: Session, info: Info) -> Finding:
        await asyncio.sleep(1.0)  # feel like real work
        return Finding(broker_id=self.id, name=self.name, state="exposed",
                       listing_url="https://example.com/listing/demo",
                       message="Sample match — this broker is for testing only.")

    async def submit(self, session: Session, info: Info, finding: Finding) -> Finding:
        await asyncio.sleep(1.0)
        return Finding(broker_id=self.id, name=self.name, state="submitted",
                       message="Test removal recorded.")
