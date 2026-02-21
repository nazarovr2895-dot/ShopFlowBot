from sqlalchemy import select, update, delete, func
from bot.database.models import async_session, User, Seller, Product, Order, City, District, Metro, GlobalSettings
from datetime import datetime

# --- ГЛОБАЛЬНЫЕ НАСТРОЙКИ ---
async def get_settings():
    async with async_session() as session:
        settings = await session.get(GlobalSettings, 1)
        if not settings:
            settings = GlobalSettings(id=1, commission_percent=3)
            session.add(settings); await session.commit()
        return settings

async def update_commission(new_value: int):
    async with async_session() as session:
        await session.execute(update(GlobalSettings).where(GlobalSettings.id == 1).values(commission_percent=new_value))
        await session.commit()

# --- СТАТИСТИКА (ADMIN MODE) ---
async def get_platform_stats():
    async with async_session() as session:
        settings = await get_settings()
        comm = settings.commission_percent
        result = await session.execute(
            select(User.fio, func.count(Order.id).label('orders_count'), func.sum(Order.total_price).label('total_sales'))
            .join(Order, User.tg_id == Order.seller_id)
            .where(Order.status == 'delivered').group_by(User.fio)
        )
        stats = []
        for row in result:
            sales = float(row.total_sales) if row.total_sales else 0.0
            stats.append({'fio': row.fio, 'count': row.orders_count, 'sales': sales, 'profit': (sales * comm) / 100})
        return stats, comm

# --- РОЛИ И ПРОВЕРКА ДОСТУПА ---
async def get_user_role(tg_id: int):
    async with async_session() as session:
        user = await session.get(User, tg_id)
        return user.role if user else 'BUYER'

async def check_seller_access(tg_id: int):
    async with async_session() as session:
        seller = await session.get(Seller, tg_id)
        if not seller: return "NOT_FOUND"
        return "BLOCKED" if seller.is_blocked else "OK"

# --- ADMIN: УПРАВЛЕНИЕ ПРОДАВЦАМИ ---
async def get_cities():
    async with async_session() as session:
        res = await session.scalars(select(City)); return res.all()

async def get_districts_by_city(city_id: int):
    async with async_session() as session:
        res = await session.scalars(select(District).where(District.city_id == city_id)); return res.all()

async def add_new_seller_db(tg_id, fio, phone, shop_name, info, city_id, district_id, map_url, delivery, expiry):
    async with async_session() as session:
        user = await session.get(User, tg_id)
        
        # ИСПРАВЛЕНИЕ: Меняем роль на SELLER только если текущая роль - BUYER
        if not user:
            user = User(tg_id=tg_id, fio=fio, phone=phone, role='SELLER')
            session.add(user)
        else:
            # Если ты уже ADMIN, роль НЕ меняется на SELLER
            if user.role == 'BUYER':
                user.role = 'SELLER'
            user.fio = fio
            user.phone = phone
        
        # Остальная часть функции (запись в таблицу sellers) остается без изменений
        seller = await session.get(Seller, tg_id)
        if not seller:
            session.add(Seller(
                seller_id=tg_id, shop_name=shop_name, description=info,
                city_id=city_id, district_id=district_id, map_url=map_url,
                delivery_type=delivery, placement_expired_at=expiry, max_orders=0
            ))
        else:
            seller.shop_name = shop_name; seller.description = info
            seller.delivery_type = delivery; seller.placement_expired_at = expiry
        
        await session.commit()

async def get_seller_by_fio(fio: str):
    async with async_session() as session:
        res = await session.scalars(select(User).where(User.fio.ilike(f"%{fio}%"), User.role == 'SELLER')); return res.all()

async def update_seller_block_status(tg_id: int, status: bool):
    async with async_session() as session:
        s = await session.get(Seller, tg_id)
        if s: s.is_blocked = status; await session.commit()

async def delete_seller_db(tg_id: int):
    async with async_session() as session:
        await session.execute(delete(Seller).where(Seller.seller_id == tg_id))
        await session.execute(update(User).where(User.tg_id == tg_id).values(role='BUYER')); await session.commit()

# --- ПРОДАВЕЦ (SELLER MODE) ---
async def get_shop_info(seller_id: int):
    async with async_session() as session: return await session.get(Seller, seller_id)

async def create_product(seller_id, name, price, description, photo_id):
    async with async_session() as session:
        session.add(Product(seller_id=seller_id, name=name, price=price, description=description, photo_id=photo_id)); await session.commit()

async def get_products_by_seller(seller_id: int):
    async with async_session() as session:
        res = await session.scalars(select(Product).where(Product.seller_id == seller_id)); return res.all()

async def delete_product_by_id(p_id: int):
    async with async_session() as session:
        await session.execute(delete(Product).where(Product.id == p_id)); await session.commit()

async def get_seller_orders(seller_id: int):
    async with async_session() as session:
        res = await session.scalars(select(Order).where(Order.seller_id == seller_id, Order.status == 'pending')); return res.all()

async def update_order_status(o_id: int, status: str):
    async with async_session() as session:
        await session.execute(update(Order).where(Order.id == o_id).values(status=status)); await session.commit()

# --- ПОКУПАТЕЛЬ ---
async def create_order(b_id, items, price, phone, addr, a_id=None):
    async with async_session() as session:
        session.add(Order(buyer_id=b_id, seller_id=8073613186, items_info=items, total_price=price, address=addr, agent_id=a_id, status='pending')); await session.commit()

async def get_products_by_ids(ids: list[int]):
    async with async_session() as session:
        res = await session.scalars(select(Product).where(Product.id.in_(ids))); return res.all()