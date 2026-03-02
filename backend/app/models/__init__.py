# Models package - SQLAlchemy models
# Import all models so SQLAlchemy registers them in Base.metadata
from backend.app.models import (  # noqa: F401
    user, seller, order, product, referral, settings,
    crm, loyalty, subscription, category, delivery_zone, cart,
)
