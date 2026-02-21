# Referral system disabled (MLM 7%+2% removed).
# Functions kept as no-ops in case of stale imports.


async def register_referral(session, new_user_id: int, referrer_id: int):
    """No-op: referral system disabled."""
    return False


async def calculate_rewards(session, order_total: float, buyer_id: int):
    """No-op: referral system disabled."""
    return []


async def accrue_commissions(session, order_total: float, buyer_id: int) -> list:
    """No-op: referral system disabled."""
    return []
