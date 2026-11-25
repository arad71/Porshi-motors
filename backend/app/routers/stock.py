"""Stock and website catalogue: models, vehicles, batteries, spare parts and the stock ledger."""
import os
import uuid
from datetime import date

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import (Battery, InventoryTxn, Lead, Order, ServiceJob, SparePart, Vehicle, VehicleModel,
                      WarrantyClaim)
from ..schemas import BatteryCheck, ModelIn, PartIn, TxnIn, VehicleIn
from ..security import require
from ..serializers import battery_out, claim_out, customer_out, job_out, model_out, part_out, vehicle_out
from ..services import TXN_SIGN, add_months, audit, get_or_404, get_settings, months_left

router = APIRouter(prefix="/api", tags=["stock"])


# ---------- website catalogue: models ----------

@router.get("/models")
def models(db: Session = Depends(get_db), _=Depends(require("catalog", "stock", "sales", "leads"))):
    counts = dict(db.execute(select(Vehicle.model_id, func.count()).where(Vehicle.status == "stock")
                             .group_by(Vehicle.model_id)).all())
    return [model_out(m, counts.get(m.id, 0)) for m in db.scalars(select(VehicleModel).order_by(VehicleModel.price))]


@router.post("/models")
def add_model(body: ModelIn, db: Session = Depends(get_db), u=Depends(require("catalog"))):
    if db.scalar(select(VehicleModel).where(VehicleModel.code == body.code)):
        raise HTTPException(409, "A model with this code already exists")
    m = VehicleModel(**body.model_dump())
    db.add(m)
    audit(db, u.name, f"Added website model {m.name}")
    db.commit()
    return model_out(m)


@router.put("/models/{mid}")
def edit_model(mid: int, body: ModelIn, db: Session = Depends(get_db), u=Depends(require("catalog"))):
    m = get_or_404(db, VehicleModel, mid, "Model not found")
    for k, v in body.model_dump().items():
        setattr(m, k, v)
    audit(db, u.name, f"Updated website model {m.name}")
    db.commit()
    return model_out(m)


@router.delete("/models/{mid}")
def delete_model(mid: int, db: Session = Depends(get_db), u=Depends(require("catalog"))):
    m = get_or_404(db, VehicleModel, mid, "Model not found")
    used = any(db.scalar(select(func.count()).select_from(t).where(t.model_id == mid)) for t in (Vehicle, Order, Lead))
    if used:
        raise HTTPException(400, "This model has stock, leads or orders. Hide it instead of deleting.")
    db.delete(m)
    audit(db, u.name, f"Deleted website model {m.name}")
    db.commit()
    return {"ok": True}


@router.post("/uploads/image")
def upload_image(file: UploadFile = File(...), _=Depends(require("catalog"))):
    ext = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}.get(file.content_type)
    if not ext:
        raise HTTPException(400, "Upload a JPEG, PNG or WebP image")
    data = file.file.read(5 * 1024 * 1024 + 1)
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(400, "Image must be under 5 MB")
    os.makedirs(settings.upload_dir, exist_ok=True)
    name = uuid.uuid4().hex + ext
    with open(os.path.join(settings.upload_dir, name), "wb") as f:
        f.write(data)
    return {"url": f"/uploads/{name}"}


# ---------- vehicles ----------

@router.get("/vehicles")
def vehicles(db: Session = Depends(get_db), _=Depends(require("stock"))):
    out = []
    for v in db.scalars(select(Vehicle).order_by(Vehicle.id)).all():
        b = db.scalar(select(Battery).where(Battery.vehicle_id == v.id, Battery.status != "replaced"))
        out.append(vehicle_out(v, b))
    return out


@router.post("/vehicles")
def add_vehicle(body: VehicleIn, db: Session = Depends(get_db), u=Depends(require("stock"))):
    m = get_or_404(db, VehicleModel, body.model_id, "Model not found")
    if db.scalar(select(Vehicle).where(Vehicle.chassis_no == body.chassis_no)):
        raise HTTPException(409, "Chassis number already registered")
    if db.scalar(select(Battery).where(Battery.serial == body.battery_serial)):
        raise HTTPException(409, "Battery serial already registered")
    data = body.model_dump(exclude={"battery_serial"})
    v = Vehicle(**data)
    db.add(v)
    db.flush()
    db.add(Battery(serial=body.battery_serial, type=m.battery_spec, vehicle_id=v.id, purchased_on=date.today(),
                   warranty_months=int(get_settings(db)["battery_warranty_months"]), status="stock"))
    audit(db, u.name, f"Received {m.name} {v.chassis_no} into stock")
    db.commit()
    return vehicle_out(v)


@router.get("/vehicles/{vid}")
def vehicle_detail(vid: int, db: Session = Depends(get_db), _=Depends(require("stock", "warranty"))):
    v = get_or_404(db, Vehicle, vid, "Vehicle not found")
    cfg = get_settings(db)
    b = db.scalar(select(Battery).where(Battery.vehicle_id == v.id, Battery.status != "replaced"))
    o = db.scalar(select(Order).where(Order.vehicle_id == v.id))
    jobs = db.scalars(select(ServiceJob).where(ServiceJob.vehicle_id == v.id)).all()
    claims = db.scalars(select(WarrantyClaim).where(WarrantyClaim.vehicle_id == v.id)).all()
    vw = int(cfg["vehicle_warranty_months"])
    return {**vehicle_out(v, b), "motor_spec": v.model.motor_spec, "battery": battery_out(b) if b else None,
            "customer": customer_out(o.customer) if o else None, "order_number": o.number if o else None,
            "warranty": {"start": o.delivered_on.isoformat(), "ends": add_months(o.delivered_on, vw).isoformat(),
                         "left": months_left(o.delivered_on, vw)} if o and o.delivered_on else None,
            "jobs": [job_out(j) for j in jobs], "claims": [claim_out(c) for c in claims]}


# ---------- batteries ----------

@router.get("/batteries")
def batteries(db: Session = Depends(get_db), _=Depends(require("batteries"))):
    out = []
    for b in db.scalars(select(Battery).order_by(Battery.status, Battery.serial)).all():
        owner = None
        if b.vehicle_id:
            o = db.scalar(select(Order).where(Order.vehicle_id == b.vehicle_id, Order.status == "delivered"))
            owner = o.customer.name if o else None
        out.append(battery_out(b, owner))
    return out


@router.patch("/batteries/{bid}")
def battery_check(bid: int, body: BatteryCheck, db: Session = Depends(get_db), u=Depends(require("batteries"))):
    b = get_or_404(db, Battery, bid, "Battery not found")
    b.health, b.cycles = body.health, body.cycles
    audit(db, u.name, f"Health check {b.serial}: {b.health}%, {b.cycles} cycles")
    db.commit()
    return battery_out(b)


@router.post("/batteries/{bid}/replace")
def battery_replace(bid: int, db: Session = Depends(get_db), u=Depends(require("batteries"))):
    b = get_or_404(db, Battery, bid, "Battery not found")
    if b.status not in ("fitted", "stock") or not b.vehicle_id:
        raise HTTPException(400, "Only a battery fitted to a bike can be replaced")
    spare = db.scalar(select(Battery).where(Battery.status == "spare", Battery.type == b.type).with_for_update())
    if not spare:
        raise HTTPException(400, "No spare battery of this type")
    spare.vehicle_id, spare.status = b.vehicle_id, b.status
    spare.installed_on = date.today() if b.status == "fitted" else None
    spare.warranty_months = int(get_settings(db)["battery_warranty_months"])
    b.status = "replaced"
    audit(db, u.name, f"Replaced battery {b.serial} with {spare.serial} on {b.vehicle.chassis_no}")
    db.commit()
    return battery_out(spare)


# ---------- spare parts and the stock ledger ----------

@router.get("/parts")
def parts(db: Session = Depends(get_db), _=Depends(require("parts", "catalog", "service"))):
    rows = db.execute(select(InventoryTxn.part_id, InventoryTxn.type, func.sum(InventoryTxn.qty))
                      .group_by(InventoryTxn.part_id, InventoryTxn.type)).all()
    summary: dict[int, dict] = {}
    for pid, ty, q in rows:
        summary.setdefault(pid, {})[ty] = int(q)
    return [{**part_out(p), "ledger": {k: summary.get(p.id, {}).get(k, 0) for k in TXN_SIGN}}
            for p in db.scalars(select(SparePart).order_by(SparePart.name))]


@router.post("/parts")
def add_part(body: PartIn, db: Session = Depends(get_db), u=Depends(require("parts", "catalog"))):
    if db.scalar(select(SparePart).where(SparePart.name == body.name)):
        raise HTTPException(409, "A part with this name already exists")
    p = SparePart(**body.model_dump())
    db.add(p)
    db.flush()
    if p.stock:
        db.add(InventoryTxn(part_id=p.id, type="open", qty=p.stock, reference="Opening stock", user_name=u.name))
    audit(db, u.name, f"Added part {p.name}")
    db.commit()
    return part_out(p)


@router.put("/parts/{pid}")
def edit_part(pid: int, body: PartIn, db: Session = Depends(get_db), u=Depends(require("parts", "catalog"))):
    p = get_or_404(db, SparePart, pid, "Part not found")
    data = body.model_dump(exclude={"stock"})  # stock only changes through the ledger
    for k, v in data.items():
        setattr(p, k, v)
    audit(db, u.name, f"Updated part {p.name}")
    db.commit()
    return part_out(p)


@router.delete("/parts/{pid}")
def delete_part(pid: int, db: Session = Depends(get_db), u=Depends(require("catalog"))):
    p = get_or_404(db, SparePart, pid, "Part not found")
    if db.scalar(select(func.count()).select_from(InventoryTxn).where(InventoryTxn.part_id == pid, InventoryTxn.type != "open")):
        raise HTTPException(400, "This part has stock history. Hide it from the website instead.")
    db.query(InventoryTxn).filter(InventoryTxn.part_id == pid).delete()
    db.delete(p)
    audit(db, u.name, f"Deleted part {p.name}")
    db.commit()
    return {"ok": True}


@router.get("/inventory")
def ledger(part_id: int | None = None, db: Session = Depends(get_db), _=Depends(require("parts"))):
    stmt = select(InventoryTxn).order_by(InventoryTxn.id.desc()).limit(200)
    if part_id:
        stmt = stmt.where(InventoryTxn.part_id == part_id)
    return [{"id": t.id, "part": t.part.name, "part_bn": t.part.name_bn, "type": t.type, "qty": t.qty,
             "signed": TXN_SIGN[t.type] * t.qty, "reference": t.reference, "user": t.user_name,
             "date": t.created_on.isoformat()} for t in db.scalars(stmt)]


@router.post("/inventory")
def record_txn(body: TxnIn, db: Session = Depends(get_db), u=Depends(require("parts"))):
    p = db.scalar(select(SparePart).where(SparePart.id == body.part_id).with_for_update())
    if not p:
        raise HTTPException(404, "Part not found")
    delta = TXN_SIGN[body.type] * body.qty
    if p.stock + delta < 0:
        raise HTTPException(400, f"Only {p.stock} in stock")
    p.stock += delta
    db.add(InventoryTxn(part_id=p.id, type=body.type, qty=body.qty, reference=body.reference or "—", user_name=u.name))
    audit(db, u.name, f"Stock {body.type} {body.qty} × {p.name} ({body.reference or '—'})")
    db.commit()
    return part_out(p)
