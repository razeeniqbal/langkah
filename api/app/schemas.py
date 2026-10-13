from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel

Status = Literal["backlog", "todo", "doing", "review", "done"]
Points = Literal[1, 2, 3, 5, 8]
Mode = Literal["auto", "manual"]
Code = Field(pattern=r"^[A-Z0-9]{2,3}$")


class Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


# Projects ---------------------------------------------------------------
class ProjectIn(Camel):
    name: str = Field(min_length=1, max_length=200)
    code: str = Code
    order: int | None = None


class ProjectPatch(Camel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    code: str | None = Field(default=None, pattern=r"^[A-Z0-9]{2,3}$")
    order: int | None = None
    archived: bool | None = None


class ProjectOut(Camel):
    id: str
    name: str
    code: str
    order: int
    archived: bool
    updated_at: datetime


# Plan items -------------------------------------------------------------
class PlanItemIn(Camel):
    project_id: str
    section: str = ""
    title: str = Field(min_length=1, max_length=300)
    owner_id: str | None = None
    start: date
    end: date
    milestone: bool = False
    progress_mode: Mode = "auto"
    manual_progress: int = Field(default=0, ge=0, le=100)
    notes: str = ""
    order: int | None = None

    @model_validator(mode="after")
    def _dates(self):
        if self.milestone:
            self.end = self.start
        if self.end < self.start:
            raise ValueError("end must not be before start")
        return self


class PlanItemPatch(Camel):
    project_id: str | None = None
    section: str | None = None
    title: str | None = Field(default=None, min_length=1, max_length=300)
    owner_id: str | None = None
    start: date | None = None
    end: date | None = None
    milestone: bool | None = None
    progress_mode: Mode | None = None
    manual_progress: int | None = Field(default=None, ge=0, le=100)
    notes: str | None = None
    order: int | None = None


class PlanItemOut(Camel):
    id: str
    project_id: str
    section: str
    title: str
    owner_id: str | None
    start: date
    end: date
    milestone: bool
    progress_mode: Mode
    manual_progress: int
    notes: str
    order: int
    updated_at: datetime


# Cards ------------------------------------------------------------------
class CardIn(Camel):
    plan_item_id: str | None = None
    project_id: str | None = None
    title: str = Field(min_length=1, max_length=300)
    assignee_id: str | None = None
    status: Status = "backlog"
    due: date | None = None
    points: Points = 1
    notes: str = ""
    order: int | None = None


class CardPatch(Camel):
    plan_item_id: str | None = None
    project_id: str | None = None
    title: str | None = Field(default=None, min_length=1, max_length=300)
    assignee_id: str | None = None
    status: Status | None = None
    due: date | None = None
    points: Points | None = None
    notes: str | None = None
    order: int | None = None


class CardOut(Camel):
    id: str
    plan_item_id: str | None
    project_id: str
    title: str
    assignee_id: str | None
    status: Status
    due: date | None
    points: int
    notes: str
    order: int
    updated_at: datetime


# People -----------------------------------------------------------------
class PersonIn(Camel):
    name: str = Field(min_length=1, max_length=200)
    project_ids: list[str] = []
    is_me: bool = False


class PersonPatch(Camel):
    name: str | None = Field(default=None, min_length=1, max_length=200)


class PersonOut(Camel):
    id: str
    name: str
    project_ids: list[str]
    is_me: bool
    updated_at: datetime


# Notes ------------------------------------------------------------------
class NoteIn(Camel):
    text: str = Field(min_length=1, max_length=500)
    project_id: str | None = None
    order: int | None = None


class NotePatch(Camel):
    text: str | None = Field(default=None, min_length=1, max_length=500)
    project_id: str | None = None
    order: int | None = None


class NoteOut(Camel):
    id: str
    project_id: str | None
    text: str
    order: int
    created_at: datetime
    updated_at: datetime


class NotePromote(CardIn):
    """Card fields for turning a note into a card; the title defaults to the note text."""
    title: str | None = Field(default=None, min_length=1, max_length=300)


# Summary ----------------------------------------------------------------
class ItemProgress(Camel):
    plan_item_id: str
    project_id: str
    section: str
    progress: float
    mode: Mode
    card_count: int
    cards_done: int


class SectionProgress(Camel):
    project_id: str
    section: str
    progress: float


class ProjectProgress(Camel):
    project_id: str
    progress: float


class Summary(Camel):
    items: list[ItemProgress]
    sections: list[SectionProgress]
    projects: list[ProjectProgress]
    overall: float


class LoginIn(BaseModel):
    password: str
