"""Engine, session and schema setup.

Postgres is the production target (own schema, `workbench`). SQLite is accepted
for local development and tests so the API runs without Docker. The progress
view is the single place progress is computed; only the day-count expression
differs between dialects.
"""
import os
from collections.abc import Iterator

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool


def _database_url() -> str:
    # Vercel's Neon integration sets DATABASE_URL or POSTGRES_URL as postgres://...
    url = os.environ.get("DATABASE_URL") or os.environ.get("POSTGRES_URL") or "sqlite:///./workbench.db"
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


DATABASE_URL = _database_url()
IS_SQLITE = DATABASE_URL.startswith("sqlite")
SERVERLESS = bool(os.environ.get("VERCEL"))
# Vercel's filesystem is read-only, so the SQLite fallback can't work there.
MISSING_DATABASE_URL = SERVERLESS and IS_SQLITE
SCHEMA = None if IS_SQLITE else os.environ.get("DB_SCHEMA", "workbench")
P = f"{SCHEMA}." if SCHEMA else ""  # table prefix for raw SQL

engine = create_engine(
    DATABASE_URL,
    # Poolers in transaction mode (Supabase :6543, Neon -pooler) can't keep
    # server-side prepared statements, so psycopg must not create them.
    # A bad host must fail fast rather than hang until the function times out.
    connect_args={"check_same_thread": False} if IS_SQLITE else {"prepare_threshold": None, "connect_timeout": 10},
    pool_pre_ping=not IS_SQLITE,
    # Serverless instances freeze between requests; don't hold idle connections.
    **({"poolclass": NullPool} if SERVERLESS and not IS_SQLITE else {}),
)

if IS_SQLITE:

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_conn, _):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Credit per status: Backlog 0, To do 0, In progress 50, Review 75, Done 100.
CREDIT_SQL = (
    "CASE c.status WHEN 'doing' THEN 0.5 WHEN 'review' THEN 0.75 "
    "WHEN 'done' THEN 1.0 ELSE 0.0 END"
)


def _days_sql() -> str:
    if IS_SQLITE:
        return "CAST(julianday(p.end_date) - julianday(p.start_date) + 1 AS INTEGER)"
    return "(p.end_date - p.start_date + 1)"


# Points-weighted credit of a set of cards (alias c), 0 to 100. Used by the
# view below and by the section / project / overall rollups in routes._summary.
CARD_PROGRESS_SQL = f"COALESCE(ROUND(100.0 * SUM(c.points * {CREDIT_SQL}) / NULLIF(SUM(c.points), 0), 1), 0)"


def progress_view_sql() -> str:
    """plan_item_progress: one row per plan item with its computed progress.

    Progress only comes from linked cards: sum(points * credit) / sum(points),
    or 0 when the item has no cards. manual_progress / progress_mode are kept
    in the table for old data but no longer used.
    """
    return f"""
CREATE VIEW {P}plan_item_progress AS
SELECT
  p.id AS plan_item_id,
  p.project_id,
  p.section,
  p.milestone,
  p.start_date,
  p.end_date,
  {_days_sql()} AS days,
  COUNT(c.id) AS card_count,
  COALESCE(SUM(CASE WHEN c.status = 'done' THEN 1 ELSE 0 END), 0) AS cards_done,
  'auto' AS effective_mode,
  {CARD_PROGRESS_SQL} AS progress
FROM {P}plan_items p
LEFT JOIN {P}cards c ON c.plan_item_id = p.id
GROUP BY p.id, p.project_id, p.section, p.milestone, p.start_date, p.end_date
"""


def init_db() -> None:
    from .models import Base

    with engine.begin() as conn:
        if not IS_SQLITE:
            # Several cold-starting instances may run this at once.
            conn.execute(text("SELECT pg_advisory_xact_lock(724501)"))
        if SCHEMA:
            conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}"))
        conn.execute(text(f"DROP VIEW IF EXISTS {P}plan_item_progress"))
        Base.metadata.create_all(conn)
        conn.execute(text(progress_view_sql()))
