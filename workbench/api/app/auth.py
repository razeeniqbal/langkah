"""Single-user auth: one password from WORKBENCH_PASSWORD.

If the variable is unset (e.g. access is already limited by Tailscale) the API
is open. Otherwise a successful login sets an HttpOnly cookie holding an HMAC
of the password, so changing the password logs every browser out.
"""
import hashlib
import hmac
import os

from fastapi import APIRouter, HTTPException, Request, Response

from .schemas import LoginIn

PASSWORD = os.environ.get("WORKBENCH_PASSWORD", "")
SECRET = os.environ.get("WORKBENCH_SECRET", "workbench-local")
COOKIE = "wb_session"

router = APIRouter(prefix="/auth", tags=["auth"])


def _token() -> str:
    return hmac.new(SECRET.encode(), PASSWORD.encode(), hashlib.sha256).hexdigest()


def is_authed(request: Request) -> bool:
    if not PASSWORD:
        return True
    return hmac.compare_digest(request.cookies.get(COOKIE, ""), _token())


@router.get("/status")
def status(request: Request):
    return {"required": bool(PASSWORD), "ok": is_authed(request)}


@router.post("/login")
def login(body: LoginIn, response: Response):
    if not PASSWORD or not hmac.compare_digest(body.password, PASSWORD):
        raise HTTPException(401, "wrong password")
    response.set_cookie(COOKIE, _token(), httponly=True, samesite="strict", max_age=60 * 60 * 24 * 30)
    return {"ok": True}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE)
    return {"ok": True}
