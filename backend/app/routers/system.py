"""Dashboard, reports, reminders, staff, settings and audit log."""
import csv
import io
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import (AuditLog, Battery, Customer, InventoryTxn, Lead, Notification, Order, Payment, ServiceItem, ServiceJob,
                      Setting, SparePart, User, Vehicle, VehicleModel, WarrantyClaim)
from ..schemas import Broadcast, SendReminders, UserIn, UserPatch
from ..security import PERMISSIONS, ROLES, ALL_AREAS, hash_password, require
from ..serializers import user_out
from ..services import (DEFAULT_SETTINGS, LEAD_STAGES, MESSAGES, audit, due_reminders, get_or_404, get_settings,
                        send_sms)

router = APIRouter(prefix="/api", tags=["system"])


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db), _=Depends(require("dash"))):
    today = date.today()
    month = today.replace(day=1)
    pay_today = db.scalar(select(func.coalesce(func.sum(Payment.amount), 0)).where(Payment.paid_on == today))
    pay_month = db.scalar(select(func.coalesce(func.sum(Payment.amount), 0)).where(Payment.paid_on >= month))
    counter = db.execute(select(InventoryTxn.qty, SparePart.price).join(SparePart)
                         .where(InventoryTxn.type == "sale", InventoryTxn.created_on == today)).all()
    jobs = db.scalars(select(ServiceJob)).all()
    orders = db.scalars(select(Order)).all()
    leads = db.scalars(select(Lead)).all()
    sold = dict(db.execute(select(VehicleModel.name, func.count(Order.id)).join(Order, Order.model_id == VehicleModel.id)
                           .where(Order.created_on >= month.replace(month=1)).group_by(VehicleModel.name)).all())
    return {
        "today": {
            "collections": pay_today,
            "new_customers": db.scalar(select(func.count()).select_from(Customer).where(Customer.created_on == today)),
            "new_leads": sum(1 for l in leads if l.created_on == today),
            "test_rides": sum(1 for l in leads if l.stage == 3),
            "delivered": sum(1 for o in orders if o.delivered_on == today),
            "parts_revenue": sum(q * p for q, p in counter),
        },
        "open_leads": sum(1 for l in leads if l.stage < 6),
        "open_jobs": sum(1 for j in jobs if j.stage < 5),
        "service_revenue": sum(j.total for j in jobs if j.stage >= 4),
        "outstanding": sum(max(0, o.balance) for o in orders),
        "collected_month": pay_month,
        "bikes_in_stock": db.scalar(select(func.count()).select_from(Vehicle).where(Vehicle.status == "stock")),
        "parts_low": db.scalar(select(func.count()).select_from(SparePart).where(SparePart.stock < SparePart.min_stock)),
        "customers": db.scalar(select(func.count()).select_from(Customer)),
        "booked_orders": sum(1 for o in orders if o.status == "booked"),
        "payments_month": db.scalar(select(func.count()).select_from(Payment).where(Payment.paid_on >= month)),
        "available_mechanics": db.scalar(select(func.count()).select_from(User).where(User.role == "tech", User.active, User.available)),
        "parts_issued": db.scalar(select(func.count()).select_from(ServiceItem)),
        "batteries": db.scalar(select(func.count()).select_from(Battery).where(Battery.status != "replaced")),
        "parts_count": db.scalar(select(func.count()).select_from(SparePart)),
        "open_claims": db.scalar(select(func.count()).select_from(WarrantyClaim).where(WarrantyClaim.status != "Closed")),
        "sold_by_model": sold,
        "follow_up": [{"id": l.id, "name": l.customer.name, "phone": l.customer.phone,
                       "model": l.model.name if l.model else None, "stage": LEAD_STAGES[l.stage]}
                      for l in leads if l.follow_up and l.stage < 6],
    }


def _report(db: Session, month: str):
    try:
        y, m = map(int, month.split("-"))
        start = date(y, m, 1)
        end = date(y + (m == 12), m % 12 + 1, 1)
    except ValueError:
        raise HTTPException(400, "Month must look like 2026-11")
    orders = db.scalars(select(Order)).all()
    bike = sum(o.final_price for o in orders if start <= o.created_on < end)
    jobs = [j for j in db.scalars(select(ServiceJob)).all() if start <= j.created_on < end]
    counter = db.execute(select(InventoryTxn.qty, SparePart.price).join(SparePart).where(
        InventoryTxn.type == "sale", InventoryTxn.created_on >= start, InventoryTxn.created_on < end)).all()
    leads = db.scalars(select(Lead)).all()
    by_model: dict[str, list[int]] = {}
    for o in orders:
        r = by_model.setdefault(o.model.name, [0, 0])
        r[0] += 1
        r[1] += o.final_price
    owed = {}
    for o in orders:
        if o.balance > 0:
            k = (o.customer.name, o.customer.phone)
            owed[k] = owed.get(k, 0) + o.balance
    return {
        "month": month,
        "revenue": [["Bike sales", bike], ["Service labour", sum(j.labour for j in jobs if j.stage >= 4)],
                    ["Parts used in service", sum(j.parts_total for j in jobs)],
                    ["Counter parts sales", sum(q * p for q, p in counter)]],
        "funnel": [[s, sum(1 for l in leads if l.stage >= i)] for i, s in enumerate(LEAD_STAGES)],
        "by_model": sorted([[k, v[0], v[1]] for k, v in by_model.items()], key=lambda r: -r[2]),
        "owed": sorted([[k[0], k[1], v] for k, v in owed.items()], key=lambda r: -r[2]),
        "collections": [list(r) for r in db.execute(select(Payment.method, func.sum(Payment.amount)).where(
            Payment.paid_on >= start, Payment.paid_on < end).group_by(Payment.method)).all()],
    }


@router.get("/reports")
def reports(month: str | None = None, db: Session = Depends(get_db), _=Depends(require("reports"))):
    return _report(db, month or date.today().strftime("%Y-%m"))


@router.get("/reports/{name}.csv")
def report_csv(name: str, month: str | None = None, db: Session = Depends(get_db), _=Depends(require("reports"))):
    rep = _report(db, month or date.today().strftime("%Y-%m"))
    heads = {"revenue": ["Stream", "BDT"], "funnel": ["Stage", "Leads"], "by_model": ["Model", "Orders", "Value BDT"],
             "owed": ["Customer", "Phone", "Outstanding BDT"], "collections": ["Method", "BDT"]}
    if name not in heads:
        raise HTTPException(404, "Unknown report")
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(heads[name])
    w.writerows(rep[name])
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="porshi-{name}-{rep["month"]}.csv"'})


# ---------- reminders ----------

@router.get("/reminders")
def reminders(db: Session = Depends(get_db), _=Depends(require("remind"))):
    return [{"key": r["key"], "kind": r["kind"], "customer": r["customer"].name, "phone": r["customer"].phone,
             "message_en": r["message_en"], "message_bn": r["message_bn"], "queued": r["queued"]}
            for r in due_reminders(db)]


@router.post("/reminders/send")
def send_reminders(body: SendReminders, db: Session = Depends(get_db), u=Depends(require("remind"))):
    n = 0
    for r in due_reminders(db):
        if r["queued"] or (body.keys and r["key"] not in body.keys):
            continue
        send_sms(db, r["customer"].phone, r["message_bn"], r["kind"], r["customer"], r["key"])
        n += 1
    audit(db, u.name, f"Queued {n} reminder SMS")
    db.commit()
    return {"queued": n}


@router.post("/reminders/new-model")
def broadcast(body: Broadcast, db: Session = Depends(get_db), u=Depends(require("remind"))):
    m = get_or_404(db, VehicleModel, body.model_id, "Model not found")
    key = f"new:{m.id}"
    if db.scalar(select(func.count()).select_from(Notification).where(Notification.reminder_key.like(key + ":%"))):
        raise HTTPException(400, "This announcement was already sent")
    msg = MESSAGES["new"][1].format(m=m.name)
    cs = db.scalars(select(Customer)).all()
    for c in cs:
        send_sms(db, c.phone, msg, "new", c, f"{key}:{c.id}")
    audit(db, u.name, f"Queued new-model SMS for {m.name} to {len(cs)} customers")
    db.commit()
    return {"queued": len(cs)}


# ---------- staff ----------

@router.get("/users")
def users(db: Session = Depends(get_db), _=Depends(require("staff"))):
    return {"users": [user_out(x) for x in db.scalars(select(User).order_by(User.id))], "roles": ROLES,
            "permissions": {k: (ALL_AREAS if v == "*" else v) for k, v in PERMISSIONS.items()}, "areas": ALL_AREAS}


@router.post("/users")
def add_user(body: UserIn, db: Session = Depends(get_db), u=Depends(require("staff"))):
    if db.scalar(select(User).where(User.phone == body.phone)):
        raise HTTPException(409, "This phone number already has an account")
    x = User(name=body.name, phone=body.phone, role=body.role, password_hash=hash_password(body.password),
             speciality=body.speciality)
    db.add(x)
    audit(db, u.name, f"Added staff {x.name} as {ROLES[x.role]}")
    db.commit()
    return user_out(x)


@router.patch("/users/{uid}")
def edit_user(uid: int, body: UserPatch, db: Session = Depends(get_db), u=Depends(require("staff"))):
    x = get_or_404(db, User, uid, "User not found")
    if x.id == u.id and (body.active is False or (body.role and body.role != "admin")):
        raise HTTPException(400, "You can't remove your own admin access")
    if body.role:
        x.role = body.role
        audit(db, u.name, f"Changed role of {x.name} to {ROLES[x.role]}")
    if body.active is not None:
        x.active = body.active
        audit(db, u.name, f"{'Activated' if x.active else 'Deactivated'} {x.name}")
    if body.password:
        x.password_hash = hash_password(body.password)
        audit(db, u.name, f"Reset password for {x.name}")
    if body.speciality is not None:
        x.speciality = body.speciality
    if body.available is not None:
        x.available = body.available
    db.commit()
    return user_out(x)


# ---------- settings and audit ----------

@router.get("/settings")
def read_settings(db: Session = Depends(get_db), _=Depends(require("settings"))):
    return get_settings(db)


@router.put("/settings")
def write_settings(body: dict, db: Session = Depends(get_db), u=Depends(require("settings"))):
    clean = {}
    for k, default in DEFAULT_SETTINGS.items():
        if k not in body:
            continue
        v = body[k]
        if isinstance(default, int):
            try:
                v = max(0, min(120, int(v)))
            except (TypeError, ValueError):
                raise HTTPException(400, f"{k} must be a number")
        elif k == "offers":
            v = [{"en": str(o.get("en", ""))[:120], "bn": str(o.get("bn", ""))[:120], "tag": str(o.get("tag", ""))[:20]}
                 for o in (v or [])[:6] if isinstance(o, dict) and (o.get("en") or o.get("bn"))]
        else:
            v = str(v)[:160]
        clean[k] = v
    row = db.get(Setting, "business")
    if row:
        row.value = {**row.value, **clean}
    else:
        db.add(Setting(key="business", value=clean))
    audit(db, u.name, "Updated business settings")
    db.commit()
    return get_settings(db)


@router.get("/audit")
def audit_log(user: str = "", db: Session = Depends(get_db), _=Depends(require("audit"))):
    stmt = select(AuditLog).order_by(AuditLog.id.desc()).limit(500)
    if user:
        stmt = stmt.where(AuditLog.user_name == user)
    rows = db.scalars(stmt).all()
    names = db.scalars(select(AuditLog.user_name).distinct()).all()
    return {"users": sorted(names), "entries": [{"at": a.created_at.isoformat(), "user": a.user_name, "action": a.action}
                                               for a in rows]}
