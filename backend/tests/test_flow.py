"""End-to-end tests against a real database.

Run with:  DATABASE_URL=postgresql+psycopg://porshi:porshi@localhost:5432/porshi_test pytest -q
The test database is wiped and re-seeded at the start.
"""
import os

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://porshi:porshi@localhost:5432/porshi_test")
os.environ["SEED_ON_START"] = "false"
os.environ["DEMO_MODE"] = "true"
os.environ.setdefault("UPLOAD_DIR", "/tmp/porshi-test-uploads")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.seed import DEMO_PASSWORD, seed  # noqa: E402


@pytest.fixture(scope="module")
def client():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed(db)
    with TestClient(app) as c:
        yield c


def login(client, phone):
    r = client.post("/api/auth/login", json={"phone": phone, "password": DEMO_PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


ADMIN, SALES, TECH, ACCT = "01711003001", "01711003003", "01711002001", "01711003006"


def test_public_site(client):
    r = client.get("/api/public/site").json()
    assert len(r["models"]) == 4 and r["settings"]["offers"]
    assert {m["name"]: m["in_stock"] for m in r["models"]}["Mini Go"] == 3
    assert all("stock" not in p for p in r["parts"])  # exact stock is not public


def test_wrong_password_and_roles(client):
    assert client.post("/api/auth/login", json={"phone": ADMIN, "password": "nope"}).status_code == 400
    tech = login(client, TECH)
    assert client.get("/api/jobs", headers=tech).status_code == 200
    assert client.get("/api/payments", headers=tech).status_code == 403
    assert client.get("/api/settings", headers=login(client, SALES)).status_code == 403
    assert client.get("/api/dashboard").status_code == 401


def test_website_bookings_create_leads_and_jobs(client):
    assert client.post("/api/public/test-ride", json={"name": "Test User", "phone": "01799999999", "model_id": 1}).status_code == 200
    assert client.post("/api/public/test-ride", json={"name": "Bad", "phone": "12345", "model_id": 1}).status_code == 422
    r = client.post("/api/public/service-booking", json={"name": "Rahim Ahmed", "phone": "+8801711000101", "complaint": "Brake check"})
    assert r.json()["job_number"] == 248
    r = client.post("/api/public/enquiry", json={"name": "Finance Fan", "phone": "01799999990", "model_id": 2, "kind": "finance"})
    assert r.status_code == 200
    leads = client.get("/api/leads", headers=login(client, SALES)).json()
    assert any(l["customer"]["phone"] == "01799999999" and l["stage_name"] == "Test ride" for l in leads)
    assert any("Finance enquiry" in l["note"] for l in leads)


def test_quotation_order_payment_delivery(client):
    h = login(client, SALES)
    cust = next(c for c in client.get("/api/customers?q=Nasrin", headers=h).json())
    q = client.post("/api/quotations", json={"customer_id": cust["id"], "model_id": 1, "discount": 3000, "advance": 20000}, headers=h).json()
    assert q["final_price"] == 115000 and q["balance"] == 95000
    o = client.post(f"/api/quotations/{q['id']}/convert", headers=h).json()
    assert o["number"] == 1082 and o["paid"] == 20000 and o["chassis_no"]
    acct = login(client, ACCT)
    assert client.post("/api/payments", json={"order_id": o["id"], "amount": 999999, "method": "bKash"}, headers=acct).status_code == 400
    p = client.post("/api/payments", json={"order_id": o["id"], "amount": 5000, "method": "bKash"}, headers=acct).json()
    assert p["balance_after"] == 90000
    d = client.post(f"/api/orders/{o['id']}/deliver", headers=h).json()
    assert d["status"] == "delivered"
    bats = client.get("/api/batteries", headers=login(client, ADMIN)).json()
    b = next(x for x in bats if x["chassis_no"] == o["chassis_no"])
    assert b["status"] == "fitted" and b["warranty_left"] == 24 and b["owner"] == "Nasrin Akter"


def test_service_job_parts_and_ready_sms(client):
    h = login(client, ADMIN)
    jobs = client.get("/api/jobs", headers=h).json()
    j = next(x for x in jobs if x["number"] == 246)
    before = next(p for p in client.get("/api/parts", headers=h).json() if p["name"] == "Brake pad")
    r = client.post(f"/api/jobs/{j['id']}/items", json={"part_id": before["id"], "qty": 1}, headers=h).json()
    assert r["parts_total"] == 450
    after = next(p for p in client.get("/api/parts", headers=h).json() if p["name"] == "Brake pad")
    assert after["stock"] == before["stock"] - 1 and after["ledger"]["svc"] == before["ledger"]["svc"] + 1
    r = client.patch(f"/api/jobs/{j['id']}", json={"stage": 4}, headers=h).json()
    assert r["sms"] and "সম্পন্ন" in r["sms"]["message"]


def test_ledger_adds_up_and_blocks_negative(client):
    h = login(client, ADMIN)
    for p in client.get("/api/parts", headers=h).json():
        L = p["ledger"]
        assert L["open"] + L["buy"] - L["sale"] - L["svc"] + L["ret"] - L["dmg"] == p["stock"], p["name"]
    pid = client.get("/api/parts", headers=h).json()[0]["id"]
    assert client.post("/api/inventory", json={"part_id": pid, "type": "sale", "qty": 9999}, headers=h).status_code == 400
    assert client.post("/api/inventory", json={"part_id": pid, "type": "buy", "qty": 10, "reference": "PO-400"}, headers=h).status_code == 200


def test_battery_replace_and_claims(client):
    h = login(client, ADMIN)
    b = next(x for x in client.get("/api/batteries", headers=h).json() if x["serial"] == "BT60-55130")
    assert b["health_label"] == "weak"
    new = client.post(f"/api/batteries/{b['id']}/replace", headers=h).json()
    assert new["serial"] == "BT60-56001" and new["status"] == "fitted"
    assert client.post(f"/api/batteries/{b['id']}/replace", headers=h).status_code == 400
    c = client.post("/api/claims", json={"vehicle_id": new["vehicle_id"], "component": "Motor", "description": "Noise"}, headers=h).json()
    assert c["number"] == 302
    assert client.patch(f"/api/claims/{c['id']}", json={"status": "Approved"}, headers=h).json()["status"] == "Approved"


def test_reminders_and_portal(client):
    h = login(client, ADMIN)
    rem = client.get("/api/reminders", headers=h).json()
    kinds = {r["kind"] for r in rem}
    assert "pay" in kinds and "war" in kinds  # Rubel's battery warranty is about to end
    n = client.post("/api/reminders/send", json={"keys": []}, headers=h).json()["queued"]
    assert n == len(rem)
    assert all(r["queued"] for r in client.get("/api/reminders", headers=h).json())
    assert client.post("/api/portal/otp", json={"phone": "01799999999"}).status_code == 404
    code = client.post("/api/portal/otp", json={"phone": "01711000101"}).json()["demo_code"]
    assert client.post("/api/portal/verify", json={"phone": "01711000101", "code": "0000"}).status_code == 400
    tok = client.post("/api/portal/verify", json={"phone": "01711000101", "code": code}).json()["token"]
    me = client.get("/api/portal/me", headers={"Authorization": f"Bearer {tok}"}).json()
    assert me["bikes"][0]["battery"]["serial"] == "BT60-56001" and me["balance"] == 70000
    assert client.get("/api/dashboard", headers={"Authorization": f"Bearer {tok}"}).status_code == 403


def test_catalogue_settings_staff_reports_audit(client):
    h = login(client, ADMIN)
    m = client.post("/api/models", json={"code": "bolt", "name": "Bolt", "price": 99000, "colours": ["#ff0000", "bad"]}, headers=h).json()
    assert m["colours"] == ["#ff0000"]
    assert client.delete(f"/api/models/{m['id']}", headers=h).status_code == 200
    assert client.delete("/api/models/1", headers=h).status_code == 400
    s = client.put("/api/settings", json={"phone": "01711120946", "vehicle_warranty_months": "18", "junk": 1}, headers=h).json()
    assert s["phone"] == "01711120946" and s["vehicle_warranty_months"] == 18 and "junk" not in s
    assert client.get("/api/public/site").json()["settings"]["phone"] == "01711120946"
    u = client.post("/api/users", json={"name": "New Tech", "phone": "01722222222", "role": "tech", "password": "secret1"}, headers=h).json()
    assert client.post("/api/auth/login", json={"phone": "01722222222", "password": "secret1"}).status_code == 200
    client.patch(f"/api/users/{u['id']}", json={"active": False}, headers=h)
    assert client.post("/api/auth/login", json={"phone": "01722222222", "password": "secret1"}).status_code == 400
    me_id = client.get("/api/auth/me", headers=h).json()["id"]
    assert client.patch(f"/api/users/{me_id}", json={"role": "sales"}, headers=h).status_code == 400
    rep = client.get("/api/reports", headers=h).json()
    assert rep["funnel"][0][1] >= rep["funnel"][-1][1]
    csv = client.get("/api/reports/owed.csv", headers=h)
    assert csv.status_code == 200 and csv.text.startswith("Customer,Phone")
    log = client.get("/api/audit", headers=h).json()
    assert any("Delivered order #1082" in e["action"] for e in log["entries"])
    dash = client.get("/api/dashboard", headers=h).json()
    assert dash["today"]["collections"] >= 15000 and dash["today"]["new_leads"] >= 2
