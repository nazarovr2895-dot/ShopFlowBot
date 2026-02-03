"""Password hashing. Uses bcrypt directly (passlib has incompatibilities with bcrypt 4.1+)."""
import bcrypt


def _to_bytes(password: str) -> bytes:
    """Convert password to bytes, truncate to 72 bytes (bcrypt limit)."""
    if not isinstance(password, str):
        password = str(password)
    return password.encode("utf-8")[:72]


def hash_password(password: str) -> str:
    """Hash password with bcrypt."""
    pwd_bytes = _to_bytes(password)
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Verify plain password against bcrypt hash."""
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(_to_bytes(plain), hashed.encode("utf-8"))
    except Exception:
        return False
