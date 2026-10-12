"""Seed and migration.

    python -m app.seed demo                 # small demo data set (only into an empty DB)
    python -m app.seed import data.json     # load the artifact export or an /api/export dump
    python -m app.seed import data.json --replace   # wipe first

The importer accepts both the prototype's field names and the new ones:
project -> projectId, assignee -> ownerId (plan items), link -> planItemId
(cards), progress -> manualProgress.
"""
import json
import sys
from datetime import date, timedelta

from sqlalchemy import delete, func, select

from .db import SessionLocal, init_db
from .models import Card, PlanItem, Person, Project, ProjectMember, new_id

STATUS_ALIASES = {
    "backlog": "backlog", "todo": "todo", "to do": "todo", "to-do": "todo",
    "doing": "doing", "in progress": "doing", "inprogress": "doing", "in_progress": "doing", "wip": "doing",
    "review": "review", "in review": "review", "done": "done", "complete": "done", "completed": "done",
}


def _pick(d: dict, *keys, default=None):
    for k in keys:
        if k in d and d[k] is not None:
            return d[k]
    return default


def _date(v) -> date | None:
    if not v:
        return None
    return date.fromisoformat(str(v)[:10])


def _points(v) -> int:
    try:
        n = int(v)
    except (TypeError, ValueError):
        return 1
    return min((1, 2, 3, 5, 8), key=lambda p: abs(p - n))


def _code(name: str) -> str:
    letters = "".join(w[0] for w in name.split() if w[:1].isalnum()).upper()
    return (letters or name[:3].upper())[:3].ljust(2, "X")


def wipe(db) -> None:
    for model in (Card, PlanItem, ProjectMember, Person, Project):
        db.execute(delete(model))


def import_data(db, raw: dict) -> dict:
    data = raw.get("state", raw) if isinstance(raw, dict) else {"planItems": raw}
    counts = {"projects": 0, "people": 0, "planItems": 0, "cards": 0}

    # Projects. The prototype held one project; create it if the dump has none.
    projects = _pick(data, "projects", default=[])
    if isinstance(data.get("project"), dict):
        projects = [data["project"]]
    pid_map: dict[str, str] = {}
    for i, p in enumerate(projects):
        name = _pick(p, "name", "title", default="Untitled")
        proj = Project(id=_pick(p, "id", default=new_id("prj")), name=name,
                       code=str(_pick(p, "code", default=_code(name))).upper()[:3],
                       order=_pick(p, "order", default=i))
        db.add(proj)
        pid_map[str(_pick(p, "id", default=proj.id))] = proj.id
        counts["projects"] += 1
    if not pid_map:
        proj = Project(id="prj_dic", name="DIC Abandonment", code="DIC", order=0)
        db.add(proj)
        counts["projects"] += 1
    default_pid = next(iter(pid_map.values()), "prj_dic")
    db.flush()

    def project_of(d: dict) -> str:
        v = _pick(d, "projectId", "project_id", "project")
        return pid_map.get(str(v), default_pid) if v is not None else default_pid

    # People. Names in place of ids are accepted too.
    person_ids: dict[str, str] = {}
    for p in _pick(data, "people", "team", "members", default=[]):
        if isinstance(p, str):
            p = {"name": p}
        name = _pick(p, "name", default="?").strip()
        is_me = bool(_pick(p, "isMe", "is_me", "me", default=False)) or name.lower().startswith("razeen") \
            or "razeen" in name.lower()
        person = Person(id=_pick(p, "id", default=new_id("ppl")), name=name, is_me=is_me)
        pids = _pick(p, "projectIds", "project_ids", "projects", default=None)
        for pid in ({pid_map.get(str(x), default_pid) for x in pids} if pids else {default_pid}):
            person.memberships.append(ProjectMember(project_id=pid))
        db.add(person)
        person_ids[person.id] = person_ids[name] = person.id
        counts["people"] += 1
    # Only one person may be "me".
    mes = [p for p in db.new if isinstance(p, Person) and p.is_me]
    for extra in mes[1:]:
        extra.is_me = False
    db.flush()

    def person_of(v) -> str | None:
        return person_ids.get(str(v)) if v not in (None, "") else None

    # Plan items.
    item_ids: dict[str, str] = {}
    items = _pick(data, "planItems", "plan_items", "items", "tasks", default=[])
    for i, it in enumerate(items):
        start = _date(_pick(it, "start", "startDate"))
        end = _date(_pick(it, "end", "endDate")) or start
        milestone = bool(_pick(it, "milestone", "isMilestone", default=False))
        if start is None:
            continue
        mode = _pick(it, "progressMode", "progress_mode", default="auto")
        item = PlanItem(
            id=str(_pick(it, "id", default=new_id("pi"))),
            project_id=project_of(it),
            section=str(_pick(it, "section", "group", "phase", default="")),
            title=str(_pick(it, "title", "name", default="Untitled")),
            owner_id=person_of(_pick(it, "ownerId", "owner_id", "owner", "assignee")),
            start=start, end=start if milestone else max(start, end),
            milestone=milestone,
            progress_mode=mode if mode in ("auto", "manual") else "auto",
            manual_progress=max(0, min(100, int(round(float(_pick(it, "manualProgress", "manual_progress", "progress", default=0)))))),
            notes=str(_pick(it, "notes", default="")),
            order=int(_pick(it, "order", default=i)),
        )
        db.add(item)
        item_ids[str(_pick(it, "id", default=item.id))] = item.id
        counts["planItems"] += 1
    db.flush()
    item_project = {i.id: i.project_id for i in db.scalars(select(PlanItem))}

    # Cards.
    for i, c in enumerate(_pick(data, "cards", default=[])):
        link = _pick(c, "planItemId", "plan_item_id", "link")
        link = item_ids.get(str(link)) if link else None
        status = STATUS_ALIASES.get(str(_pick(c, "status", "column", default="backlog")).lower(), "backlog")
        db.add(Card(
            id=str(_pick(c, "id", default=new_id("c"))),
            plan_item_id=link,
            project_id=item_project[link] if link else project_of(c),
            title=str(_pick(c, "title", "name", default="Untitled")),
            assignee_id=person_of(_pick(c, "assigneeId", "assignee_id", "assignee")),
            status=status,
            due=_date(_pick(c, "due", "dueDate")),
            points=_points(_pick(c, "points", "effort", default=1)),
            notes=str(_pick(c, "notes", default="")),
            order=int(_pick(c, "order", default=i)),
        ))
        counts["cards"] += 1
    return counts


def demo(db) -> dict:
    """A small, realistic data set around today's date."""
    t = date.today()
    d = lambda n: (t + timedelta(days=n)).isoformat()  # noqa: E731
    people = [
        {"id": "me", "name": "Razeen Iqbal", "isMe": True, "projectIds": ["dic", "ops"]},
        {"id": "saufi", "name": "Saufi Nila Utama", "projectIds": ["dic"]},
        {"id": "haris", "name": "Haris Ari", "projectIds": ["dic"]},
        {"id": "be1", "name": "BE#1", "projectIds": ["dic"]},
        {"id": "fe1", "name": "FE#1", "projectIds": ["dic", "ops"]},
        {"id": "aina", "name": "Aina Rahman", "projectIds": ["ops"]},
    ]
    items = [
        ("dic", "PSC Management", "Requirements & stakeholder sign-off", "me", -30, -12, False, 100),
        ("dic", "PSC Management", "PSC data model", "saufi", -14, 6, False, 0),
        ("dic", "PSC Management", "PSC dashboard v1", "fe1", 0, 24, False, 0),
        ("dic", "PSC Management", "PSC go-live", "me", 26, 26, True, 0),
        ("dic", "Decom Cost Estimation", "Data & System Mapping", "haris", -10, 12, False, 0),
        ("dic", "Decom Cost Estimation", "Cost model engine", "be1", 8, 40, False, 0),
        ("dic", "Decom Cost Estimation", "Estimator UI", "fe1", 20, 50, False, 0),
        ("dic", "Reporting", "Monthly progress report template", "me", -20, -3, False, 60),
        ("dic", "Reporting", "Steering committee review", "me", 14, 14, True, 0),
        ("ops", "Platform", "Home server hardening", "me", -6, 10, False, 0),
        ("ops", "Platform", "Backup & restore drill", "aina", 5, 18, False, 20),
    ]
    cards = [
        ("PSC data model", "Map cost tables to source schema", "saufi", "doing", 2, 3),
        ("PSC data model", "Draft ERD for PSC entities", "me", "done", -5, 2),
        ("PSC data model", "Review naming conventions with DBA", "saufi", "review", -1, 1),
        ("PSC data model", "Seed reference data", "be1", "todo", 5, 3),
        ("PSC dashboard v1", "Wireframe main PSC view", "fe1", "doing", 4, 3),
        ("PSC dashboard v1", "Wire API for PSC list", "fe1", "backlog", 15, 5),
        ("Data & System Mapping", "Inventory legacy cost spreadsheets", "haris", "done", -6, 3),
        ("Data & System Mapping", "Map cost tables to source schema", "haris", "doing", 3, 5),
        ("Data & System Mapping", "Validate mapping with finance", "me", "todo", 9, 2),
        ("Cost model engine", "Spike: estimation algorithm options", "be1", "backlog", 14, 5),
        ("Home server hardening", "Rotate SSH keys", "me", "done", -2, 1),
        ("Home server hardening", "Tailscale ACL review", "me", "doing", 2, 2),
        (None, "Collect feedback on PRD", "me", "todo", 1, 1),
    ]
    data = {
        "projects": [{"id": "dic", "name": "DIC Abandonment", "code": "DIC"},
                     {"id": "ops", "name": "Home Lab Ops", "code": "OPS"}],
        "people": people,
        "planItems": [
            {"id": f"pi{i}", "projectId": p, "section": s, "title": ti, "ownerId": o,
             "start": d(a), "end": d(b), "milestone": m, "manualProgress": pr, "order": i}
            for i, (p, s, ti, o, a, b, m, pr) in enumerate(items)
        ],
        "cards": [
            {"planItemId": next((f"pi{i}" for i, it in enumerate(items) if it[2] == link), None),
             "projectId": "dic", "title": ti, "assigneeId": who, "status": st, "due": d(due), "points": pts}
            for link, ti, who, st, due, pts in cards
        ],
    }
    return import_data(db, data)


def main(argv: list[str]) -> None:
    init_db()
    if not argv or argv[0] not in ("demo", "import"):
        print(__doc__)
        sys.exit(1)
    with SessionLocal() as db:
        replace = "--replace" in argv
        has_data = db.scalar(select(func.count()).select_from(Project))
        if has_data and not replace:
            print("Database already has data; pass --replace to wipe it first.")
            sys.exit(1)
        if replace:
            wipe(db)
            db.flush()
        if argv[0] == "demo":
            counts = demo(db)
        else:
            with open(argv[1], encoding="utf-8") as f:
                counts = import_data(db, json.load(f))
        db.commit()
    print("Loaded", ", ".join(f"{v} {k}" for k, v in counts.items()))


if __name__ == "__main__":
    main(sys.argv[1:])
