"""
Every broker Redact can scan/submit automatically.

Add a broker: import its adapter and append an instance to ADAPTERS.
Brokers NOT listed here still work in the app — they show up in the
guided list on the site, where the person removes themselves by hand.
"""
from __future__ import annotations

import os

from .adapters.truepeoplesearch import TruePeopleSearch
from .adapters.fastpeoplesearch import FastPeopleSearch
from .adapters.spokeo import Spokeo

ADAPTERS = [
    TruePeopleSearch(),
    FastPeopleSearch(),
    Spokeo(),
]

# Optional offline test broker — see adapters/demo.py
if os.getenv("REDACT_DEMO") == "1":
    from .adapters.demo import DemoBroker
    ADAPTERS.insert(0, DemoBroker())

BY_ID = {a.id: a for a in ADAPTERS}


def catalog() -> list[dict]:
    """Shape used by GET /health so the app knows what's automatable."""
    return [
        {"id": a.id, "name": a.name, "scan": a.can_scan, "submit": a.can_submit}
        for a in ADAPTERS
    ]
