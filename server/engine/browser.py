"""
Session: the shared tools an adapter uses during one job.

  * session.http  — an httpx.AsyncClient for cheap GETs (fast, low memory).
  * session.page()— a fresh Playwright page for JS-heavy sites or form
                    submission. Created on demand so a pure-httpx scan
                    never pays the cost of launching Chromium.

Reality check on bot detection: brokers actively try to block automation.
A realistic deployment rotates a residential-style user agent, adds small
delays, and accepts that some sites will still challenge you. We do NOT
try to defeat CAPTCHAs — when one appears, the adapter returns "needs_you".
"""
from __future__ import annotations
import asyncio
from typing import Optional

import httpx

try:
    from playwright.async_api import async_playwright, Browser, Page
except Exception:  # Playwright optional at import time
    async_playwright = None  # type: ignore
    Browser = object  # type: ignore
    Page = object  # type: ignore


UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)


class Session:
    def __init__(self, browser: Optional["Browser"]) -> None:
        self._browser = browser
        self._ctx = None
        self.http = httpx.AsyncClient(
            headers={"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"},
            timeout=httpx.Timeout(20.0),
            follow_redirects=True,
        )

    async def page(self) -> "Page":
        if self._browser is None:
            raise RuntimeError("Browser not available (Playwright not installed)")
        if self._ctx is None:
            self._ctx = await self._browser.new_context(
                user_agent=UA, viewport={"width": 1280, "height": 900},
                locale="en-US",
            )
        return await self._ctx.new_page()

    async def close(self) -> None:
        try:
            await self.http.aclose()
        except Exception:
            pass
        if self._ctx is not None:
            try:
                await self._ctx.close()
            except Exception:
                pass


class BrowserPool:
    """One long-lived Chromium for the whole server; per-job contexts."""
    def __init__(self) -> None:
        self._pw = None
        self._browser: Optional["Browser"] = None
        self._lock = asyncio.Lock()

    async def start(self) -> None:
        if async_playwright is None:
            return
        async with self._lock:
            if self._browser is None:
                self._pw = await async_playwright().start()
                self._browser = await self._pw.chromium.launch(
                    headless=True,
                    args=["--no-sandbox", "--disable-dev-shm-usage"],
                )

    async def session(self) -> Session:
        # browser may be None if Playwright isn't installed; httpx still works
        return Session(self._browser)

    async def stop(self) -> None:
        if self._browser is not None:
            await self._browser.close()
        if self._pw is not None:
            await self._pw.stop()


pool = BrowserPool()
