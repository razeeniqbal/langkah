"""Single-user auth: one password from WORKBENCH_PASSWORD, plus view-only access.

If the password is unset (e.g. access is already limited by Tailscale) the API
is open and every request can edit. Otherwise a session cookie holds the role,
the time of the last request and an HMAC over both and the password, so
changing the password logs every browser out:

- edit: signed in with the password; full access.
- view: the "View only" button, no password; reads only. The middleware in
  main.py rejects every write from a view session. Set WORKBENCH_VIEW_ONLY=0 to
  turn the button off.

Sessions end when the browser closes (no cookie expiry date), after
WORKBENCH_IDLE_MINUTES without a request (default 30; each request slides the
window), and, when WORKBENCH_LOGIN_EACH_LOAD is on (default), the web app signs
out on every page load so a refresh asks for the password again.
"""
import hashlib
import hmac
import os
import time
from typing import Literal

from fastapi import APIRouter, HTTPException, Request, Response

from .schemas import LoginIn

PASSWORD = os.environ.get("WORKBENCH_PASSWORD", "")
SECRET = os.environ.get("WORKBENCH_SECRET", "workbench-local")
VIEW_ONLY = os.environ.get("WORKBENCH_VIEW_ONLY", "1") != "0"
IDLE_SECONDS = int(float(os.environ.get("WORKBENCH_IDLE_MINUTES", "30")) * 60)  # 0 = no idle limit
LOGIN_EACH_LOAD = os.environ.get("WORKBENCH_LOGIN_EACH_LOAD", "1") != "0"
COOKIE = "wb_session"
# A public deployment (Vercel) must never run without a password.
PUBLIC = bool(os.environ.get("VERCEL"))
MISCONFIGURED = PUBLIC and not PASSWORD

Role = Literal["edit", "view"]
READ_METHODS = {"GET", "HEAD", "OPTIONS"}

router = APIRouter(prefix="/auth", tags=["auth"])


def _sign(role: str, ts: int) -> str:
    return hmac.new(SECRET.encode(), f"{role}:{ts}:{PASSWORD}".encode(), hashlib.sha256).hexdigest()


def _token(role: Role, ts: int | None = None) -> str:
    ts = int(time.time()) if ts is None else ts
    return f"{role}.{ts}.{_sign(role, ts)}"


def role_of(request: Request) -> Role | None:
    if not PASSWORD:
        return "edit"
    try:
        role, ts_s, sig = request.cookies.get(COOKIE, "").split(".")
        ts = int(ts_s)
    except ValueError:
        return None
    if role not in ("edit", "view") or not hmac.compare_digest(sig, _sign(role, ts)):
        return None
    if role == "view" and not VIEW_ONLY:
        return None
    if IDLE_SECONDS and time.time() - ts > IDLE_SECONDS:
        return None
    return role  # type: ignore[return-value]


def is_authed(request: Request) -> bool:
    return role_of(request) is not None


def set_session(request: Request, response: Response, role: Role) -> None:
    """(Re)issue the cookie stamped with now. No max_age: it ends with the browser."""
    https = request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"
    response.set_cookie(COOKIE, _token(role), httponly=True, samesite="strict", secure=PUBLIC or https)


@router.get("/status")
def status(request: Request, response: Response):
    role = role_of(request)
    # The web app pings this while you're active but not saving anything.
    if role and PASSWORD:
        set_session(request, response, role)
    return {"required": bool(PASSWORD), "ok": role is not None, "role": role,
            "viewOnly": bool(PASSWORD) and VIEW_ONLY,
            "idleMinutes": IDLE_SECONDS / 60 if PASSWORD else 0,
            "loginEachLoad": bool(PASSWORD) and LOGIN_EACH_LOAD}


@router.post("/login")
def login(body: LoginIn, request: Request, response: Response):
    if not PASSWORD or not hmac.compare_digest(body.password, PASSWORD):
        raise HTTPException(401, "wrong password")
    set_session(request, response, "edit")
    return {"ok": True, "role": "edit"}


@router.post("/view")
def view_only(request: Request, response: Response):
    """Read-only session without a password."""
    if not PASSWORD or not VIEW_ONLY:
        raise HTTPException(404, "view-only access is turned off")
    set_session(request, response, "view")
    return {"ok": True, "role": "view"}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE)
    return {"ok": True}
