"""
The contract every broker plugs into.

To support a new broker, drop a file in engine/adapters/ that subclasses
BrokerAdapter, set `id`/`name`, and implement `scan` (and optionally
`submit`). Register it in engine/registry.py. Nothing else changes.

Design notes, kept honest:
  * `scan` is the reliable, valuable part — most people-search sites let
    you look someone up by name + city, so we can confirm a listing and
    hand back its URL. That's the "see where you're exposed" step.
  * `submit` is best-effort. Many brokers end their opt-out in a CAPTCHA
    or an email/text confirmation that a machine can't (and shouldn't)
    fake. When we hit one, we return state="needs_you" with the exact
    link and what to click — the app surfaces that as "NEEDS YOU". This
    is the same wall the paid services hit; they just have staff to sit
    through it.
"""
from __future__ import annotations
from models import Finding, Info
from .browser import Session


class BrokerAdapter:
    id: str = "broker"
    name: str = "Broker"
    can_scan: bool = True
    can_submit: bool = True
    # a human-usable opt-out page, always shown as the fallback
    optout_url: str = ""

    async def scan(self, session: Session, info: Info) -> Finding:
        """Return a Finding with state exposed | clear | error."""
        raise NotImplementedError

    async def submit(self, session: Session, info: Info, finding: Finding) -> Finding:
        """
        Attempt removal. Return state submitted | needs_you | error.
        Default: we can't fully automate this one, so route the person to
        the opt-out page with a clear message.
        """
        return Finding(
            broker_id=self.id, name=self.name, state="needs_you",
            listing_url=finding.listing_url or self.optout_url or None,
            message="Open the opt-out page and confirm the request "
                    "(these last steps need a human).",
        )

    # ---- helpers adapters can reuse ----
    @staticmethod
    def tokens_present(haystack: str, info: Info) -> bool:
        """Loose match: the name and a location token both appear."""
        h = haystack.lower()
        name_ok = bool(info.name) and all(
            part.lower() in h for part in info.name.split()[:2] if len(part) > 1
        )
        loc = (info.city or info.state or "").lower().strip()
        loc_ok = bool(loc) and loc in h
        return name_ok and loc_ok
