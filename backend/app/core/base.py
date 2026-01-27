"""
SQLAlchemy Base class for all models.

Separated from database.py to allow importing Base 
without triggering engine creation (needed for tests).
"""
from sqlalchemy.ext.asyncio import AsyncAttrs
from sqlalchemy.orm import DeclarativeBase


class Base(AsyncAttrs, DeclarativeBase):
    """Base class for all SQLAlchemy models."""
    pass
