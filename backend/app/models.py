"""Database tables for the Porshi Motors dealership system.

Money is stored as whole Bangladeshi taka (integers). Dates are stored as DATE,
events as timezone-aware timestamps.
"""
from datetime import date, datetime, timezone

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def now():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    phone: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    role: Mapped[str] = mapped_column(String(20))  # admin manager sales svcm tech acct
    password_hash: Mapped[str] = mapped_column(String(200))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    speciality: Mapped[str] = mapped_column(String(80), default="")
    available: Mapped[bool] = mapped_column(Boolean, default=True)  # for technicians (on leave = False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Setting(Base):
    __tablename__ = "settings"
    key: Mapped[str] = mapped_column(String(40), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON)


class VehicleModel(Base):
    __tablename__ = "vehicle_models"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True)
    name: Mapped[str] = mapped_column(String(80))
    price: Mapped[int] = mapped_column(Integer)
    range_km: Mapped[str] = mapped_column(String(20), default="")
    top_speed: Mapped[int] = mapped_column(Integer, default=0)
    battery_spec: Mapped[str] = mapped_column(String(80), default="")
    motor_spec: Mapped[str] = mapped_column(String(80), default="")
    charge_hours: Mapped[str] = mapped_column(String(20), default="")
    colours: Mapped[list] = mapped_column(JSON, default=list)
    image_url: Mapped[str] = mapped_column(String(300), default="")
    visible: Mapped[bool] = mapped_column(Boolean, default=True)


class Vehicle(Base):
    __tablename__ = "vehicles"
    id: Mapped[int] = mapped_column(primary_key=True)
    model_id: Mapped[int] = mapped_column(ForeignKey("vehicle_models.id"))
    chassis_no: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    motor_no: Mapped[str] = mapped_column(String(40))
    controller_no: Mapped[str] = mapped_column(String(40), default="")
    charger_no: Mapped[str] = mapped_column(String(40), default="")
    colour: Mapped[str] = mapped_column(String(20), default="")
    cost: Mapped[int] = mapped_column(Integer, default=0)
    location: Mapped[str] = mapped_column(String(20), default="showroom")  # showroom | warehouse
    status: Mapped[str] = mapped_column(String(20), default="stock")  # stock | booked | sold
    registration: Mapped[str] = mapped_column(String(30), default="")
    model: Mapped[VehicleModel] = relationship()


class Battery(Base):
    __tablename__ = "batteries"
    id: Mapped[int] = mapped_column(primary_key=True)
    serial: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    type: Mapped[str] = mapped_column(String(80))
    vehicle_id: Mapped[int | None] = mapped_column(ForeignKey("vehicles.id"), nullable=True)
    purchased_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    installed_on: Mapped[date | None] = mapped_column(Date, nullable=True)  # warranty starts here
    warranty_months: Mapped[int] = mapped_column(Integer, default=24)
    health: Mapped[int] = mapped_column(Integer, default=100)
    cycles: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="stock")  # stock(in unsold bike) | fitted | spare | replaced
    vehicle: Mapped[Vehicle | None] = relationship()


class Customer(Base):
    __tablename__ = "customers"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    phone: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    address: Mapped[str] = mapped_column(String(160), default="")
    source: Mapped[str] = mapped_column(String(30), default="Walk-in")
    created_on: Mapped[date] = mapped_column(Date, default=date.today)


class Lead(Base):
    __tablename__ = "leads"
    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    model_id: Mapped[int | None] = mapped_column(ForeignKey("vehicle_models.id"), nullable=True)
    stage: Mapped[int] = mapped_column(Integer, default=0)  # 0 New .. 6 Sold
    source: Mapped[str] = mapped_column(String(30), default="Walk-in")
    note: Mapped[str] = mapped_column(Text, default="")
    follow_up: Mapped[bool] = mapped_column(Boolean, default=True)
    created_on: Mapped[date] = mapped_column(Date, default=date.today)
    customer: Mapped[Customer] = relationship()
    model: Mapped[VehicleModel | None] = relationship()


class Quotation(Base):
    __tablename__ = "quotations"
    id: Mapped[int] = mapped_column(primary_key=True)
    number: Mapped[int] = mapped_column(Integer, unique=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    model_id: Mapped[int] = mapped_column(ForeignKey("vehicle_models.id"))
    price: Mapped[int] = mapped_column(Integer)
    discount: Mapped[int] = mapped_column(Integer, default=0)
    advance: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="open")  # open | converted
    created_on: Mapped[date] = mapped_column(Date, default=date.today)
    customer: Mapped[Customer] = relationship()
    model: Mapped[VehicleModel] = relationship()


class Order(Base):
    __tablename__ = "orders"
    id: Mapped[int] = mapped_column(primary_key=True)
    number: Mapped[int] = mapped_column(Integer, unique=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    model_id: Mapped[int] = mapped_column(ForeignKey("vehicle_models.id"))
    vehicle_id: Mapped[int | None] = mapped_column(ForeignKey("vehicles.id"), nullable=True)
    quotation_id: Mapped[int | None] = mapped_column(ForeignKey("quotations.id"), nullable=True)
    price: Mapped[int] = mapped_column(Integer)
    discount: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="booked")  # booked | delivered
    created_on: Mapped[date] = mapped_column(Date, default=date.today)
    delivered_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    customer: Mapped[Customer] = relationship()
    model: Mapped[VehicleModel] = relationship()
    vehicle: Mapped[Vehicle | None] = relationship()
    payments: Mapped[list["Payment"]] = relationship(back_populates="order")

    @property
    def final_price(self) -> int:
        return self.price - self.discount

    @property
    def paid(self) -> int:
        return sum(p.amount for p in self.payments)

    @property
    def balance(self) -> int:
        return self.final_price - self.paid


class Payment(Base):
    __tablename__ = "payments"
    id: Mapped[int] = mapped_column(primary_key=True)
    number: Mapped[int] = mapped_column(Integer, unique=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"))
    amount: Mapped[int] = mapped_column(Integer)
    method: Mapped[str] = mapped_column(String(20))  # Cash bKash Nagad Bank Card
    paid_on: Mapped[date] = mapped_column(Date, default=date.today)
    received_by: Mapped[str] = mapped_column(String(80), default="")
    order: Mapped[Order] = relationship(back_populates="payments")


class SparePart(Base):
    __tablename__ = "spare_parts"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True)
    name_bn: Mapped[str] = mapped_column(String(80), default="")
    stock: Mapped[int] = mapped_column(Integer, default=0)
    min_stock: Mapped[int] = mapped_column(Integer, default=0)
    price: Mapped[int] = mapped_column(Integer, default=0)
    visible: Mapped[bool] = mapped_column(Boolean, default=True)


class InventoryTxn(Base):
    __tablename__ = "inventory_transactions"
    id: Mapped[int] = mapped_column(primary_key=True)
    part_id: Mapped[int] = mapped_column(ForeignKey("spare_parts.id"))
    type: Mapped[str] = mapped_column(String(10))  # open buy sale svc ret dmg
    qty: Mapped[int] = mapped_column(Integer)
    reference: Mapped[str] = mapped_column(String(80), default="")
    user_name: Mapped[str] = mapped_column(String(80), default="")
    created_on: Mapped[date] = mapped_column(Date, default=date.today)
    part: Mapped[SparePart] = relationship()


class ServiceJob(Base):
    __tablename__ = "service_jobs"
    id: Mapped[int] = mapped_column(primary_key=True)
    number: Mapped[int] = mapped_column(Integer, unique=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    vehicle_id: Mapped[int | None] = mapped_column(ForeignKey("vehicles.id"), nullable=True)
    vehicle_desc: Mapped[str] = mapped_column(String(120), default="")
    complaint: Mapped[str] = mapped_column(Text, default="")
    technician_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    stage: Mapped[int] = mapped_column(Integer, default=0)  # 0 Received .. 5 Delivered
    labour: Mapped[int] = mapped_column(Integer, default=0)
    checklist: Mapped[dict] = mapped_column(JSON, default=dict)
    created_on: Mapped[date] = mapped_column(Date, default=date.today)
    customer: Mapped[Customer] = relationship()
    vehicle: Mapped[Vehicle | None] = relationship()
    technician: Mapped[User | None] = relationship()
    items: Mapped[list["ServiceItem"]] = relationship(back_populates="job")

    @property
    def parts_total(self) -> int:
        return sum(i.qty * i.unit_price for i in self.items)

    @property
    def total(self) -> int:
        return self.labour + self.parts_total


class ServiceItem(Base):
    __tablename__ = "service_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("service_jobs.id"))
    part_id: Mapped[int] = mapped_column(ForeignKey("spare_parts.id"))
    qty: Mapped[int] = mapped_column(Integer, default=1)
    unit_price: Mapped[int] = mapped_column(Integer)
    job: Mapped[ServiceJob] = relationship(back_populates="items")
    part: Mapped[SparePart] = relationship()


class WarrantyClaim(Base):
    __tablename__ = "warranty_claims"
    id: Mapped[int] = mapped_column(primary_key=True)
    number: Mapped[int] = mapped_column(Integer, unique=True)
    vehicle_id: Mapped[int] = mapped_column(ForeignKey("vehicles.id"))
    component: Mapped[str] = mapped_column(String(30))
    description: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="Open")  # Open Approved Closed
    created_on: Mapped[date] = mapped_column(Date, default=date.today)
    vehicle: Mapped[Vehicle] = relationship()


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("customers.id"), nullable=True)
    phone: Mapped[str] = mapped_column(String(20))
    kind: Mapped[str] = mapped_column(String(20))  # svc war pay new job otp
    message: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="queued")  # queued sent failed
    reminder_key: Mapped[str] = mapped_column(String(60), default="", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class OtpCode(Base):
    __tablename__ = "otp_codes"
    id: Mapped[int] = mapped_column(primary_key=True)
    phone: Mapped[str] = mapped_column(String(20), index=True)
    code: Mapped[str] = mapped_column(String(10))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used: Mapped[bool] = mapped_column(Boolean, default=False)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_name: Mapped[str] = mapped_column(String(80))
    action: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)


class Counter(Base):
    """Running numbers for orders, payments, jobs, quotations and claims."""
    __tablename__ = "counters"
    __table_args__ = (UniqueConstraint("name"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(20))
    value: Mapped[int] = mapped_column(Integer)
