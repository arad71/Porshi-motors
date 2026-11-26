"""Shared business rules: numbering, audit trail, warranty maths, reminders and SMS."""
import logging
from datetime import date, timedelta

import httpx
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .models import AuditLog, Battery, Counter, Customer, Notification, Order, Setting

log = logging.getLogger("porshi")

DEFAULT_SETTINGS = {
    "phone": "01700000000",
    "whatsapp": "8801700000000",
    "facebook": "porshimotors",
    "address_en": "Chourhas Mor, Kushtia",
    "address_bn": "চৌড়হাস মোড়, কুষ্টিয়া",
    "hours_en": "Open Sat–Thu, 9am–8pm",
    "hours_bn": "শনি–বৃহস্পতি, সকাল ৯টা–রাত ৮টা",
    "brands": "Porshi City, Rider, Cargo Pro",
    "sms_sender": "PORSHI",
    "service_interval_months": 3,
    "battery_warranty_months": 24,
    "vehicle_warranty_months": 12,
    "finance_rate": 12,
    "offers": [],
}

LEAD_STAGES = ["New", "Contacted", "Interested", "Test ride", "Quotation", "Booked", "Sold"]
JOB_STAGES = ["Received", "Inspection", "Repair", "Quality check", "Ready", "Delivered"]
TXN_SIGN = {"open": 1, "buy": 1, "sale": -1, "svc": -1, "ret": 1, "dmg": -1}


def get_settings(db: Session) -> dict:
    row = db.get(Setting, "business")
    return {**DEFAULT_SETTINGS, **(row.value if row else {})}


def next_number(db: Session, name: str, start: int) -> int:
    c = db.scalar(select(Counter).where(Counter.name == name).with_for_update())
    if not c:
        c = Counter(name=name, value=start)
        db.add(c)
    else:
        c.value += 1
    db.flush()
    return c.value


def get_or_404(db: Session, model, ident, message: str = "Not found"):
    obj = db.get(model, ident)
    if obj is None:
        raise HTTPException(404, message)
    return obj


def audit(db: Session, user_name: str, action: str) -> None:
    db.add(AuditLog(user_name=user_name, action=action))


def add_months(d: date, months: int) -> date:
    y, m = divmod(d.month - 1 + months, 12)
    day = min(d.day, [31, 29 if (d.year + y) % 4 == 0 else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m])
    return date(d.year + y, m + 1, day)


def months_left(start: date | None, months: int, today: date | None = None) -> int | None:
    if not start:
        return None
    today = today or date.today()
    end = add_months(start, months)
    if end <= today:
        return 0
    m = (end.year - today.year) * 12 + end.month - today.month
    if add_months(today, m) > end:
        m -= 1
    if add_months(today, m) < end:
        m += 1  # count a part month as a month
    return m


def battery_health_label(h: int) -> str:
    return "good" if h >= 85 else "watch" if h >= 70 else "weak"


MESSAGES = {
    "svc": ("Your bike's next service is due. Reply 1 to book, or call Porshi Motors.",
            "আপনার বাইকের পরবর্তী সার্ভিসের সময় হয়েছে। বুক করতে ১ লিখে পাঠান বা Porshi Motors-এ কল করুন।"),
    "war": ("Your battery warranty has {m} months left. Get a free health check before it ends.",
            "আপনার ব্যাটারির ওয়ারেন্টি আর {m} মাস আছে। শেষ হওয়ার আগে ফ্রি চেক করিয়ে নিন।"),
    "pay": ("Your balance due is ৳{a}. Please pay by the 10th.",
            "আপনার বকেয়া ৳{a}। অনুগ্রহ করে ১০ তারিখের মধ্যে পরিশোধ করুন।"),
    "new": ("New: {m} is now available at Porshi Motors. Visit for a test ride.",
            "নতুন {m} এখন Porshi Motors-এ পাওয়া যাচ্ছে। টেস্ট রাইডে আসুন।"),
    "ready": ("Your bike service (job #{n}) is complete. Total ৳{t}. Please collect it from Porshi Motors.",
              "আপনার বাইকের সার্ভিস (জব #{n}) সম্পন্ন। মোট ৳{t}। Porshi Motors থেকে সংগ্রহ করুন।"),
}


def taka(n: int) -> str:
    s = str(abs(int(n)))
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        parts = []
        while len(head) > 2:
            parts.insert(0, head[-2:])
            head = head[:-2]
        if head:
            parts.insert(0, head)
        s = ",".join(parts) + "," + tail
    return s


def due_reminders(db: Session, today: date | None = None) -> list[dict]:
    """Reminders worked out from the data: service due, battery warranty ending, balances due."""
    today = today or date.today()
    cfg = get_settings(db)
    out: list[dict] = []
    interval = int(cfg["service_interval_months"]) or 3
    delivered = db.scalars(select(Order).where(Order.status == "delivered", Order.vehicle_id.isnot(None))).all()
    for o in delivered:
        # service due when today is within 7 days of a service date counted from delivery
        k = 1
        while add_months(o.delivered_on, interval * k) < today - timedelta(days=7):
            k += 1
        due = add_months(o.delivered_on, interval * k)
        if (due - today).days <= 7:
            out.append({"kind": "svc", "customer": o.customer, "key": f"svc:{o.id}:{due.isoformat()}", "vars": {}})
    for b in db.scalars(select(Battery).where(Battery.status.in_(["fitted", "sold"]))).all():
        left = months_left(b.installed_on, b.warranty_months, today)
        if left is not None and 0 < left <= 3:
            o = db.scalar(select(Order).where(Order.battery_id == b.id))
            if not o and b.vehicle_id:
                o = db.scalar(select(Order).where(Order.vehicle_id == b.vehicle_id))
            if o:
                out.append({"kind": "war", "customer": o.customer, "key": f"war:{b.id}:{left}", "vars": {"m": left}})
    for o in db.scalars(select(Order)).all():
        if o.balance > 0:
            out.append({"kind": "pay", "customer": o.customer, "key": f"pay:{o.id}:{today:%Y-%m}",
                        "vars": {"a": taka(o.balance)}})
    sent = set(db.scalars(select(Notification.reminder_key).where(Notification.reminder_key != "")).all())
    for r in out:
        en, bn = MESSAGES[r["kind"]]
        r["message_en"] = en.format(**r["vars"])
        r["message_bn"] = bn.format(**r["vars"])
        r["queued"] = r["key"] in sent
    return out


def send_sms(db: Session, phone: str, message: str, kind: str, customer: Customer | None = None, key: str = "") -> Notification:
    """Queue and send an SMS. 'console' just logs it; 'http' posts to a Bangladeshi SMS gateway."""
    n = Notification(phone=phone, message=message, kind=kind, customer_id=customer.id if customer else None,
                     reminder_key=key)
    db.add(n)
    if settings.sms_provider == "http" and settings.sms_api_url:
        try:
            r = httpx.post(settings.sms_api_url, timeout=10, data={
                "api_key": settings.sms_api_key, "senderid": settings.sms_sender, "number": phone, "message": message})
            n.status = "sent" if r.status_code < 300 else "failed"
        except httpx.HTTPError:
            n.status = "failed"
    else:
        log.info("SMS to %s: %s", phone, message)
        n.status = "queued"
    return n
