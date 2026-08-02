"""
Spokeo reference adapter.

Spokeo's search is JavaScript-heavy and often gated, so a plain GET won't
do — this one uses a real browser page. It's also one of the sites most
likely to challenge automation, so the adapter is written to fail soft:
if the page won't confirm cleanly, it returns "error" with the search URL
so the person can look themselves, rather than guessing.

This is the template for any JS-heavy broker: get a page from the session,
navigate, read text, decide.
"""
from __future__ import annotations
from urllib.parse import quote

from models import Finding, Info
from ..base import BrokerAdapter
from ..browser import Session


class Spokeo(BrokerAdapter):
    id = "spokeo"
    name = "Spokeo"
    optout_url = "https://www.spokeo.com/optout"

    def search_url(self, info: Info) -> str:
        return f"https://www.spokeo.com/{quote(info.name.strip().replace(' ', '-'))}"

    async def scan(self, session: Session, info: Info) -> Finding:
        url = self.search_url(info)
        try:
            page = await session.page()
        except RuntimeError:
            # Playwright not installed in this environment
            return Finding(broker_id=self.id, name=self.name, state="error",
                           listing_url=url,
                           message="Open Spokeo to check this one manually.")
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=25000)
            await page.wait_for_timeout(1500)
            body = (await page.inner_text("body")).lower()

            if "verify" in body and "human" in body:
                return Finding(broker_id=self.id, name=self.name, state="error",
                               listing_url=url,
                               message="Spokeo asked for a human check — open it to look.")
            if self.tokens_present(body, info):
                return Finding(broker_id=self.id, name=self.name, state="exposed",
                               listing_url=url,
                               message="A profile matching your name and city is listed.")
            return Finding(broker_id=self.id, name=self.name, state="clear",
                           message="No matching profile found.")
        except Exception:
            return Finding(broker_id=self.id, name=self.name, state="error",
                           listing_url=url,
                           message="Couldn't read the page — open Spokeo to check.")
        finally:
            try:
                await page.close()
            except Exception:
                pass

    async def submit(self, session: Session, info: Info, finding: Finding) -> Finding:
        return Finding(
            broker_id=self.id, name=self.name, state="needs_you",
            listing_url=self.optout_url,
            message="Paste your profile URL on Spokeo's opt-out page and "
                    "confirm the email link to remove it.",
        )
