import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import Customer, User

ROLES = {
    "admin": "Admin",
    "manager": "Manager",
    "sales": "Salesperson",
    "svcm": "Service manager",
    "tech": "Technician",
    "acct": "Accounts",
}

# Which admin areas each role can open. "*" means everything.
PERMISSIONS: dict[str, list[str] | str] = {
    "admin": "*",
    "manager": ["dash", "reports", "catalog", "leads", "sales", "orders", "payments", "service", "mechanics",
                "issued", "warranty", "stock", "batteries", "parts", "customers", "remind", "audit"],
    "sales": ["dash", "leads", "sales", "orders", "stock", "batteries", "customers", "remind"],
    "svcm": ["dash", "service", "mechanics", "issued", "warranty", "batteries", "parts", "customers", "remind"],
    "tech": ["service", "issued"],
    "acct": ["dash", "reports", "orders", "payments", "parts", "customers", "audit"],
}
ALL_AREAS = ["dash", "reports", "catalog", "leads", "sales", "orders", "payments", "service", "mechanics", "issued",
             "warranty", "stock", "batteries", "parts", "customers", "remind", "staff", "settings", "audit"]


def areas_for(role: str) -> list[str]:
    p = PERMISSIONS.get(role, [])
    return ALL_AREAS if p == "*" else list(p)


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 200_000)
    return f"pbkdf2${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt, digest = stored.split("$")
    except ValueError:
        return False
    check = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 200_000)
    return hmac.compare_digest(check.hex(), digest)


def make_token(sub: str, kind: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(hours=settings.token_hours)
    return jwt.encode({"sub": sub, "kind": kind, "exp": exp}, settings.secret_key, algorithm="HS256")


bearer = HTTPBearer(auto_error=False)


def _decode(creds: HTTPAuthorizationCredentials | None) -> dict:
    if not creds:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in")
    try:
        return jwt.decode(creds.credentials, settings.secret_key, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired, please sign in again")


def current_user(creds=Depends(bearer), db: Session = Depends(get_db)) -> User:
    data = _decode(creds)
    if data.get("kind") != "staff":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Staff only")
    user = db.get(User, int(data["sub"]))
    if not user or not user.active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account disabled")
    return user


def current_customer(creds=Depends(bearer), db: Session = Depends(get_db)) -> Customer:
    data = _decode(creds)
    if data.get("kind") != "customer":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Customers only")
    c = db.get(Customer, int(data["sub"]))
    if not c:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unknown customer")
    return c


def require(*areas: str):
    """Dependency: the signed-in staff member must be allowed to open at least one of these areas."""
    def dep(user: User = Depends(current_user)) -> User:
        allowed = areas_for(user.role)
        if not any(a in allowed for a in areas):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Your role can't do this")
        return user
    return dep
