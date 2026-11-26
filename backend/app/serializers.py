from datetime import date

from .models import (Battery, Customer, Lead, Order, Payment, Quotation, ServiceJob, SparePart, User, Vehicle,
                     VehicleModel, WarrantyClaim)
from .services import JOB_STAGES, LEAD_STAGES, battery_health_label, months_left


def d(v: date | None):
    return v.isoformat() if v else None


def model_out(m: VehicleModel, in_stock: int | None = None) -> dict:
    out = {"id": m.id, "code": m.code, "name": m.name, "price": m.price, "range_km": m.range_km,
           "top_speed": m.top_speed, "battery_spec": m.battery_spec, "motor_spec": m.motor_spec,
           "charge_hours": m.charge_hours, "colours": m.colours or [], "image_url": m.image_url, "visible": m.visible}
    if in_stock is not None:
        out["in_stock"] = in_stock
    return out


def customer_out(c: Customer) -> dict:
    return {"id": c.id, "name": c.name, "phone": c.phone, "address": c.address, "source": c.source,
            "created_on": d(c.created_on)}


def lead_out(l: Lead) -> dict:
    return {"id": l.id, "customer": customer_out(l.customer), "model": l.model.name if l.model else None,
            "model_id": l.model_id, "stage": l.stage, "stage_name": LEAD_STAGES[l.stage], "source": l.source,
            "note": l.note, "follow_up": l.follow_up, "created_on": d(l.created_on)}


def quotation_out(q: Quotation) -> dict:
    final = q.price - q.discount
    return {"id": q.id, "number": q.number, "customer": customer_out(q.customer), "model": q.model.name,
            "model_id": q.model_id, "price": q.price, "discount": q.discount, "final_price": final,
            "advance": q.advance, "balance": final - q.advance, "status": q.status, "created_on": d(q.created_on)}


def payment_out(p: Payment) -> dict:
    return {"id": p.id, "number": p.number, "order_id": p.order_id, "order_number": p.order.number,
            "customer": p.order.customer.name, "amount": p.amount, "method": p.method, "paid_on": d(p.paid_on),
            "received_by": p.received_by, "balance_after": p.order.balance}


def order_out(o: Order) -> dict:
    return {"id": o.id, "number": o.number, "customer": customer_out(o.customer), "model": o.item_name,
            "kind": o.kind, "battery_serial": o.battery.serial if o.battery else None,
            "model_id": o.model_id, "chassis_no": o.vehicle.chassis_no if o.vehicle else None,
            "vehicle_id": o.vehicle_id, "price": o.price, "discount": o.discount, "final_price": o.final_price,
            "paid": o.paid, "balance": o.balance, "status": o.status, "created_on": d(o.created_on),
            "delivered_on": d(o.delivered_on)}


def battery_out(b: Battery, owner: str | None = None) -> dict:
    return {"id": b.id, "serial": b.serial, "type": b.type, "vehicle_id": b.vehicle_id,
            "chassis_no": b.vehicle.chassis_no if b.vehicle else None, "owner": owner,
            "installed_on": d(b.installed_on), "warranty_months": b.warranty_months,
            "warranty_left": months_left(b.installed_on, b.warranty_months), "health": b.health,
            "health_label": battery_health_label(b.health), "cycles": b.cycles, "status": b.status,
            "cost": b.cost, "price": b.price}


def vehicle_out(v: Vehicle, battery: Battery | None = None) -> dict:
    return {"id": v.id, "model": v.model.name, "model_id": v.model_id, "chassis_no": v.chassis_no,
            "motor_no": v.motor_no, "controller_no": v.controller_no, "charger_no": v.charger_no,
            "battery_serial": battery.serial if battery else None, "colour": v.colour, "cost": v.cost,
            "price": v.model.price, "margin": v.model.price - v.cost, "location": v.location, "status": v.status,
            "registration": v.registration}


def job_out(j: ServiceJob) -> dict:
    return {"id": j.id, "number": j.number, "customer": customer_out(j.customer), "vehicle_id": j.vehicle_id,
            "vehicle_desc": j.vehicle_desc, "complaint": j.complaint, "technician_id": j.technician_id,
            "technician": j.technician.name if j.technician else None, "stage": j.stage,
            "stage_name": JOB_STAGES[j.stage], "labour": j.labour, "checklist": j.checklist or {},
            "items": [{"id": i.id, "part_id": i.part_id, "part": i.part.name, "part_bn": i.part.name_bn,
                       "qty": i.qty, "unit_price": i.unit_price} for i in j.items],
            "parts_total": j.parts_total, "total": j.total, "created_on": d(j.created_on)}


def part_out(p: SparePart) -> dict:
    return {"id": p.id, "name": p.name, "name_bn": p.name_bn, "stock": p.stock, "min_stock": p.min_stock,
            "price": p.price, "visible": p.visible, "low": p.stock < p.min_stock}


def user_out(u: User) -> dict:
    return {"id": u.id, "name": u.name, "phone": u.phone, "role": u.role, "active": u.active,
            "speciality": u.speciality, "available": u.available}


def claim_out(c: WarrantyClaim) -> dict:
    return {"id": c.id, "number": c.number, "vehicle_id": c.vehicle_id, "chassis_no": c.vehicle.chassis_no,
            "component": c.component, "description": c.description, "status": c.status, "created_on": d(c.created_on)}
