"""Synthetic Kushtia demo data. Run: python -m app.seed  (only seeds an empty database).

Dates are worked out from today so the demo always looks current: one battery warranty
is about to end, a payment came in today, two leads arrived today, and so on.
"""
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import Base, SessionLocal, engine
from .models import (AuditLog, Battery, Counter, Customer, InventoryTxn, Lead, Order, Payment, ServiceItem,
                     ServiceJob, Setting, SparePart, User, Vehicle, VehicleModel, WarrantyClaim)
from .security import hash_password
from .services import DEFAULT_SETTINGS, TXN_SIGN, add_months

DEMO_PASSWORD = "porshi123"


def seed(db: Session) -> bool:
    if db.scalar(select(User.id).limit(1)):
        return False
    T = date.today()
    ago = lambda days: T - timedelta(days=days)  # noqa: E731
    pw = hash_password(DEMO_PASSWORD)

    staff = [("Hasan", "01711003001", "admin", ""), ("Mahmud", "01711003002", "manager", ""),
             ("Rafiq", "01711003003", "sales", ""), ("Shakil", "01711003004", "svcm", ""),
             ("Karim", "01711002001", "tech", "Battery and controller"), ("Babu", "01711002002", "tech", "Brakes and tyres"),
             ("Sajib", "01711002003", "tech", "General service"), ("Rina", "01711003006", "acct", "")]
    users = {}
    for n, p, r, sp in staff:
        users[n] = User(name=n, phone=p, role=r, password_hash=pw, speciality=sp, available=(n != "Sajib"))
        db.add(users[n])

    db.add(Setting(key="business", value={**DEFAULT_SETTINGS, "offers": [
        {"en": "First two services free with every new bike", "bn": "প্রতিটি নতুন বাইকে প্রথম দুটি সার্ভিস ফ্রি", "tag": "Service"},
        {"en": "0% interest for 6 months on Mini Go", "bn": "Mini Go-তে ৬ মাস ০% সুদ", "tag": "EMI"},
        {"en": "Exchange your old petrol bike for up to ৳15,000 off", "bn": "পুরনো পেট্রোল বাইক বদলে ৳১৫,০০০ পর্যন্ত ছাড়", "tag": "Exchange"}]}))

    M = {}
    for code, name, price, rng, spd, batt, motor, chg, cols in [
        ("c60", "Porshi City 60", 118000, "60–70", 45, "60V 30Ah Li-ion", "1000W hub", "4–5", ["#e5361b", "#1a2b6d", "#d9d9d9"]),
        ("r90", "Rider 90", 145000, "85–95", 55, "72V 40Ah Li-ion", "1500W hub", "5–6", ["#141414", "#ffb400"]),
        ("mg", "Mini Go", 72000, "45–50", 35, "48V 24Ah Li-ion", "500W hub", "4", ["#7ab6ff", "#ffffff", "#e5361b"]),
        ("cp", "Cargo Pro", 165000, "70–80", 40, "72V 50Ah Li-ion", "2000W mid", "6–7", ["#2f5d3a", "#141414"])]:
        M[code] = VehicleModel(code=code, name=name, price=price, range_km=rng, top_speed=spd, battery_spec=batt,
                               motor_spec=motor, charge_hours=chg, colours=cols)
        db.add(M[code])
    db.flush()

    V = {}
    for i, (m, ch, mo, ba, cost, st, loc) in enumerate([
        ("c60", "PM-C60-24-0117", "MT10-88213", "BT60-55102", 98000, "stock", "showroom"),
        ("c60", "PM-C60-24-0118", "MT10-88219", "BT60-55107", 98000, "stock", "showroom"),
        ("c60", "PM-C60-24-0121", "MT10-88240", "BT60-55130", 98000, "sold", "showroom"),
        ("c60", "PM-C60-24-0124", "MT10-88251", "BT60-55141", 98000, "stock", "warehouse"),
        ("r90", "PM-R90-24-0042", "MT15-30311", "BT72-71004", 121000, "stock", "showroom"),
        ("r90", "PM-R90-24-0045", "MT15-30318", "BT72-71011", 121000, "sold", "showroom"),
        ("mg", "PM-MG-24-0302", "MT05-11790", "BT48-20950", 58000, "sold", "showroom"),
        ("mg", "PM-MG-24-0310", "MT05-11820", "BT48-20991", 58000, "stock", "showroom"),
        ("mg", "PM-MG-24-0311", "MT05-11826", "BT48-20997", 58000, "stock", "warehouse"),
        ("mg", "PM-MG-24-0314", "MT05-11841", "BT48-21010", 58000, "stock", "warehouse"),
        ("cp", "PM-CP-24-0007", "MT20-00731", "BT72-90022", 139000, "booked", "warehouse")]):
        cols = M[m].colours
        V[ch] = Vehicle(model_id=M[m].id, chassis_no=ch, motor_no=mo, controller_no=f"CT{41000 + i * 37}",
                        charger_no=f"CH{72000 + i * 53}", colour=cols[i % len(cols)], cost=cost, location=loc, status=st)
        db.add(V[ch])
        db.flush()
        V[ch]._battery = Battery(serial=ba, type=M[m].battery_spec, vehicle_id=V[ch].id, purchased_on=ago(400),
                                 warranty_months=24, status="stock")
        db.add(V[ch]._battery)
    V["PM-C60-24-0121"].registration = "KU-LA 11-2034"
    db.add(Battery(serial="BT60-56001", type="60V 30Ah Li-ion", status="spare", purchased_on=ago(60)))
    db.add(Battery(serial="BT72-71090", type="72V 40Ah Li-ion", status="spare", purchased_on=ago(60)))

    C = {}
    for n, p, a, src, days in [
        ("Rahim Ahmed", "01711000101", "Mirpur, Kushtia", "Facebook", 260), ("Salma Khatun", "01911000202", "Kumarkhali", "Walk-in", 207),
        ("Jahid Hasan", "01811000303", "Bheramara", "Website", 7), ("Nasrin Akter", "01611000404", "Kushtia Sadar", "Phone", 5),
        ("Abdul Karim", "01511000505", "Daulatpur", "Facebook", 28), ("Mitu Rani", "01711000606", "Khoksa", "Facebook", 0),
        ("Sohel Rana", "01311000707", "Kushtia Sadar", "Website", 0), ("Rubel Mia", "01411000808", "Mirpur, Kushtia", "Walk-in", 705),
        ("Monir Hossain", "01911000909", "Kushtia Sadar", "Walk-in", 360), ("Nasir Uddin", "01711001111", "Bheramara", "Phone", 190),
        ("Shirin Sultana", "01811001212", "Kumarkhali", "Website", 184)]:
        C[n] = Customer(name=n, phone=p, address=a, source=src, created_on=ago(days))
        db.add(C[n])
    db.flush()

    rubel_delivered = add_months(T, -24) + timedelta(days=27)  # battery warranty ends in about a month
    O = {}
    for no, cust, m, ch, price, disc, st, created, delivered in [
        (1078, "Rubel Mia", "r90", "PM-R90-24-0045", 145000, 3000, "delivered", rubel_delivered - timedelta(days=2), rubel_delivered),
        (1079, "Salma Khatun", "mg", "PM-MG-24-0302", 72000, 0, "delivered", ago(207), ago(207)),
        (1080, "Rahim Ahmed", "c60", "PM-C60-24-0121", 118000, 3000, "delivered", ago(260), ago(258)),
        (1081, "Abdul Karim", "cp", "PM-CP-24-0007", 165000, 0, "booked", ago(15), None)]:
        O[no] = Order(number=no, customer_id=C[cust].id, model_id=M[m].id, vehicle_id=V[ch].id, price=price, discount=disc,
                      status=st, created_on=created, delivered_on=delivered)
        db.add(O[no])
        if delivered:
            b = V[ch]._battery
            b.status, b.installed_on = "fitted", delivered
    db.flush()
    V["PM-R90-24-0045"]._battery.health, V["PM-R90-24-0045"]._battery.cycles = 81, 410
    V["PM-C60-24-0121"]._battery.health, V["PM-C60-24-0121"]._battery.cycles = 68, 260
    V["PM-MG-24-0302"]._battery.health, V["PM-MG-24-0302"]._battery.cycles = 94, 150

    for no, o, amt, me, when in [(5001, 1078, 142000, "Cash", rubel_delivered - timedelta(days=2)), (5002, 1079, 72000, "Bank", ago(207)),
                                 (5003, 1080, 20000, "Cash", ago(260)), (5004, 1080, 10000, "bKash", ago(168)),
                                 (5005, 1080, 10000, "Nagad", ago(76)), (5006, 1081, 50000, "Bank", ago(15)),
                                 (5007, 1080, 5000, "bKash", ago(13)), (5008, 1081, 15000, "bKash", T)]:
        db.add(Payment(number=no, order_id=O[o].id, amount=amt, method=me, paid_on=when, received_by="Rina"))

    for cust, m, stage, src, days, fu in [("Rahim Ahmed", "c60", 6, "Facebook", 262, False), ("Salma Khatun", "mg", 6, "Walk-in", 208, False),
                                          ("Jahid Hasan", "r90", 2, "Website", 7, True), ("Nasrin Akter", "c60", 1, "Phone", 5, True),
                                          ("Abdul Karim", "cp", 5, "Facebook", 28, False), ("Mitu Rani", "mg", 0, "Facebook", 0, True),
                                          ("Sohel Rana", "r90", 0, "Website", 0, True), ("Rubel Mia", "c60", 3, "Walk-in", 3, True)]:
        db.add(Lead(customer_id=C[cust].id, model_id=M[m].id, stage=stage, source=src, created_on=ago(days), follow_up=fu))

    P = {}
    for n, bn, q, mn, pr, vis in [("Brake pad", "ব্রেক প্যাড", 3, 10, 450, True), ("Controller 60V", "কন্ট্রোলার ৬০V", 4, 2, 6500, False),
                                  ("Charger 60V", "চার্জার ৬০V", 6, 3, 3800, True), ("Tyre 3.00-10", "টায়ার ৩.০০-১০", 12, 6, 1650, True),
                                  ("Tyre tube", "টায়ার টিউব", 5, 8, 350, True), ("Brake cable", "ব্রেক ক্যাবল", 14, 6, 220, False),
                                  ("Headlight LED", "হেডলাইট LED", 7, 4, 950, True), ("Display unit", "ডিসপ্লে ইউনিট", 2, 2, 2900, True),
                                  ("Connector", "কানেক্টর", 22, 15, 400, False)]:
        P[n] = SparePart(name=n, name_bn=bn, stock=q, min_stock=mn, price=pr, visible=vis)
        db.add(P[n])
    db.flush()

    J = [(245, "Rahim Ahmed", "PM-C60-24-0121", "Battery range has dropped", "Karim", 2, 500, ["Brake pad", "Connector"],
          {"Battery voltage": True, "Controller": True, "Motor": True, "Brakes": True}),
         (246, "Monir Hossain", None, "Rear brake squeaks", "Babu", 1, 300, [], {"Battery voltage": True}),
         (247, "Salma Khatun", "PM-MG-24-0302", "General service", "Karim", 4, 400, ["Tyre tube"],
          {k: True for k in ["Battery voltage", "Controller", "Motor", "Brakes", "Tyres", "Wiring"]})]
    for no, cust, ch, cx, tech, stage, lab, items, chk in J:
        desc = f"{V[ch].model.name if V[ch].model else ''} · {ch}" if ch else "Rider 90 · KU-HA 12-0871"
        j = ServiceJob(number=no, customer_id=C[cust].id, vehicle_id=V[ch].id if ch else None, vehicle_desc=desc,
                       complaint=cx, technician_id=users[tech].id, stage=stage, labour=lab, checklist=chk, created_on=ago(1))
        db.add(j)
        db.flush()
        for pn in items:
            db.add(ServiceItem(job_id=j.id, part_id=P[pn].id, qty=1, unit_price=P[pn].price))
            db.add(InventoryTxn(part_id=P[pn].id, type="svc", qty=1, reference=f"Job #{no}", user_name=tech, created_on=ago(1)))

    moves = [("Brake pad", "buy", 4, "PO-311", 20), ("Brake pad", "sale", 6, "Counter", 7), ("Tyre 3.00-10", "buy", 6, "PO-311", 20),
             ("Tyre 3.00-10", "sale", 2, "Counter", 4), ("Charger 60V", "sale", 1, "Counter", 0), ("Headlight LED", "dmg", 1, "Broken in transit", 19),
             ("Connector", "ret", 2, "Job #239", 10), ("Brake cable", "sale", 3, "Counter", 0)]
    for pn, ty, q, ref, days in moves:
        db.add(InventoryTxn(part_id=P[pn].id, type=ty, qty=q, reference=ref, user_name="Shakil", created_on=ago(days)))
    db.flush()
    # opening stock = whatever makes the ledger add up to today's stock
    for p in P.values():
        net = sum(TXN_SIGN[t.type] * t.qty for t in db.scalars(select(InventoryTxn).where(InventoryTxn.part_id == p.id)))
        db.add(InventoryTxn(part_id=p.id, type="open", qty=p.stock - net, reference="Stock count", user_name="Hasan", created_on=ago(24)))

    db.add(WarrantyClaim(number=301, vehicle_id=V["PM-C60-24-0121"].id, component="Battery",
                         description="Range dropped to about 40 km per charge", created_on=ago(1)))
    for name, value in [("order", 1081), ("payment", 5008), ("job", 247), ("quotation", 1081), ("claim", 301)]:
        db.add(Counter(name=name, value=value))
    for u, a in [("Hasan", "Changed price of Rider 90"), ("Karim", "Job #245 moved to Repair"),
                 ("Shakil", "Sold 1 × Charger 60V at counter"), ("Rina", "Recorded payment #5008 · ৳15,000 bKash · order #1081"),
                 ("Rafiq", "Created lead Mitu Rani (Facebook)")]:
        db.add(AuditLog(user_name=u, action=a))
    db.commit()
    return True


def init_db() -> None:
    Base.metadata.create_all(engine)


if __name__ == "__main__":
    init_db()
    with SessionLocal() as s:
        print("Seeded demo data" if seed(s) else "Database already has data; nothing seeded")
