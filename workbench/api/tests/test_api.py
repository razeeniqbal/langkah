import os
import tempfile

os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "test.db")
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


def test_manual_progress_without_cards_and_manual_mode(c):
    p = mk_project(c)
    it = mk_item(c, p["id"], manualProgress=40)
    assert item_progress(c, it["id"])["progress"] == 40
    assert item_progress(c, it["id"])["mode"] == "manual"
    mk_card(c, planItemId=it["id"], status="todo")
    assert item_progress(c, it["id"])["progress"] == 0  # auto once a card is linked
    c.patch(f"/api/plan_items/{it['id']}", json={"progressMode": "manual"})
    assert item_progress(c, it["id"])["progress"] == 40


def test_rollups_are_duration_weighted_and_skip_milestones(c):
    p = mk_project(c)
    mk_item(c, p["id"], start="2026-10-01", end="2026-10-10", manualProgress=100)  # 10 days
    mk_item(c, p["id"], start="2026-10-01", end="2026-10-30", manualProgress=0)    # 30 days
    mk_item(c, p["id"], start="2026-10-05", end="2026-10-05", milestone=True, manualProgress=0)
    s = c.get(f"/api/projects/{p['id']}/summary").json()
    assert s["projects"][0]["progress"] == 25
    assert s["sections"][0]["progress"] == 25
    assert s["overall"] == 25


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
    assert counts == {"projects": 1, "people": 2, "planItems": 1, "cards": 1}
    item = c.get("/api/plan_items").json()[0]
    assert item["ownerId"] == "u2" and item["manualProgress"] == 30
    card = c.get("/api/cards").json()[0]
    assert card["planItemId"] == "x1" and card["status"] == "doing"
    assert [p["isMe"] for p in c.get("/api/people").json()] == [True, False]
