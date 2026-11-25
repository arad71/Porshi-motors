"""Request bodies. Responses are plain dicts built in serializers.py."""
import re

from pydantic import BaseModel, Field, field_validator

PHONE = re.compile(r"^01\d{9}$")


def norm_phone(v: str) -> str:
    v = re.sub(r"[\s\-]", "", v or "")
    if v.startswith("+880"):
        v = v[3:]
    elif v.startswith("880"):
        v = v[2:]
    if not PHONE.match(v):
        raise ValueError("Phone must be an 11-digit Bangladeshi mobile number starting 01")
    return v


class PhoneModel(BaseModel):
    phone: str

    @field_validator("phone")
    @classmethod
    def _p(cls, v):
        return norm_phone(v)


class Login(BaseModel):
    phone: str
    password: str


class OtpRequest(PhoneModel):
    pass


class OtpVerify(PhoneModel):
    code: str = Field(min_length=4, max_length=6)


class TestRide(PhoneModel):
    name: str = Field(min_length=1, max_length=80)
    model_id: int
    preferred_date: str | None = None


class ServiceBooking(PhoneModel):
    name: str = Field(min_length=1, max_length=80)
    model_id: int | None = None
    complaint: str = Field(default="", max_length=500)


class Enquiry(PhoneModel):
    name: str = Field(min_length=1, max_length=80)
    model_id: int
    kind: str = Field(pattern="^(quote|finance)$")
    message: str = Field(default="", max_length=500)


class CustomerIn(PhoneModel):
    name: str = Field(min_length=1, max_length=80)
    address: str = Field(default="", max_length=160)
    source: str = Field(default="Walk-in", max_length=30)


class LeadIn(BaseModel):
    customer_id: int
    model_id: int | None = None
    source: str = "Walk-in"
    note: str = ""


class LeadStage(BaseModel):
    stage: int = Field(ge=0, le=6)


class QuotationIn(BaseModel):
    customer_id: int
    model_id: int
    discount: int = Field(default=0, ge=0)
    advance: int = Field(default=0, ge=0)


class PaymentIn(BaseModel):
    order_id: int
    amount: int = Field(gt=0)
    method: str = Field(pattern="^(Cash|bKash|Nagad|Bank|Card)$")


class JobIn(BaseModel):
    customer_id: int
    vehicle_id: int | None = None
    vehicle_desc: str = ""
    complaint: str = ""
    technician_id: int | None = None
    labour: int = Field(default=400, ge=0)


class JobPatch(BaseModel):
    stage: int | None = Field(default=None, ge=0, le=5)
    technician_id: int | None = None
    labour: int | None = Field(default=None, ge=0)
    checklist: dict[str, bool] | None = None


class JobItemIn(BaseModel):
    part_id: int
    qty: int = Field(default=1, gt=0)


class ModelIn(BaseModel):
    code: str = Field(min_length=1, max_length=20)
    name: str = Field(min_length=1, max_length=80)
    price: int = Field(gt=0)
    range_km: str = ""
    top_speed: int = 0
    battery_spec: str = ""
    motor_spec: str = ""
    charge_hours: str = ""
    colours: list[str] = []
    image_url: str = ""
    visible: bool = True

    @field_validator("colours")
    @classmethod
    def _c(cls, v):
        return [c for c in v if re.match(r"^#[0-9a-fA-F]{6}$", c)][:4]


class VehicleIn(BaseModel):
    model_id: int
    chassis_no: str
    motor_no: str
    controller_no: str = ""
    charger_no: str = ""
    battery_serial: str
    colour: str = ""
    cost: int = Field(default=0, ge=0)
    location: str = Field(default="showroom", pattern="^(showroom|warehouse)$")


class BatteryCheck(BaseModel):
    health: int = Field(ge=0, le=100)
    cycles: int = Field(ge=0)


class PartIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    name_bn: str = ""
    stock: int = Field(default=0, ge=0)
    min_stock: int = Field(default=0, ge=0)
    price: int = Field(default=0, ge=0)
    visible: bool = True


class TxnIn(BaseModel):
    part_id: int
    type: str = Field(pattern="^(buy|sale|svc|ret|dmg)$")
    qty: int = Field(gt=0)
    reference: str = ""


class ClaimIn(BaseModel):
    vehicle_id: int
    component: str = Field(pattern="^(Battery|Motor|Controller|Charger)$")
    description: str = Field(min_length=1, max_length=500)


class ClaimPatch(BaseModel):
    status: str = Field(pattern="^(Open|Approved|Closed)$")


class UserIn(PhoneModel):
    name: str = Field(min_length=1, max_length=80)
    role: str = Field(pattern="^(admin|manager|sales|svcm|tech|acct)$")
    password: str = Field(min_length=6)
    speciality: str = ""


class UserPatch(BaseModel):
    role: str | None = Field(default=None, pattern="^(admin|manager|sales|svcm|tech|acct)$")
    active: bool | None = None
    available: bool | None = None
    password: str | None = Field(default=None, min_length=6)
    speciality: str | None = None


class SendReminders(BaseModel):
    keys: list[str] = []  # empty = all due


class Broadcast(BaseModel):
    model_id: int
