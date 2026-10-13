import os
import tempfile

os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL") or "sqlite:///" + os.path.join(tempfile.mkdtemp(), "test.db")
os.environ.pop("WORKBENCH_PASSWORD", None)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture()
def c():
    with TestClient(app) as client:
        # fresh data per test
        from app.db import SessionLocal
        from app.seed import wipe
        with SessionLocal() as db:
            wipe(db)
            db.commit()
        yield client


def mk_project(c, code="DIC", name="DIC Abandonment"):
    return c.post("/api/projects", json={"name": name, "code": code}).json()


def mk_item(c, pid, **kw):
    body = {"projectId": pid, "title": "Item", "section": "S", "start": "2026-10-01", "end": "2026-10-10"} | kw
    r = c.post("/api/plan_items", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def mk_card(c, **kw):
    r = c.post("/api/cards", json={"title": "Card"} | kw)
    assert r.status_code == 201, r.text
    return r.json()


def item_progress(c, item_id):
    s = c.get("/api/summary").json()
    return next(i for i in s["items"] if i["planItemId"] == item_id)


def test_progress_is_points_weighted_credit(c):
    p = mk_project(c)
    it = mk_item(c, p["id"])
    mk_card(c, planItemId=it["id"], points=3, status="done")    # 3 * 1.00
    mk_card(c, planItemId=it["id"], points=2, status="doing")   # 2 * 0.50
    mk_card(c, planItemId=it["id"], points=5, status="review")  # 5 * 0.75
    mk_card(c, planItemId=it["id"], points=8, status="todo")    # 8 * 0
    got = item_progress(c, it["id"])
    assert got["mode"] == "auto"
    assert got["progress"] == pytest.approx(round(100 * (3 + 1 + 3.75) / 18, 1))
    assert (got["cardCount"], got["cardsDone"]) == (4, 1)


def test_moving_card_updates_progress(c):
    p = mk_project(c)
    it = mk_item(c, p["id"])
    card = mk_card(c, planItemId=it["id"], status="doing", points=2)
    assert item_progress(c, it["id"])["progress"] == 50
    c.patch(f"/api/cards/{card['id']}", json={"status": "done"})
    assert item_progress(c, it["id"])["progress"] == 100


def test_plan_item_progress_only_from_cards(c):
    p = mk_project(c)
    # A typed-in % (old data, prototype import) is ignored.
    it = mk_item(c, p["id"], manualProgress=40, progressMode="manual")
    assert item_progress(c, it["id"])["progress"] == 0
    mk_card(c, planItemId=it["id"], status="review", points=2)
    assert item_progress(c, it["id"])["progress"] == 75
    assert item_progress(c, it["id"])["mode"] == "auto"


def test_rollups_come_from_cards_including_unlinked(c):
    p = mk_project(c)
    a = mk_item(c, p["id"], section="A", manualProgress=100)
    b = mk_item(c, p["id"], section="B")
    mk_card(c, planItemId=a["id"], status="done", points=3)   # A: 3/3
    mk_card(c, planItemId=b["id"], status="todo", points=1)   # B: 0/1
    mk_card(c, projectId=p["id"], status="doing", points=5)   # unlinked: 2.5/5
    s = c.get(f"/api/projects/{p['id']}/summary").json()
    sections = {x["section"]: x["progress"] for x in s["sections"]}
    assert sections == {"A": 100, "B": 0}
    assert s["projects"][0]["progress"] == pytest.approx(round(100 * 5.5 / 9, 1))
    assert s["overall"] == s["projects"][0]["progress"]
    other = mk_project(c, "OPS", "Ops")
    mk_card(c, projectId=other["id"], status="done", points=8)
    assert c.get("/api/summary").json()["overall"] == pytest.approx(round(100 * 13.5 / 17, 1))


def test_delete_plan_item_unlinks_cards(c):
    p = mk_project(c)
    it = mk_item(c, p["id"])
    card = mk_card(c, planItemId=it["id"])
    assert c.delete(f"/api/plan_items/{it['id']}").status_code == 204
    after = next(x for x in c.get("/api/cards").json() if x["id"] == card["id"])
    assert after["planItemId"] is None and after["projectId"] == p["id"]


def test_project_with_content_cannot_be_deleted(c):
    p = mk_project(c)
    mk_card(c, projectId=p["id"])
    assert c.delete(f"/api/projects/{p['id']}").status_code == 409
    empty = mk_project(c, code="NEW", name="New")
    assert c.delete(f"/api/projects/{empty['id']}").status_code == 204


def test_remove_person_from_one_project_keeps_other_assignments(c):
    a, b = mk_project(c, "AA", "A"), mk_project(c, "BB", "B")
    person = c.post("/api/people", json={"name": "Saufi", "projectIds": [a["id"], b["id"]]}).json()
    ia = mk_item(c, a["id"], ownerId=person["id"])
    ib = mk_item(c, b["id"], ownerId=person["id"])
    ca = mk_card(c, projectId=a["id"], assigneeId=person["id"])
    cb = mk_card(c, planItemId=ib["id"], assigneeId=person["id"])
    r = c.delete(f"/api/people/{person['id']}/projects/{a['id']}")
    assert r.json()["projectIds"] == [b["id"]]
    cards = {x["id"]: x for x in c.get("/api/cards").json()}
    items = {x["id"]: x for x in c.get("/api/plan_items").json()}
    assert cards[ca["id"]]["assigneeId"] is None and items[ia["id"]]["ownerId"] is None
    assert cards[cb["id"]]["assigneeId"] == person["id"] and items[ib["id"]]["ownerId"] == person["id"]


def test_new_project_is_empty_and_listed(c):
    mk_project(c)
    p2 = mk_project(c, "OPS", "Ops")
    assert [p["code"] for p in c.get("/api/projects").json()] == ["DIC", "OPS"]
    s = c.get(f"/api/projects/{p2['id']}/summary").json()
    assert s["items"] == [] and s["overall"] == 0


def test_validation(c):
    p = mk_project(c)
    assert c.post("/api/projects", json={"name": "x", "code": "toolong"}).status_code == 422
    assert c.post("/api/cards", json={"title": "x", "projectId": p["id"], "points": 4}).status_code == 422
    r = c.post("/api/plan_items", json={"projectId": p["id"], "title": "x", "start": "2026-10-10", "end": "2026-10-01"})
    assert r.status_code == 422


def test_import_prototype_field_names(c):
    from app.db import SessionLocal
    from app.seed import import_data
    raw = {
        "people": [{"id": "u1", "name": "Razeen"}, {"id": "u2", "name": "Haris Ari"}],
        "items": [{"id": "x1", "title": "Mapping", "section": "Decom", "assignee": "u2",
                   "start": "2026-10-01", "end": "2026-10-20", "progress": 30}],
        "cards": [{"title": "Map tables", "link": "x1", "status": "In progress", "assignee": "u1", "points": 3}],
    }
    with SessionLocal() as db:
        counts = import_data(db, raw)
        db.commit()
    assert counts == {"projects": 1, "people": 2, "planItems": 1, "cards": 1, "notes": 0}
    item = c.get("/api/plan_items").json()[0]
    assert item["ownerId"] == "u2" and item["manualProgress"] == 30
    card = c.get("/api/cards").json()[0]
    assert card["planItemId"] == "x1" and card["status"] == "doing"
    assert [p["isMe"] for p in c.get("/api/people").json()] == [True, False]


def test_notes_crud_and_promote_to_card(c):
    p = mk_project(c)
    it = mk_item(c, p["id"])
    r = c.post("/api/notes", json={"text": "  Check cost tables with finance  ", "projectId": p["id"]})
    assert r.status_code == 201, r.text
    n = r.json()
    assert n["text"] == "Check cost tables with finance"
    loose = c.post("/api/notes", json={"text": "Unfiled idea"}).json()
    assert loose["projectId"] is None
    # Newest first.
    assert [x["id"] for x in c.get("/api/notes").json()] == [loose["id"], n["id"]]

    r = c.patch(f"/api/notes/{loose['id']}", json={"text": "Filed idea", "projectId": p["id"]})
    assert r.json()["projectId"] == p["id"] and r.json()["text"] == "Filed idea"

    # Promote: becomes a linked card (title defaults to the note text) and the note is gone.
    r = c.post(f"/api/notes/{n['id']}/promote", json={"planItemId": it["id"], "status": "todo", "points": 3})
    assert r.status_code == 201, r.text
    card = r.json()
    assert (card["title"], card["planItemId"], card["projectId"], card["points"]) == (
        "Check cost tables with finance", it["id"], p["id"], 3)
    assert [x["id"] for x in c.get("/api/notes").json()] == [loose["id"]]
    assert item_progress(c, it["id"])["cardCount"] == 1

    # Unlinked promote uses the note's project; a custom title wins.
    card2 = c.post(f"/api/notes/{loose['id']}/promote", json={"title": "Custom"}).json()
    assert (card2["title"], card2["projectId"], card2["planItemId"]) == ("Custom", p["id"], None)
    assert c.get("/api/notes").json() == []


def test_note_promote_needs_a_project(c):
    n = c.post("/api/notes", json={"text": "Nowhere"}).json()
    r = c.post(f"/api/notes/{n['id']}/promote", json={})
    assert r.status_code == 422
    assert len(c.get("/api/notes").json()) == 1  # nothing lost


def test_deleting_project_unfiles_its_notes(c):
    p = mk_project(c)
    n = c.post("/api/notes", json={"text": "Keep me", "projectId": p["id"]}).json()
    assert c.delete(f"/api/projects/{p['id']}").status_code == 204
    left = c.get("/api/notes").json()
    assert [(x["id"], x["projectId"]) for x in left] == [(n["id"], None)]


@pytest.fixture()
def locked(c, monkeypatch):
    """The same app with a password set, and a fresh cookie jar."""
    from app import auth
    monkeypatch.setattr(auth, "PASSWORD", "s3cret")
    monkeypatch.setattr(auth, "VIEW_ONLY", True)
    c.cookies.clear()
    return c


def test_password_required_when_set(locked):
    assert locked.get("/api/projects").status_code == 401
    assert locked.get("/api/auth/status").json() == {"required": True, "ok": False, "role": None, "viewOnly": True}
    assert locked.post("/api/auth/login", json={"password": "nope"}).status_code == 401


def test_password_signs_in_to_edit(locked):
    assert locked.post("/api/auth/login", json={"password": "s3cret"}).json()["role"] == "edit"
    assert locked.get("/api/auth/status").json()["role"] == "edit"
    assert locked.post("/api/projects", json={"name": "Edit", "code": "ED"}).status_code == 201


def test_view_only_reads_but_cannot_write(locked):
    # Seed data as an editor, then switch to view only.
    locked.post("/api/auth/login", json={"password": "s3cret"})
    p = mk_project(locked)
    n = locked.post("/api/notes", json={"text": "x"}).json()
    locked.post("/api/auth/logout")
    locked.cookies.clear()

    assert locked.post("/api/auth/view").json()["role"] == "view"
    assert locked.get("/api/auth/status").json()["role"] == "view"
    assert [x["id"] for x in locked.get("/api/projects").json()] == [p["id"]]
    assert locked.get("/api/summary").status_code == 200
    for method, path, body in [
        ("post", "/api/projects", {"name": "No", "code": "NO"}),
        ("patch", f"/api/projects/{p['id']}", {"name": "No"}),
        ("delete", f"/api/projects/{p['id']}", None),
        ("post", "/api/cards", {"title": "No", "projectId": p["id"]}),
        ("post", f"/api/notes/{n['id']}/promote", {}),
        ("put", f"/api/people/x/projects/{p['id']}", None),
    ]:
        kw = {"json": body} if body is not None else {}
        r = getattr(locked, method)(path, **kw)
        assert r.status_code == 403, (method, path, r.status_code)
    # Nothing changed.
    assert locked.get("/api/projects").json()[0]["name"] == "DIC Abandonment"
    assert len(locked.get("/api/notes").json()) == 1


def test_view_only_can_be_turned_off(locked, monkeypatch):
    from app import auth
    monkeypatch.setattr(auth, "VIEW_ONLY", False)
    assert locked.post("/api/auth/view").status_code == 404
    assert locked.get("/api/auth/status").json()["viewOnly"] is False
