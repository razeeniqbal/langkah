import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import auth
from .db import MISSING_DATABASE_URL, init_db
from .routes import router

log = logging.getLogger("workbench")

# Set when the schema could not be created; /api answers 503 with it instead of
# the whole function crashing at startup.
db_error: str | None = None


def try_init_db() -> None:
    global db_error
    if MISSING_DATABASE_URL:
        db_error = "Set DATABASE_URL in the Vercel project settings, then redeploy."
        return
    try:
        init_db()
        db_error = None
    except Exception:
        log.exception("database setup failed")
        db_error = "Cannot connect to the database. Check DATABASE_URL; the full error is in the Vercel function logs."


@asynccontextmanager
async def lifespan(_: FastAPI):
    try_init_db()
    yield


app = FastAPI(title="LANGKAH.", version="1.0.0", lifespan=lifespan)


@app.middleware("http")
async def require_login(request: Request, call_next):
    path = request.url.path
    if auth.MISCONFIGURED and path.startswith("/api/"):
        return JSONResponse({"detail": "Set WORKBENCH_PASSWORD in the Vercel project settings, then redeploy."}, status_code=503)
    if db_error and path.startswith("/api/"):
        try_init_db()  # the database may be reachable now
        if db_error:
            return JSONResponse({"detail": db_error}, status_code=503)
    if path.startswith("/api/") and not path.startswith("/api/auth/"):
        role = auth.role_of(request)
        if role is None:
            return JSONResponse({"detail": "login required"}, status_code=401)
        # View-only sessions can read everything and change nothing.
        if role == "view" and request.method not in auth.READ_METHODS:
            return JSONResponse({"detail": "view only: sign in with the password to make changes"}, status_code=403)
    return await call_next(request)


class RestoreApiPrefix:
    """On Vercel the platform may strip the /api route prefix before the request
    reaches us; put it back so routes match either way."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and not scope["path"].startswith("/api"):
            scope = dict(scope, path="/api" + scope["path"], raw_path=b"/api" + scope.get("raw_path", b""))
        await self.app(scope, receive, send)


if os.environ.get("VERCEL"):
    app.add_middleware(RestoreApiPrefix)

app.include_router(auth.router, prefix="/api")
app.include_router(router, prefix="/api")

# In the Docker image the built front end is served from the same origin.
static_dir = Path(os.environ.get("STATIC_DIR", Path(__file__).resolve().parents[1] / "static"))
if static_dir.is_dir():
    app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        target = (static_dir / path).resolve()
        if path and target.is_relative_to(static_dir.resolve()) and target.is_file():
            return FileResponse(target)
        return FileResponse(static_dir / "index.html")
