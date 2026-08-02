"""
FastPeopleSearch reference adapter. Same shape as TruePeopleSearch —
GET the results page, check for a name+city match, return the listing.
"""
from __future__ import annotations
from urllib.parse import quote

from bs4 import BeautifulSoup

from models import Finding, Info
from ..base import BrokerAdapter
from ..browser import Session


class FastPeopleSearch(BrokerAdapter):
    id = "fastpeoplesearch"
    name = "FastPeopleSearch"
    optout_url = "https://www.fastpeoplesearch.com/removal"

    def results_url(self, info: Info) -> str:
        name = quote(info.name.strip())
        loc = quote(f"{info.city}, {info.state}".strip(", "))
        return f"https://www.fastpeoplesearch.com/results?name={name}&citystatezip={loc}"

    async def scan(self, session: Session, info: Info) -> Finding:
        url = self.results_url(info)
        try:
            r = await session.http.get(url)
            if r.status_code >= 400:
                return Finding(broker_id=self.id, name=self.name, state="error",
                               listing_url=self.optout_url,
                               message="Couldn't reach the site — try again later.")
            soup = BeautifulSoup(r.text, "html.parser")
            text = soup.get_text(" ", strip=True)
            if "unusual traffic" in text.lower() or "are you human" in text.lower():
                return Finding(broker_id=self.id, name=self.name, state="error",
                               listing_url=url,
                               message="Site asked for a human check — open it to look.")
            if self.tokens_present(text, info):
                a = soup.select_one("a[href*='/name/']")
                link = None
                if a and a.get("href"):
                    href = a["href"]
                    link = href if href.startswith("http") else "https://www.fastpeoplesearch.com" + href
                return Finding(broker_id=self.id, name=self.name, state="exposed",
                               listing_url=link or url,
                               message="Found a listing that matches your name and city.")
            return Finding(broker_id=self.id, name=self.name, state="clear",
                           message="No matching listing found.")
        except Exception:
            return Finding(broker_id=self.id, name=self.name, state="error",
                           listing_url=self.optout_url,
                           message="Scan hit an error — you can still use the opt-out page.")

    async def submit(self, session: Session, info: Info, finding: Finding) -> Finding:
        return Finding(
            broker_id=self.id, name=self.name, state="needs_you",
            listing_url=finding.listing_url or self.optout_url,
            message="Open the removal page for this record and confirm the "
                    "emailed code to finish.",
        )
