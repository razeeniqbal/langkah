import secrets
from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, MetaData, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from .db import SCHEMA

STATUSES = ("backlog", "todo", "doing", "review", "done")
POINTS = (1, 2, 3, 5, 8)


def now() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(5)}"


def fk(table: str) -> str:
    return f"{SCHEMA}.{table}.id" if SCHEMA else f"{table}.id"


class Base(DeclarativeBase):
    metadata = MetaData(schema=SCHEMA)


class Project(Base):
    __tablename__ = "projects"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    code: Mapped[str] = mapped_column(String(3))
    order: Mapped[int] = mapped_column("sort_order", Integer, default=0)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class Person(Base):
    __tablename__ = "people"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    is_me: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)
    memberships: Mapped[list["ProjectMember"]] = relationship(
        cascade="all, delete-orphan", lazy="selectin"
    )

    @property
    def project_ids(self) -> list[str]:
        return [m.project_id for m in self.memberships]


class ProjectMember(Base):
    __tablename__ = "project_members"
    person_id: Mapped[str] = mapped_column(ForeignKey(fk("people"), ondelete="CASCADE"), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey(fk("projects"), ondelete="CASCADE"), primary_key=True)


class PlanItem(Base):
    __tablename__ = "plan_items"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey(fk("projects")), index=True)
    section: Mapped[str] = mapped_column(String(200), default="")
    title: Mapped[str] = mapped_column(String(300))
    owner_id: Mapped[str | None] = mapped_column(ForeignKey(fk("people"), ondelete="SET NULL"), nullable=True)
    start: Mapped[date] = mapped_column("start_date", Date)
    end: Mapped[date] = mapped_column("end_date", Date)
    milestone: Mapped[bool] = mapped_column(Boolean, default=False)
    progress_mode: Mapped[str] = mapped_column(String(10), default="auto")
    manual_progress: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[str] = mapped_column(Text, default="")
    order: Mapped[int] = mapped_column("sort_order", Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class Card(Base):
    __tablename__ = "cards"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    plan_item_id: Mapped[str | None] = mapped_column(
        ForeignKey(fk("plan_items"), ondelete="SET NULL"), nullable=True, index=True
    )
    # Always set. When linked it mirrors the plan item's project.
    project_id: Mapped[str] = mapped_column(ForeignKey(fk("projects")), index=True)
    title: Mapped[str] = mapped_column(String(300))
    assignee_id: Mapped[str | None] = mapped_column(ForeignKey(fk("people"), ondelete="SET NULL"), nullable=True)
    status: Mapped[str] = mapped_column(String(10), default="backlog")
    due: Mapped[date | None] = mapped_column(Date, nullable=True)
    points: Mapped[int] = mapped_column(Integer, default=1)
    notes: Mapped[str] = mapped_column(Text, default="")
    order: Mapped[int] = mapped_column("sort_order", Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class Note(Base):
    """A loose pending item, captured before it is shaped into a card."""
    __tablename__ = "notes"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    # Optional: a note can be filed under a project before it becomes a card.
    project_id: Mapped[str | None] = mapped_column(
        ForeignKey(fk("projects"), ondelete="SET NULL"), nullable=True, index=True
    )
    text: Mapped[str] = mapped_column(String(500))
    order: Mapped[int] = mapped_column("sort_order", Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)
