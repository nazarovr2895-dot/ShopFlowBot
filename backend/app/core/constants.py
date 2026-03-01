"""
Shared constants for the backend application.
"""
from decimal import Decimal

# ---------------------------------------------------------------------------
# Order statuses
# ---------------------------------------------------------------------------
VALID_ORDER_STATUSES = [
    "pending", "accepted", "assembling", "in_transit",
    "ready_for_pickup", "done", "completed", "rejected", "cancelled",
]

COMPLETED_ORDER_STATUSES = ("done", "completed")

# Statuses that require payment to be completed before transitioning
STATUSES_REQUIRING_PAYMENT = ("assembling", "in_transit", "ready_for_pickup", "done")

# ---------------------------------------------------------------------------
# Decimal helpers
# ---------------------------------------------------------------------------
ZERO = Decimal("0")
ONE_CENT = Decimal("0.01")
PERCENT_BASE = Decimal("100")

# ---------------------------------------------------------------------------
# Preorder schedule limits
# ---------------------------------------------------------------------------
MAX_PREORDER_LOOKAHEAD_DAYS = 365
MAX_INTERVAL_ITERATIONS = 52
