"""Sales and CRM: staff login, customers, leads, quotations, orders, payments."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Battery, Customer, Lead, Order, Payment, Quotation, ServiceJob, User, Vehicle, VehicleModel
from ..schemas import CustomerIn, LeadIn, LeadStage, Login, PaymentIn, QuotationIn, norm_phone
from ..security import ROLES, areas_for, current_user, make_token, require, verify_password
from ..serializers import (battery_out, customer_out, job_out, lead_out, order_out, payment_out, quotation_out,
                           user_out)
from ..services import LEAD_STAGES, audit, get_or_404, get_settings, next_number, taka

router = APIRouter(prefix="/api", tags=["sales"])


# ---------- staff auth ----------

@router.post("/auth/login")
def login(body: Login, db: Session = Depends(get_db)):
    try:
        phone = norm_phone(body.phone)
    except ValueError:
        raise HTTPException(400, "Wrong phone number or password")
    u = db.scalar(select(User).where(User.phone == phone))
    if not u or not u.active or not verify_password(body.password, u.password_hash):
        raise HTTPException(400, "Wrong phone number or password")
    audit(db, u.name, "Signed in")
    db.commit()
    return {"token": make_token(str(u.id), "staff"), "user": {**user_out(u), "areas": areas_for(u.role)}}


@router.get("/auth/me")
def me(u: User = Depends(current_user)):
    return {**user_out(u), "areas": areas_for(u.role), "roles": ROLES}


# ---------- customers ----------

@router.get("/customers")
def customers(q: str = "", db: Session = Depends(get_db), _=Depends(require("customers", "sales", "leads"))):
    stmt = select(Customer).order_by(Customer.name)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Customer.name.ilike(like), Customer.phone.like(like), Customer.address.ilike(like)))
    out = []
    for c in db.scalars(stmt).all():
        bal = sum(max(0, o.balance) for o in db.scalars(select(Order).where(Order.customer_id == c.id)).all())
        out.append({**customer_out(c), "balance": bal})
    return out


@router.post("/customers")
def add_customer(body: CustomerIn, db: Session = Depends(get_db), u=Depends(require("customers", "sales"))):
    if db.scalar(select(Customer).where(Customer.phone == body.phone)):
        raise HTTPException(409, "A customer with this phone number already exists")
    c = Customer(name=body.name.strip(), phone=body.phone, address=body.address, source=body.source)
    db.add(c)
    audit(db, u.name, f"Added customer {c.name}")
    db.commit()
    return customer_out(c)


@router.get("/customers/{cid}")
def customer_profile(cid: int, db: Session = Depends(get_db), _=Depends(require("customers"))):
    c = get_or_404(db, Customer, cid, "Customer not found")
    orders = db.scalars(select(Order).where(Order.customer_id == cid).order_by(Order.number)).all()
    bikes = []
    for o in orders:
        if o.status == "delivered" and o.vehicle_id:
            b = db.scalar(select(Battery).where(Battery.vehicle_id == o.vehicle_id, Battery.status == "fitted"))
            bikes.append({"model": o.model.name, "chassis_no": o.vehicle.chassis_no, "colour": o.vehicle.colour,
                          "vehicle_id": o.vehicle_id, "battery": battery_out(b) if b else None})
    lead = db.scalar(select(Lead).where(Lead.customer_id == cid).order_by(Lead.id.desc()))
    pays = [p for o in orders for p in o.payments]
    loose = [battery_out(o.battery) for o in orders if o.kind == "battery" and o.battery]
    jobs = db.scalars(select(ServiceJob).where(ServiceJob.customer_id == cid).order_by(ServiceJob.number)).all()
    return {"customer": customer_out(c), "bikes": bikes, "batteries": loose, "orders": [order_out(o) for o in orders],
            "payments": [payment_out(p) for p in pays], "jobs": [job_out(j) for j in jobs],
            "lead": lead_out(lead) if lead else None, "balance": sum(max(0, o.balance) for o in orders),
            "total_paid": sum(p.amount for p in pays)}


# ---------- leads ----------

@router.get("/leads")
def leads(db: Session = Depends(get_db), _=Depends(require("leads"))):
    return [lead_out(l) for l in db.scalars(select(Lead).order_by(Lead.id.desc())).all()]


@router.post("/leads")
def add_lead(body: LeadIn, db: Session = Depends(get_db), u=Depends(require("leads"))):
    c = get_or_404(db, Customer, body.customer_id, "Customer not found")
    l = Lead(customer_id=c.id, model_id=body.model_id, source=body.source, note=body.note)
    db.add(l)
    audit(db, u.name, f"Created lead {c.name} ({body.source})")
    db.commit()
    return lead_out(l)


@router.patch("/leads/{lid}")
def move_lead(lid: int, body: LeadStage, db: Session = Depends(get_db), u=Depends(require("leads"))):
    l = get_or_404(db, Lead, lid, "Lead not found")
    l.stage, l.follow_up = body.stage, False
    audit(db, u.name, f"Lead {l.customer.name} → {LEAD_STAGES[l.stage]}")
    db.commit()
    return lead_out(l)


# ---------- quotations → orders ----------

@router.get("/quotations")
def quotations(db: Session = Depends(get_db), _=Depends(require("sales"))):
    return [quotation_out(q) for q in db.scalars(select(Quotation).order_by(Quotation.number.desc())).all()]


@router.post("/quotations")
def add_quotation(body: QuotationIn, db: Session = Depends(get_db), u=Depends(require("sales"))):
    m = get_or_404(db, VehicleModel, body.model_id, "Model not found")
    c = get_or_404(db, Customer, body.customer_id, "Customer not found")
    if body.discount > m.price or body.advance > m.price - body.discount:
        raise HTTPException(400, "Discount or advance is more than the price")
    q = Quotation(number=next_number(db, "quotation", 1082), customer_id=c.id, model_id=m.id, price=m.price,
                  discount=body.discount, advance=body.advance)
    db.add(q)
    lead = db.scalar(select(Lead).where(Lead.customer_id == c.id).order_by(Lead.id.desc()))
    if lead and lead.stage < 4:
        lead.stage = 4
    audit(db, u.name, f"Quotation #{q.number} for {c.name} · {m.name} · ৳{taka(m.price - body.discount)}")
    db.commit()
    return quotation_out(q)


@router.post("/quotations/{qid}/convert")
def convert_quotation(qid: int, db: Session = Depends(get_db), u=Depends(require("sales"))):
    q = get_or_404(db, Quotation, qid, "Quotation not found")
    if q.status != "open":
        raise HTTPException(400, "Quotation already converted")
    v = db.scalar(select(Vehicle).where(Vehicle.model_id == q.model_id, Vehicle.status == "stock")
                  .order_by(Vehicle.location, Vehicle.id).with_for_update())
    o = Order(number=next_number(db, "order", 1082), customer_id=q.customer_id, model_id=q.model_id,
              vehicle_id=v.id if v else None, quotation_id=q.id, price=q.price, discount=q.discount)
    if v:
        v.status = "booked"
    db.add(o)
    db.flush()
    if q.advance:
        db.add(Payment(number=next_number(db, "payment", 5009), order_id=o.id, amount=q.advance, method="Cash",
                       received_by=u.name))
    q.status = "converted"
    lead = db.scalar(select(Lead).where(Lead.customer_id == q.customer_id).order_by(Lead.id.desc()))
    if lead:
        lead.stage, lead.follow_up = 5, False
    audit(db, u.name, f"Created order #{o.number} from quotation #{q.number}")
    db.commit()
    db.refresh(o)
    return order_out(o)


@router.get("/orders")
def orders(db: Session = Depends(get_db), _=Depends(require("orders"))):
    return [order_out(o) for o in db.scalars(select(Order).order_by(Order.number.desc())).all()]


@router.post("/orders/{oid}/deliver")
def deliver(oid: int, db: Session = Depends(get_db), u=Depends(require("orders"))):
    o = get_or_404(db, Order, oid, "Order not found")
    if o.status != "booked":
        raise HTTPException(400, "Order already delivered")
    if o.kind != "bike":
        raise HTTPException(400, "Only bike orders are delivered here")
    if not o.vehicle_id:
        # try to allocate a bike that has arrived since booking
        v = db.scalar(select(Vehicle).where(Vehicle.model_id == o.model_id, Vehicle.status == "stock"))
        if not v:
            raise HTTPException(400, "No bike of this model in stock")
        o.vehicle_id = v.id
        db.flush()
    cfg = get_settings(db)
    o.status, o.delivered_on = "delivered", date.today()
    o.vehicle.status = "sold"
    for b in db.scalars(select(Battery).where(Battery.vehicle_id == o.vehicle_id, Battery.status == "stock")).all():
        b.status, b.installed_on, b.warranty_months = "fitted", date.today(), int(cfg["battery_warranty_months"])
    lead = db.scalar(select(Lead).where(Lead.customer_id == o.customer_id).order_by(Lead.id.desc()))
    if lead:
        lead.stage, lead.follow_up = 6, False
    audit(db, u.name, f"Delivered order #{o.number} · {o.vehicle.chassis_no}; warranty started")
    db.commit()
    return order_out(o)


@router.get("/payments")
def payments(db: Session = Depends(get_db), _=Depends(require("payments"))):
    return [payment_out(p) for p in db.scalars(select(Payment).order_by(Payment.number.desc())).all()]


@router.post("/payments")
def add_payment(body: PaymentIn, db: Session = Depends(get_db), u=Depends(require("payments"))):
    o = get_or_404(db, Order, body.order_id, "Order not found")
    if body.amount > o.balance:
        raise HTTPException(400, f"Amount is more than the balance of ৳{taka(o.balance)}")
    p = Payment(number=next_number(db, "payment", 5009), order_id=o.id, amount=body.amount, method=body.method,
                received_by=u.name)
    db.add(p)
    audit(db, u.name, f"Recorded payment #{p.number} · ৳{taka(body.amount)} {body.method} · order #{o.number}")
    db.commit()
    db.refresh(o)
    return payment_out(p)
