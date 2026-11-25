"""Create the first admin account on a fresh system.

Usage: python -m app.create_admin "Owner name" 017XXXXXXXX "a-strong-password"
"""
import sys

from sqlalchemy import select

from .db import SessionLocal
from .models import User
from .schemas import norm_phone
from .security import hash_password
from .seed import init_db
from .services import audit


def main() -> None:
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    name, phone, password = sys.argv[1], norm_phone(sys.argv[2]), sys.argv[3]
    if len(password) < 8:
        sys.exit("Use a password of at least 8 characters.")
    init_db()
    with SessionLocal() as db:
        if db.scalar(select(User).where(User.phone == phone)):
            sys.exit("An account with this phone number already exists.")
        db.add(User(name=name, phone=phone, role="admin", password_hash=hash_password(password)))
        audit(db, "System", f"Created admin account for {name}")
        db.commit()
    print(f"Admin account created for {name} ({phone}).")


if __name__ == "__main__":
    main()
