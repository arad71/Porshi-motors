"""Endpoints for the public website and the customer portal (no staff login needed)."""
import secrets
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import Battery, Customer, Lead, OtpCode, Order, ServiceJob, SparePart, Vehicle, VehicleModel
from ..schemas import Enquiry, OtpRequest, OtpVerify, ServiceBooking, TestRide
from ..security import current_customer, make_token
from ..serializers import battery_out, job_out, model_out, order_out, payment_out
from ..services import add_months, audit, get_settings, next_number, send_sms

router = APIRouter(prefix="/api", tags=["public"])


@router.get("/public/site")
def site(db: Session = Depends(get_db)):
    cfg = get_settings(db)
    counts = dict(db.execute(select(Vehicle.model_id, func.count()).where(Vehicle.status == "stock")
                             .group_by(Vehicle.model_id)).all())
    models = db.scalars(select(VehicleModel).where(VehicleModel.visible).order_by(VehicleModel.price)).all()
    parts = db.scalars(select(SparePart).where(SparePart.visible).order_by(SparePart.name)).all()
    bats = db.execute(select(Battery.type, func.count(), func.min(Battery.price)).where(Battery.status == "spare", Battery.price > 0)
                      .group_by(Battery.type).order_by(Battery.type)).all()
    return {
        "batteries": [{"type": t, "available": n, "price_from": p} for t, n, p in bats],
        "settings": {k: cfg[k] for k in ("phone", "whatsapp", "facebook", "address_en", "address_bn", "hours_en",
                                         "hours_bn", "brands", "finance_rate", "offers")},
        "models": [model_out(m, counts.get(m.id, 0)) for m in models],
        "parts": [{"id": p.id, "name": p.name, "name_bn": p.name_bn, "price": p.price, "available": p.stock > 0}
                  for p in parts],
    }


def _customer(db: Session, name: str, phone: str) -> Customer:
    c = db.scalar(select(Customer).where(Customer.phone == phone))
    if not c:
        c = Customer(name=name.strip(), phone=phone, source="Website")
        db.add(c)
        db.flush()
    return c


def _visible_model(db: Session, model_id: int | None) -> VehicleModel | None:
    if model_id is None:
        return None
    m = db.get(VehicleModel, model_id)
    if not m or not m.visible:
        raise HTTPException(404, "Model not found")
    return m


@router.post("/public/test-ride")
def test_ride(body: TestRide, db: Session = Depends(get_db)):
    m = _visible_model(db, body.model_id)
    c = _customer(db, body.name, body.phone)
    note = f"Test ride requested for {body.preferred_date}" if body.preferred_date else "Test ride requested"
    db.add(Lead(customer_id=c.id, model_id=m.id, stage=3, source="Website", note=note))
    audit(db, "Website", f"Test ride booked by {c.name} for {m.name}")
    db.commit()
    return {"ok": True}


@router.post("/public/service-booking")
def service_booking(body: ServiceBooking, db: Session = Depends(get_db)):
    m = _visible_model(db, body.model_id) if body.model_id else None
    c = _customer(db, body.name, body.phone)
    # attach the customer's own bike if we sold them one
    o = db.scalar(select(Order).where(Order.customer_id == c.id, Order.status == "delivered", Order.vehicle_id.isnot(None)))
    no = next_number(db, "job", 245)
    j = ServiceJob(number=no, customer_id=c.id, vehicle_id=o.vehicle_id if o else None,
                   vehicle_desc=(o.model.name if o else (m.name if m else "")), complaint=body.complaint or "General service",
                   labour=400)
    db.add(j)
    audit(db, "Website", f"Service booking from {c.name} created job #{no}")
    db.commit()
    return {"ok": True, "job_number": no}


@router.post("/public/enquiry")
def enquiry(body: Enquiry, db: Session = Depends(get_db)):
    m = _visible_model(db, body.model_id)
    c = _customer(db, body.name, body.phone)
    kind = "Finance" if body.kind == "finance" else "Quotation"
    db.add(Lead(customer_id=c.id, model_id=m.id, stage=2, source="Website", note=f"{kind} enquiry. {body.message}".strip()))
    audit(db, "Website", f"{kind} enquiry from {c.name} for {m.name}")
    db.commit()
    return {"ok": True}


# ---------- customer portal ----------

@router.post("/portal/otp")
def portal_otp(body: OtpRequest, db: Session = Depends(get_db)):
    c = db.scalar(select(Customer).where(Customer.phone == body.phone))
    if not c or not db.scalar(select(Order).where(Order.customer_id == c.id)):
        raise HTTPException(404, "No bike is registered to this number")
    code = "1234" if settings.demo_mode else f"{secrets.randbelow(10000):04d}"
    db.add(OtpCode(phone=body.phone, code=code, expires_at=datetime.now(timezone.utc) + timedelta(minutes=10)))
    send_sms(db, body.phone, f"Porshi Motors login code: {code}", "otp", c)
    db.commit()
    return {"sent": True, **({"demo_code": code} if settings.demo_mode else {})}


@router.post("/portal/verify")
def portal_verify(body: OtpVerify, db: Session = Depends(get_db)):
    otp = db.scalar(select(OtpCode).where(OtpCode.phone == body.phone, OtpCode.used.is_(False))
                    .order_by(OtpCode.id.desc()))
    exp = otp.expires_at if otp else None
    if exp is not None and exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if not otp or otp.code != body.code or exp < datetime.now(timezone.utc):
        raise HTTPException(400, "That code is not right or has expired")
    otp.used = True
    c = db.scalar(select(Customer).where(Customer.phone == body.phone))
    audit(db, c.name, "Customer signed in to portal")
    db.commit()
    return {"token": make_token(str(c.id), "customer"), "name": c.name}


@router.get("/portal/me")
def portal_me(c: Customer = Depends(current_customer), db: Session = Depends(get_db)):
    cfg = get_settings(db)
    orders = db.scalars(select(Order).where(Order.customer_id == c.id)).all()
    bikes = []
    for o in orders:
        if o.status != "delivered" or not o.vehicle:
            continue
        b = db.scalar(select(Battery).where(Battery.vehicle_id == o.vehicle_id, Battery.status == "fitted"))
        nxt = o.delivered_on
        while nxt <= date.today():
            nxt = add_months(nxt, int(cfg["service_interval_months"]) or 3)
        bikes.append({"order": order_out(o), "model": o.model.name, "colour": o.vehicle.colour,
                      "image_url": o.model.image_url, "registration": o.vehicle.registration,
                      "battery": battery_out(b) if b else None, "next_service": nxt.isoformat(),
                      "vehicle_warranty_ends": add_months(o.delivered_on, int(cfg["vehicle_warranty_months"])).isoformat()})
    jobs = db.scalars(select(ServiceJob).where(ServiceJob.customer_id == c.id).order_by(ServiceJob.number.desc())).all()
    pays = [p for o in orders for p in o.payments]
    loose = [battery_out(o.battery) for o in orders if o.kind == "battery" and o.battery and not o.battery.vehicle_id]
    return {"customer": {"name": c.name, "phone": c.phone}, "bikes": bikes, "batteries": loose,
            "jobs": [job_out(j) for j in jobs], "payments": [payment_out(p) for p in sorted(pays, key=lambda p: p.number)],
            "balance": sum(max(0, o.balance) for o in orders)}
