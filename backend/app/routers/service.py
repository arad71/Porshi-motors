"""Service: job cards, mechanics, parts issued, warranty register and claims."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import (Battery, Customer, InventoryTxn, Order, ServiceItem, ServiceJob, SparePart, User, Vehicle,
                      WarrantyClaim)
from ..schemas import ClaimIn, ClaimPatch, JobIn, JobItemIn, JobPatch, UserPatch
from ..security import require
from ..serializers import claim_out, customer_out, job_out, user_out
from ..services import JOB_STAGES, MESSAGES, add_months, audit, get_or_404, get_settings, months_left, next_number, send_sms, taka

router = APIRouter(prefix="/api", tags=["service"])


@router.get("/jobs")
def jobs(db: Session = Depends(get_db), u=Depends(require("service"))):
    stmt = select(ServiceJob).order_by(ServiceJob.number.desc())
    if u.role == "tech":  # technicians see their own jobs and unassigned ones
        stmt = stmt.where((ServiceJob.technician_id == u.id) | (ServiceJob.technician_id.is_(None)))
    return [job_out(j) for j in db.scalars(stmt).all()]


@router.post("/jobs")
def add_job(body: JobIn, db: Session = Depends(get_db), u=Depends(require("service", "customers"))):
    c = get_or_404(db, Customer, body.customer_id, "Customer not found")
    desc = body.vehicle_desc
    if body.vehicle_id:
        v = get_or_404(db, Vehicle, body.vehicle_id, "Vehicle not found")
        desc = desc or f"{v.model.name} · {v.chassis_no}"
    j = ServiceJob(number=next_number(db, "job", 245), customer_id=c.id, vehicle_id=body.vehicle_id,
                   vehicle_desc=desc, complaint=body.complaint or "General service",
                   technician_id=body.technician_id, labour=body.labour)
    db.add(j)
    audit(db, u.name, f"Created job card #{j.number} for {c.name}")
    db.commit()
    return job_out(j)


@router.patch("/jobs/{jid}")
def update_job(jid: int, body: JobPatch, db: Session = Depends(get_db), u=Depends(require("service"))):
    j = get_or_404(db, ServiceJob, jid, "Job not found")
    if body.technician_id is not None:
        t = get_or_404(db, User, body.technician_id, "Technician not found")
        j.technician_id = t.id
        audit(db, u.name, f"Assigned job #{j.number} to {t.name}")
    if body.labour is not None:
        j.labour = body.labour
    if body.checklist is not None:
        j.checklist = {**(j.checklist or {}), **body.checklist}
    sms = None
    if body.stage is not None and body.stage != j.stage:
        j.stage = body.stage
        audit(db, u.name, f"Job #{j.number} moved to {JOB_STAGES[j.stage]}")
        if j.stage == 4:  # Ready: tell the customer
            en, bn = MESSAGES["ready"]
            msg = bn.format(n=j.number, t=taka(j.total))
            send_sms(db, j.customer.phone, msg, "job", j.customer)
            sms = {"phone": j.customer.phone, "message": msg}
    db.commit()
    db.refresh(j)
    return {**job_out(j), "sms": sms}


@router.post("/jobs/{jid}/items")
def issue_part(jid: int, body: JobItemIn, db: Session = Depends(get_db), u=Depends(require("service"))):
    j = get_or_404(db, ServiceJob, jid, "Job not found")
    p = db.scalar(select(SparePart).where(SparePart.id == body.part_id).with_for_update())
    if not p:
        raise HTTPException(404, "Part not found")
    if p.stock < body.qty:
        raise HTTPException(400, f"Only {p.stock} {p.name} in stock")
    p.stock -= body.qty
    db.add(ServiceItem(job_id=j.id, part_id=p.id, qty=body.qty, unit_price=p.price))
    db.add(InventoryTxn(part_id=p.id, type="svc", qty=body.qty, reference=f"Job #{j.number}", user_name=u.name))
    audit(db, u.name, f"Issued {body.qty} × {p.name} to job #{j.number}")
    db.commit()
    db.refresh(j)
    return job_out(j)


@router.get("/mechanics")
def mechanics(db: Session = Depends(get_db), _=Depends(require("mechanics"))):
    out = []
    for t in db.scalars(select(User).where(User.role == "tech").order_by(User.name)).all():
        js = db.scalars(select(ServiceJob).where(ServiceJob.technician_id == t.id)).all()
        done = [j for j in js if j.stage >= 4]
        out.append({**user_out(t), "open_jobs": [{"id": j.id, "number": j.number, "customer": j.customer.name}
                                                 for j in js if j.stage < 4],
                    "completed": len(done), "labour_earned": sum(j.labour for j in done)})
    return out


@router.patch("/mechanics/{uid}")
def mechanic_availability(uid: int, body: UserPatch, db: Session = Depends(get_db), u=Depends(require("mechanics"))):
    t = get_or_404(db, User, uid, "Mechanic not found")
    if t.role != "tech":
        raise HTTPException(400, "Not a technician")
    if body.available is not None:
        t.available = body.available
        audit(db, u.name, f"{t.name} marked {'available' if t.available else 'on leave'}")
    db.commit()
    return user_out(t)


@router.get("/parts-issued")
def parts_issued(db: Session = Depends(get_db), _=Depends(require("issued"))):
    items = db.scalars(select(ServiceItem).order_by(ServiceItem.id.desc())).all()
    return [{"job_id": i.job_id, "job_number": i.job.number, "customer": i.job.customer.name, "part": i.part.name,
             "part_bn": i.part.name_bn, "qty": i.qty, "value": i.qty * i.unit_price,
             "technician": i.job.technician.name if i.job.technician else None} for i in items]


@router.get("/warranty")
def warranty(db: Session = Depends(get_db), _=Depends(require("warranty"))):
    cfg = get_settings(db)
    out = []
    for o in db.scalars(select(Order).where(Order.status == "delivered", Order.vehicle_id.isnot(None))
                        .order_by(Order.delivered_on.desc())).all():
        b = db.scalar(select(Battery).where(Battery.vehicle_id == o.vehicle_id, Battery.status == "fitted"))
        vw = int(cfg["vehicle_warranty_months"])
        out.append({"order_number": o.number, "customer": customer_out(o.customer), "model": o.model.name,
                    "vehicle_id": o.vehicle_id, "chassis_no": o.vehicle.chassis_no, "start": o.delivered_on.isoformat(),
                    "vehicle_ends": add_months(o.delivered_on, vw).isoformat(),
                    "vehicle_left": months_left(o.delivered_on, vw),
                    "battery_left": months_left(b.installed_on, b.warranty_months) if b else None,
                    "claims": db.query(WarrantyClaim).filter(WarrantyClaim.vehicle_id == o.vehicle_id).count()})
    return out


@router.get("/claims")
def claims(db: Session = Depends(get_db), _=Depends(require("warranty"))):
    return [claim_out(c) for c in db.scalars(select(WarrantyClaim).order_by(WarrantyClaim.number.desc())).all()]


@router.post("/claims")
def add_claim(body: ClaimIn, db: Session = Depends(get_db), u=Depends(require("warranty"))):
    v = get_or_404(db, Vehicle, body.vehicle_id, "Vehicle not found")
    c = WarrantyClaim(number=next_number(db, "claim", 302), vehicle_id=v.id, component=body.component,
                      description=body.description)
    db.add(c)
    audit(db, u.name, f"Logged warranty claim #{c.number} on {v.chassis_no} ({body.component})")
    db.commit()
    return claim_out(c)


@router.patch("/claims/{cid}")
def update_claim(cid: int, body: ClaimPatch, db: Session = Depends(get_db), u=Depends(require("warranty"))):
    c = get_or_404(db, WarrantyClaim, cid, "Claim not found")
    c.status = body.status
    audit(db, u.name, f"Warranty claim #{c.number} → {c.status}")
    db.commit()
    return claim_out(c)
