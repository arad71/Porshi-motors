"""Small in-place database upgrades for installs created by an earlier version.

Tables are created with create_all(); that never changes existing tables, so new columns
are added here. Every statement is safe to run again.
"""
from sqlalchemy import text

from .db import engine

POSTGRES = [
    "ALTER TABLE batteries ADD COLUMN IF NOT EXISTS cost INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE batteries ADD COLUMN IF NOT EXISTS price INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS kind VARCHAR(10) NOT NULL DEFAULT 'bike'",
    "ALTER TABLE orders ADD COLUMN IF NOT EXISTS battery_id INTEGER REFERENCES batteries(id)",
    "ALTER TABLE orders ALTER COLUMN model_id DROP NOT NULL",
]


def upgrade() -> None:
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as conn:
        for stmt in POSTGRES:
            conn.execute(text(stmt))
