from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, text, update
from sqlalchemy.orm import Session

from .db import CARD_PROGRESS_SQL, P, get_db
from .models import Card, Note, PlanItem, Person, Project, ProjectMember, new_id
from .schemas import (
    CardIn, CardOut, CardPatch,
    NoteIn, NoteOut, NotePatch, NotePromote,
    PersonIn, PersonOut, PersonPatch,
    PlanItemIn, PlanItemOut, PlanItemPatch,
    ProjectIn, ProjectOut, ProjectPatch,
    Summary,
)

router = APIRouter()
DB = Depends(get_db)


def _get(db: Session, model, id: str):
    obj = db.get(model, id)
    if obj is None:
        raise HTTPException(404, f"{model.__tablename__[:-1]} {id} not found")
    return obj


def _next_order(db: Session, model, *where) -> int:
    return (db.scalar(select(func.max(model.order)).where(*where)) or 0) + 1


def _apply(obj, data: dict) -> None:
    for k, v in data.items():
        setattr(obj, k, v)


# Projects -----------------------------------------------------------------
@router.get("/projects", response_model=list[ProjectOut])
def list_projects(db: Session = DB):
    return db.scalars(select(Project).order_by(Project.order, Project.name)).all()


@router.post("/projects", response_model=ProjectOut, status_code=201)
def create_project(body: ProjectIn, db: Session = DB):
    p = Project(id=new_id("prj"), name=body.name, code=body.code,
                order=body.order if body.order is not None else _next_order(db, Project))
    db.add(p)
    # Razeen sits on every project he creates.
    me = db.scalar(select(Person).where(Person.is_me))
    if me:
        db.add(ProjectMember(person_id=me.id, project_id=p.id))
    db.commit()
    return p


@router.patch("/projects/{id}", response_model=ProjectOut)
def update_project(id: str, body: ProjectPatch, db: Session = DB):
    p = _get(db, Project, id)
    _apply(p, body.model_dump(exclude_unset=True))
    db.commit()
    return p


@router.delete("/projects/{id}", status_code=204)
def delete_project(id: str, db: Session = DB):
    p = _get(db, Project, id)
    items = db.scalar(select(func.count()).select_from(PlanItem).where(PlanItem.project_id == id))
    cards = db.scalar(select(func.count()).select_from(Card).where(Card.project_id == id))
    if items or cards:
        raise HTTPException(409, f"project has {items} plan items and {cards} cards")
    db.delete(p)
    db.commit()


# Plan items ---------------------------------------------------------------
@router.get("/plan_items", response_model=list[PlanItemOut])
def list_plan_items(project_id: str | None = None, db: Session = DB):
    q = select(PlanItem).order_by(PlanItem.order, PlanItem.start)
    if project_id:
        q = q.where(PlanItem.project_id == project_id)
    return db.scalars(q).all()


@router.post("/plan_items", response_model=PlanItemOut, status_code=201)
def create_plan_item(body: PlanItemIn, db: Session = DB):
    _get(db, Project, body.project_id)
    data = body.model_dump()
    if data["order"] is None:
        data["order"] = _next_order(db, PlanItem, PlanItem.project_id == body.project_id)
    item = PlanItem(id=new_id("pi"), **data)
    db.add(item)
    db.commit()
    return item


@router.patch("/plan_items/{id}", response_model=PlanItemOut)
def update_plan_item(id: str, body: PlanItemPatch, db: Session = DB):
    item = _get(db, PlanItem, id)
    data = body.model_dump(exclude_unset=True)
    if "project_id" in data and data["project_id"] != item.project_id:
        _get(db, Project, data["project_id"])
        db.execute(update(Card).where(Card.plan_item_id == id).values(project_id=data["project_id"]))
    _apply(item, data)
    if item.milestone:
        item.end = item.start
    if item.end < item.start:
        raise HTTPException(422, "end must not be before start")
    db.commit()
    return item


@router.delete("/plan_items/{id}", status_code=204)
def delete_plan_item(id: str, db: Session = DB):
    item = _get(db, PlanItem, id)
    # Cards stay on the board, unlinked, in the item's project.
    db.execute(update(Card).where(Card.plan_item_id == id).values(plan_item_id=None, project_id=item.project_id))
    db.delete(item)
    db.commit()


# Cards --------------------------------------------------------------------
@router.get("/cards", response_model=list[CardOut])
def list_cards(project_id: str | None = None, db: Session = DB):
    q = select(Card).order_by(Card.order)
    if project_id:
        q = q.where(Card.project_id == project_id)
    return db.scalars(q).all()


def _resolve_project(db: Session, plan_item_id: str | None, project_id: str | None) -> str:
    if plan_item_id:
        return _get(db, PlanItem, plan_item_id).project_id
    if not project_id:
        raise HTTPException(422, "an unlinked card needs a projectId")
    return _get(db, Project, project_id).id


def _new_card(db: Session, data: dict) -> Card:
    data["project_id"] = _resolve_project(db, data.get("plan_item_id"), data.get("project_id"))
    if data["order"] is None:
        data["order"] = _next_order(db, Card)
    card = Card(id=new_id("c"), **data)
    db.add(card)
    return card


@router.post("/cards", response_model=CardOut, status_code=201)
def create_card(body: CardIn, db: Session = DB):
    card = _new_card(db, body.model_dump())
    db.commit()
    return card


@router.patch("/cards/{id}", response_model=CardOut)
def update_card(id: str, body: CardPatch, db: Session = DB):
    card = _get(db, Card, id)
    data = body.model_dump(exclude_unset=True)
    if "plan_item_id" in data or "project_id" in data:
        link = data.get("plan_item_id", card.plan_item_id)
        data["project_id"] = _resolve_project(db, link, data.get("project_id", card.project_id))
    _apply(card, data)
    db.commit()
    return card


@router.delete("/cards/{id}", status_code=204)
def delete_card(id: str, db: Session = DB):
    db.delete(_get(db, Card, id))
    db.commit()


# Notes --------------------------------------------------------------------
@router.get("/notes", response_model=list[NoteOut])
def list_notes(db: Session = DB):
    return db.scalars(select(Note).order_by(Note.order.desc(), Note.created_at.desc())).all()


@router.post("/notes", response_model=NoteOut, status_code=201)
def create_note(body: NoteIn, db: Session = DB):
    if body.project_id:
        _get(db, Project, body.project_id)
    # Newest on top: order counts up and the list sorts descending.
    note = Note(id=new_id("n"), text=body.text.strip(), project_id=body.project_id,
                order=body.order if body.order is not None else _next_order(db, Note))
    db.add(note)
    db.commit()
    return note


@router.patch("/notes/{id}", response_model=NoteOut)
def update_note(id: str, body: NotePatch, db: Session = DB):
    note = _get(db, Note, id)
    data = body.model_dump(exclude_unset=True)
    if data.get("project_id"):
        _get(db, Project, data["project_id"])
    if "text" in data:
        data["text"] = data["text"].strip()
    _apply(note, data)
    db.commit()
    return note


@router.delete("/notes/{id}", status_code=204)
def delete_note(id: str, db: Session = DB):
    db.delete(_get(db, Note, id))
    db.commit()


@router.post("/notes/{id}/promote", response_model=CardOut, status_code=201)
def promote_note(id: str, body: NotePromote, db: Session = DB):
    """Turn a note into a card and remove the note, in one transaction."""
    note = _get(db, Note, id)
    data = body.model_dump()
    data["title"] = (data["title"] or note.text).strip()[:300]
    data["project_id"] = data["project_id"] or note.project_id
    card = _new_card(db, data)
    db.delete(note)
    db.commit()
    return card


# People -------------------------------------------------------------------
def _person_out(p: Person) -> PersonOut:
    return PersonOut(id=p.id, name=p.name, project_ids=p.project_ids, is_me=p.is_me, updated_at=p.updated_at)


@router.get("/people", response_model=list[PersonOut])
def list_people(db: Session = DB):
    people = db.scalars(select(Person).order_by(Person.is_me.desc(), Person.name)).all()
    return [_person_out(p) for p in people]


@router.post("/people", response_model=PersonOut, status_code=201)
def create_person(body: PersonIn, db: Session = DB):
    if body.is_me and db.scalar(select(Person).where(Person.is_me)):
        raise HTTPException(409, "there is already a person marked as me")
    p = Person(id=new_id("ppl"), name=body.name.strip(), is_me=body.is_me)
    for pid in body.project_ids:
        _get(db, Project, pid)
        p.memberships.append(ProjectMember(project_id=pid))
    db.add(p)
    db.commit()
    db.refresh(p)
    return _person_out(p)


@router.patch("/people/{id}", response_model=PersonOut)
def update_person(id: str, body: PersonPatch, db: Session = DB):
    p = _get(db, Person, id)
    _apply(p, body.model_dump(exclude_unset=True))
    db.commit()
    return _person_out(p)


@router.delete("/people/{id}", status_code=204)
def delete_person(id: str, db: Session = DB):
    p = _get(db, Person, id)
    if p.is_me:
        raise HTTPException(409, "cannot delete yourself")
    db.execute(update(Card).where(Card.assignee_id == id).values(assignee_id=None))
    db.execute(update(PlanItem).where(PlanItem.owner_id == id).values(owner_id=None))
    db.delete(p)
    db.commit()


@router.put("/people/{id}/projects/{project_id}", response_model=PersonOut)
def add_to_project(id: str, project_id: str, db: Session = DB):
    p = _get(db, Person, id)
    _get(db, Project, project_id)
    if project_id not in p.project_ids:
        p.memberships.append(ProjectMember(project_id=project_id))
        db.commit()
        db.refresh(p)
    return _person_out(p)


@router.delete("/people/{id}/projects/{project_id}", response_model=PersonOut)
def remove_from_project(id: str, project_id: str, db: Session = DB):
    p = _get(db, Person, id)
    # Only this project's assignments are cleared.
    db.execute(update(Card).where(Card.assignee_id == id, Card.project_id == project_id).values(assignee_id=None))
    db.execute(update(PlanItem).where(PlanItem.owner_id == id, PlanItem.project_id == project_id).values(owner_id=None))
    p.memberships = [m for m in p.memberships if m.project_id != project_id]
    db.commit()
    db.refresh(p)
    return _person_out(p)


# Summary: progress comes from cards only ---------------------------------
def _summary(db: Session, project_id: str | None) -> Summary:
    """Plan items read the plan_item_progress view. Sections roll up their
    items' cards; projects and the overall figure roll up every card in scope,
    linked to a plan item or not (points-weighted credit)."""
    where = "WHERE project_id = :pid" if project_id else ""
    c_where = "WHERE c.project_id = :pid" if project_id else ""
    args = {"pid": project_id} if project_id else {}
    items = db.execute(text(
        f"SELECT plan_item_id, project_id, section, progress, effective_mode AS mode, card_count, cards_done "
        f"FROM {P}plan_item_progress {where}"), args).mappings().all()
    sections = db.execute(text(
        f"SELECT p.project_id, p.section, {CARD_PROGRESS_SQL} AS progress "
        f"FROM {P}cards c JOIN {P}plan_items p ON p.id = c.plan_item_id {c_where} "
        f"GROUP BY p.project_id, p.section"), args).mappings().all()
    projects = db.execute(text(
        f"SELECT c.project_id, {CARD_PROGRESS_SQL} AS progress FROM {P}cards c {c_where} "
        f"GROUP BY c.project_id"), args).mappings().all()
    overall = db.scalar(text(f"SELECT {CARD_PROGRESS_SQL} FROM {P}cards c {c_where}"), args)
    rnd = lambda v: round(float(v or 0), 1)  # noqa: E731
    return Summary(
        items=[{**r, "progress": rnd(r["progress"])} for r in items],
        sections=[{**r, "progress": rnd(r["progress"])} for r in sections],
        projects=[{**r, "progress": rnd(r["progress"])} for r in projects],
        overall=rnd(overall),
    )


@router.get("/summary", response_model=Summary)
def summary(db: Session = DB):
    return _summary(db, None)


@router.get("/digest")
def digest(today: date | None = None, db: Session = DB):
    """At-a-glance numbers for the portfolio admin hub. `today` is the caller's local date (late and
    due-soon depend on it); the server's date is the fallback."""
    today = today or date.today()
    week_end = today + timedelta(days=7)
    projects = [p for p in db.scalars(select(Project).order_by(Project.order)) if not p.archived]
    live = {p.id for p in projects}
    cards = [c for c in db.scalars(select(Card)) if c.project_id in live]
    open_cards = [c for c in cards if c.status != "done"]
    late = sorted((c for c in open_cards if c.due and c.due < today), key=lambda c: c.due)
    soon = sorted((c for c in open_cards if c.due and today <= c.due <= week_end), key=lambda c: c.due)
    summary_ = _summary(db, None)
    progress = {r.project_id: r.progress for r in summary_.projects}
    code = {p.id: p.code for p in projects}
    card = lambda c: {"title": c.title, "project": code[c.project_id], "due": c.due.isoformat(), "status": c.status}  # noqa: E731
    return {
        "overall": summary_.overall,
        "projects": [
            {"code": p.code, "name": p.name, "progress": progress.get(p.id, 0.0),
             "open": sum(c.project_id == p.id for c in open_cards),
             "late": sum(c.project_id == p.id for c in late)}
            for p in projects
        ],
        "cards": {s: sum(c.status == s for c in cards) for s in ("backlog", "todo", "doing", "review", "done")},
        "lateCount": len(late),
        "dueThisWeek": len(soon),
        "attention": [card(c) for c in (late + soon)[:4]],
    }


@router.get("/projects/{id}/summary", response_model=Summary)
def project_summary(id: str, db: Session = DB):
    _get(db, Project, id)
    return _summary(db, id)


@router.get("/export")
def export(db: Session = DB):
    """Full JSON backup; `python -m app.seed import` reads it back."""
    dump = lambda model, rows: [model.model_validate(r).model_dump(mode="json", by_alias=True) for r in rows]  # noqa: E731
    return {
        "projects": dump(ProjectOut, list_projects(db)),
        "people": [p.model_dump(mode="json", by_alias=True) for p in list_people(db)],
        "planItems": dump(PlanItemOut, list_plan_items(None, db)),
        "cards": dump(CardOut, list_cards(None, db)),
        "notes": dump(NoteOut, list_notes(db)),
    }
