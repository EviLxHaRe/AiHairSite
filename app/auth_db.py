from __future__ import annotations

import hashlib
import hmac
import os
import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator, Optional


PBKDF2_ITERATIONS = 210_000


@dataclass
class User:
    user_id: int
    username: str
    first_name: str
    last_name: str
    role: str


def _connect(db_path: str | Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def _managed_connection(db_path: str | Path) -> Iterator[sqlite3.Connection]:
    conn = _connect(db_path)
    try:
        yield conn
    finally:
        conn.close()


def init_db(db_path: str | Path) -> None:
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)

    with _managed_connection(path) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                first_name TEXT NOT NULL,
                last_name TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('admin', 'user')),
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
            """
        )
        conn.commit()


def _hash_password(password: str, salt_hex: str) -> str:
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        bytes.fromhex(salt_hex),
        PBKDF2_ITERATIONS,
    )
    return digest.hex()


def create_user(
    db_path: str | Path,
    username: str,
    password: str,
    first_name: str,
    last_name: str,
    role: str = "user",
) -> bool:
    if role not in {"admin", "user"}:
        raise ValueError("Role must be 'admin' or 'user'")
    if not username.strip() or not password:
        raise ValueError("Username and password are required")
    if not first_name.strip() or not last_name.strip():
        raise ValueError("First name and last name are required")

    salt = os.urandom(16).hex()
    password_hash = _hash_password(password, salt)

    try:
        with _managed_connection(db_path) as conn:
            conn.execute(
                """
                INSERT INTO users (username, password_hash, salt, first_name, last_name, role)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (username.strip(), password_hash, salt, first_name.strip(), last_name.strip(), role),
            )
            conn.commit()
            return True
    except sqlite3.IntegrityError:
        return False


def authenticate(db_path: str | Path, username: str, password: str) -> Optional[User]:
    with _managed_connection(db_path) as conn:
        row = conn.execute(
            "SELECT id, username, password_hash, salt, first_name, last_name, role FROM users WHERE username = ?",
            (username.strip(),),
        ).fetchone()

    if row is None:
        return None

    candidate_hash = _hash_password(password, row["salt"])
    if not hmac.compare_digest(candidate_hash, row["password_hash"]):
        return None

    return User(
        user_id=int(row["id"]),
        username=str(row["username"]),
        first_name=str(row["first_name"]),
        last_name=str(row["last_name"]),
        role=str(row["role"]),
    )


def ensure_default_admin(
    db_path: str | Path,
    username: str = "admin",
    password: str = "admin123",
    first_name: str = "System",
    last_name: str = "Admin",
) -> None:
    with _managed_connection(db_path) as conn:
        row = conn.execute(
            "SELECT id FROM users WHERE username = ?",
            (username,),
        ).fetchone()

    if row is None:
        create_user(
            db_path=db_path,
            username=username,
            password=password,
            first_name=first_name,
            last_name=last_name,
            role="admin",
        )


def list_users(db_path: str | Path) -> list[User]:
    with _managed_connection(db_path) as conn:
        rows = conn.execute(
            "SELECT id, username, first_name, last_name, role FROM users ORDER BY id"
        ).fetchall()

    return [
        User(
            user_id=int(row["id"]),
            username=str(row["username"]),
            first_name=str(row["first_name"]),
            last_name=str(row["last_name"]),
            role=str(row["role"]),
        )
        for row in rows
    ]
