"""Single-user auth: one password from WORKBENCH_PASSWORD, plus view-only access.

If the password is unset (e.g. access is already limited by Tailscale) the API
is open and every request can edit. Otherwise a session cookie holds an HMAC
that also encodes its role, so changing the password logs every browser out:

- edit: signed in with the password; full access.
- view: the "View only" button, no password; reads only. The middleware in
  main.py rejects every write from a view session. Set WORKBENCH_VIEW_ONLY=0 to
  turn the button off.
"""
import hashlib
import hmac
import os
from typing import Literal

from fastapi import APIRouter, HTTPException, Request, Response

from .schemas import LoginIn

PASSWORD = os.environ.get("WORKBENCH_PASSWORD", "")
SECRET = os.environ.get("WORKBENCH_SECRET", "workbench-local")
VIEW_ONLY = os.environ.get("WORKBENCH_VIEW_ONLY", "1") != "0"
COOKIE = "wb_session"
# A public deployment (Vercel) must never run without a password.
PUBLIC = bool(os.environ.get("VERCEL"))
MISCONFIGURED = PUBLIC and not PASSWORD

Role = Literal["edit", "view"]
READ_METHODS = {"GET", "HEAD", "OPTIONS"}

router = APIRouter(prefix="/auth", tags=["auth"])


def _token(role: Role) -> str:
    msg = PASSWORD if role == "edit" else f"view:{PASSWORD}"
    return hmac.new(SECRET.encode(), msg.encode(), hashlib.sha256).hexdigest()


def role_of(request: Request) -> Role | None:
    if not PASSWORD:
        return "edit"
    cookie = request.cookies.get(COOKIE, "")
    if hmac.compare_digest(cookie, _token("edit")):
        return "edit"
    if VIEW_ONLY and hmac.compare_digest(cookie, _token("view")):
        return "view"
    return None


def is_authed(request: Request) -> bool:
    return role_of(request) is not None


def _set_session(request: Request, response: Response, role: Role) -> None:
    https = request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"
    response.set_cookie(COOKIE, _token(role), httponly=True, samesite="strict", secure=PUBLIC or https,
                        max_age=60 * 60 * 24 * 30)


@router.get("/status")
def status(request: Request):
    role = role_of(request)
    return {"required": bool(PASSWORD), "ok": role is not None, "role": role,
            "viewOnly": bool(PASSWORD) and VIEW_ONLY}


@router.post("/login")
def login(body: LoginIn, request: Request, response: Response):
    if not PASSWORD or not hmac.compare_digest(body.password, PASSWORD):
        raise HTTPException(401, "wrong password")
    _set_session(request, response, "edit")
    return {"ok": True, "role": "edit"}


@router.post("/view")
def view_only(request: Request, response: Response):
    """Read-only session without a password."""
    if not PASSWORD or not VIEW_ONLY:
        raise HTTPException(404, "view-only access is turned off")
    _set_session(request, response, "view")
    return {"ok": True, "role": "view"}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE)
    return {"ok": True}
