/* ============================================================
   Redact — configuration
   ------------------------------------------------------------
   Edit the two values below after you deploy. Nothing else in
   the app needs to change.

   1) REDACT_API_BASE
      The public HTTPS address of your scanning engine (the
      Oracle Cloud server). Leave it as an empty string to ship
      Redact in "guided-only" mode — the one-tap scanner turns
      off cleanly and people use the guided list instead.

      Example once deployed:
        window.REDACT_API_BASE = "https://api.redact.yourdomain.com";

   2) REDACT_REPO_URL
      Link people see under "How your data is handled" so they
      can read the source. Point it at your GitHub repo.
   ============================================================ */

window.REDACT_API_BASE = "";
window.REDACT_REPO_URL = "https://github.com/DavidFliesen/redact";
