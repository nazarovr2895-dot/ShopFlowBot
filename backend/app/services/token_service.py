"""Refresh token service: creation, rotation, revocation, cleanup."""
import hashlib
import secrets
from datetime import datetime, timedelta
from typing import Optional, Tuple

from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.refresh_token import RefreshToken

REFRESH_TOKEN_EXPIRE_DAYS = 30
ACCESS_TOKEN_EXPIRE_MINUTES = 30


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def create_refresh_token(
    session: AsyncSession,
    user_type: str,
    user_id: str,
    owner_id: Optional[str] = None,
    is_primary: bool = True,
    device_info: Optional[str] = None,
) -> str:
    """Create and store a new refresh token. Returns the plaintext token."""
    token = generate_refresh_token()
    db_token = RefreshToken(
        token_hash=hash_token(token),
        user_type=user_type,
        user_id=user_id,
        owner_id=owner_id,
        is_primary=is_primary,
        device_info=device_info,
        expires_at=datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
    )
    session.add(db_token)
    await session.flush()
    return token


async def validate_and_rotate_refresh_token(
    session: AsyncSession,
    token: str,
) -> Optional[Tuple[RefreshToken, str]]:
    """Validate refresh token, revoke it, create replacement.

    Returns (old_db_record, new_plaintext_token) or None if invalid.
    If a revoked token is presented (replay attack), revokes the entire chain.
    """
    token_hash = hash_token(token)
    result = await session.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    db_token = result.scalar_one_or_none()

    if not db_token:
        return None

    # Replay attack detection: token already used
    if db_token.revoked_at is not None:
        await _revoke_descendant_chain(session, db_token.replaced_by_hash)
        return None

    # Expired
    if db_token.expires_at < datetime.utcnow():
        db_token.revoked_at = datetime.utcnow()
        await session.flush()
        return None

    # Rotate: revoke old, create new
    new_token = generate_refresh_token()
    new_hash = hash_token(new_token)

    db_token.revoked_at = datetime.utcnow()
    db_token.replaced_by_hash = new_hash

    new_db_token = RefreshToken(
        token_hash=new_hash,
        user_type=db_token.user_type,
        user_id=db_token.user_id,
        owner_id=db_token.owner_id,
        is_primary=db_token.is_primary,
        device_info=db_token.device_info,
        expires_at=datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
    )
    session.add(new_db_token)
    await session.flush()

    return db_token, new_token


async def revoke_token(session: AsyncSession, token: str) -> bool:
    """Revoke a specific refresh token. Returns True if found and revoked."""
    token_hash = hash_token(token)
    result = await session.execute(
        update(RefreshToken)
        .where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked_at.is_(None),
        )
        .values(revoked_at=datetime.utcnow())
    )
    await session.flush()
    return result.rowcount > 0


async def revoke_all_user_tokens(
    session: AsyncSession,
    user_type: str,
    user_id: str,
) -> int:
    """Revoke all active refresh tokens for a user."""
    result = await session.execute(
        update(RefreshToken)
        .where(
            RefreshToken.user_type == user_type,
            RefreshToken.user_id == user_id,
            RefreshToken.revoked_at.is_(None),
        )
        .values(revoked_at=datetime.utcnow())
    )
    await session.flush()
    return result.rowcount


async def cleanup_expired_tokens(session: AsyncSession) -> int:
    """Delete tokens expired more than 7 days ago."""
    cutoff = datetime.utcnow() - timedelta(days=7)
    result = await session.execute(
        delete(RefreshToken).where(RefreshToken.expires_at < cutoff)
    )
    await session.flush()
    return result.rowcount


async def _revoke_descendant_chain(session: AsyncSession, token_hash: Optional[str]):
    """Follow the replaced_by_hash chain and revoke all descendants."""
    while token_hash:
        result = await session.execute(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        )
        descendant = result.scalar_one_or_none()
        if not descendant or descendant.revoked_at is not None:
            break
        descendant.revoked_at = datetime.utcnow()
        token_hash = descendant.replaced_by_hash
    await session.flush()
