# backend/app/services/buyers.py
"""
Buyer service - handles all buyer/user-related business logic.
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional, Dict, Any

from backend.app.models.user import User


class BuyerServiceError(Exception):
    """Base exception for buyer service errors."""
    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class UserNotFoundError(BuyerServiceError):
    def __init__(self, tg_id: int):
        super().__init__(f"User {tg_id} not found", 404)


class BuyerService:
    """Service class for buyer/user operations."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
    
    async def get_buyer(self, tg_id: int) -> Optional[User]:
        """
        Find a user by Telegram ID.
        
        Returns:
            User object or None if not found
        """
        result = await self.session.execute(
            select(User).where(User.tg_id == tg_id)
        )
        return result.scalar_one_or_none()
    
    async def get_buyer_info(self, tg_id: int) -> Optional[Dict[str, Any]]:
        """
        Get buyer information as a dictionary.
        
        Returns:
            Dict with buyer info or None if not found
        """
        user = await self.get_buyer(tg_id)
        if not user:
            return None
        
        return {
            "id": user.tg_id,
            "tg_id": user.tg_id,
            "username": user.username,
            "fio": user.fio,
            "phone": user.phone,
            "role": user.role,
            "balance": float(user.balance) if user.balance else 0.0,
            "referrer_id": user.referrer_id,
            "city_id": user.city_id,
            "district_id": user.district_id,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "privacy_accepted": bool(user.privacy_accepted),
            "privacy_accepted_at": user.privacy_accepted_at.isoformat() if user.privacy_accepted_at else None,
        }
    
    async def register_buyer(
        self,
        tg_id: int,
        username: Optional[str] = None,
        fio: Optional[str] = None,
        referrer_id: Optional[int] = None
    ) -> User:
        """
        Create or return existing user (buyer).
        
        If user exists, returns existing user without modifying referrer.
        Referrer binding is permanent (one-time only).
        
        Args:
            tg_id: Telegram user ID
            username: Telegram username
            fio: Full name
            referrer_id: ID of the user who referred this buyer
            
        Returns:
            User object (new or existing)
        """
        # Check if user already exists
        result = await self.session.execute(
            select(User).where(User.tg_id == tg_id)
        )
        existing_user = result.scalar_one_or_none()
        
        if existing_user:
            # User exists, don't change referrer (binding is permanent)
            return existing_user
        
        # Validate referrer (can't be self)
        if referrer_id == tg_id:
            referrer_id = None
        
        # Create new user
        new_user = User(
            tg_id=tg_id,
            username=username,
            fio=fio,
            role="BUYER",
            referrer_id=referrer_id,
            balance=0
        )
        self.session.add(new_user)
        await self.session.commit()
        await self.session.refresh(new_user)
        
        return new_user
    
    async def update_profile(
        self,
        tg_id: int,
        **fields
    ) -> Dict[str, Any]:
        """
        Update user profile fields.
        
        Args:
            tg_id: Telegram user ID
            **fields: Fields to update (fio, phone, username, etc.)
            
        Returns:
            Updated user info
            
        Raises:
            UserNotFoundError: If user doesn't exist
        """
        user = await self.get_buyer(tg_id)
        if not user:
            raise UserNotFoundError(tg_id)
        
        allowed_fields = {"fio", "phone", "username", "city_id", "district_id", "privacy_accepted", "privacy_accepted_at"}
        
        for field, value in fields.items():
            if field in allowed_fields and value is not None:
                setattr(user, field, value)
        
        await self.session.commit()
        await self.session.refresh(user)
        
        return await self.get_buyer_info(tg_id)
    
    async def get_balance(self, tg_id: int) -> float:
        """
        Get user's current balance.
        
        Returns:
            Balance as float
            
        Raises:
            UserNotFoundError: If user doesn't exist
        """
        user = await self.get_buyer(tg_id)
        if not user:
            raise UserNotFoundError(tg_id)
        
        return float(user.balance) if user.balance else 0.0
    
    async def update_balance(
        self,
        tg_id: int,
        amount: float,
        operation: str = "add"
    ) -> float:
        """
        Update user's balance.
        
        Args:
            tg_id: Telegram user ID
            amount: Amount to add/subtract/set
            operation: "add", "subtract", or "set"
            
        Returns:
            New balance
            
        Raises:
            UserNotFoundError: If user doesn't exist
            BuyerServiceError: If operation invalid or insufficient funds
        """
        user = await self.get_buyer(tg_id)
        if not user:
            raise UserNotFoundError(tg_id)
        
        current_balance = float(user.balance) if user.balance else 0.0
        
        if operation == "add":
            new_balance = current_balance + amount
        elif operation == "subtract":
            new_balance = current_balance - amount
            if new_balance < 0:
                raise BuyerServiceError("Insufficient funds")
        elif operation == "set":
            if amount < 0:
                raise BuyerServiceError("Balance cannot be negative")
            new_balance = amount
        else:
            raise BuyerServiceError(f"Invalid operation: {operation}")
        
        user.balance = new_balance
        await self.session.commit()
        
        return new_balance


# Legacy functions for backward compatibility
async def get_buyer(session: AsyncSession, tg_id: int):
    """Legacy function - use BuyerService.get_buyer instead."""
    service = BuyerService(session)
    return await service.get_buyer(tg_id)


async def create_buyer(session: AsyncSession, user_data: dict):
    """Legacy function - use BuyerService.register_buyer instead."""
    service = BuyerService(session)
    return await service.register_buyer(
        tg_id=user_data['tg_id'],
        username=user_data.get('username'),
        fio=user_data.get('fio'),
        referrer_id=user_data.get('referrer_id')
    )
