"""Single sign-on from the portfolio admin (portfolio.madebyrazeen.com/admin).

The portfolio signs you in with GitHub and sets the `mbr_admin` cookie on
.madebyrazeen.com, so every app on a subdomain receives it. The token is
`v1.<payload>.<signature>`: the payload is base64url JSON
{"sub": <GitHub login>, "iat": ..., "exp": ...} and the signature is a
base64url HMAC-SHA256 of `v1.<payload>` keyed with MBR_SSO_SECRET. The same
secret must be set in the portfolio and here; changing it signs out everywhere.

Unset MBR_SSO_SECRET turns SSO off. MBR_SSO_LOGIN_URL / MBR_SSO_LOGOUT_URL point
the sign-in screen at the portfolio. Keep this file in step with the tracker's
app/sso.py and the portfolio's lib/admin/sso.ts.
"""
import base64
import hashlib
import hmac
import json
import os
import time

COOKIE = "mbr_admin"
SECRET = os.environ.get("MBR_SSO_SECRET", "")
PORTFOLIO = os.environ.get("MBR_SSO_PORTFOLIO_URL", "https://portfolio.madebyrazeen.com").rstrip("/")
LOGIN_URL = os.environ.get("MBR_SSO_LOGIN_URL", f"{PORTFOLIO}/api/admin/login")
LOGOUT_URL = os.environ.get("MBR_SSO_LOGOUT_URL", f"{PORTFOLIO}/api/admin/logout")


def enabled() -> bool:
    return bool(SECRET)


def _b64decode(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _sign(body: str) -> str:
    mac = hmac.new(SECRET.encode(), body.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(mac).rstrip(b"=").decode()


def verify(token: str | None) -> str | None:
    """The GitHub login the token was issued to, or None if it is missing, forged or expired."""
    if not SECRET or not token:
        return None
    try:
        version, payload, sig = token.split(".")
    except ValueError:
        return None
    if version != "v1" or not hmac.compare_digest(sig, _sign(f"{version}.{payload}")):
        return None
    try:
        claims = json.loads(_b64decode(payload))
        sub, exp = str(claims["sub"]), float(claims["exp"])
    except (ValueError, KeyError, TypeError):
        return None
    return sub if exp > time.time() else None
