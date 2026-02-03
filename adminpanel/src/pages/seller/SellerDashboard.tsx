import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMe, getStats, getOrders } from '../../api/sellerClient';
import type { SellerMe, SellerStats } from '../../api/sellerClient';
import '../Dashboard.css';

export function SellerDashboard() {
  const [me, setMe] = useState<SellerMe | null>(null);
  const [stats, setStats] = useState<SellerStats | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [meData, statsData, pendingOrders, activeOrders] = await Promise.all([
          getMe(),
          getStats(),
          getOrders({ status: 'pending' }),
          getOrders({ status: 'accepted,assembling,in_transit' }),
        ]);
        setMe(meData);
        setStats(statsData);
        setPendingCount(pendingOrders?.length ?? 0);
        setActiveCount(activeOrders?.length ?? 0);
      } catch {
        setMe(null);
        setStats(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="loader" />
      </div>
    );
  }

  return (
    <div className="dashboard">
      <h1 className="page-title">Панель продавца</h1>
      {me && (
        <p className="page-subtitle" style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
          {me.shop_name || 'Мой магазин'}
        </p>
      )}

      <div className="stats-grid">
        <Link to="/orders?tab=pending" className="stat-card" style={{ textDecoration: 'none' }}>
          <span className="stat-label">Запросы на покупку</span>
          <span className="stat-value">{pendingCount}</span>
          <span className="stat-link">Перейти →</span>
        </Link>
        <Link to="/orders?tab=active" className="stat-card" style={{ textDecoration: 'none' }}>
          <span className="stat-label">Активные заказы</span>
          <span className="stat-value">{activeCount}</span>
          <span className="stat-link">Перейти →</span>
        </Link>
        <div className="stat-card">
          <span className="stat-label">Выполнено заказов</span>
          <span className="stat-value">{stats?.total_completed_orders ?? 0}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Выручка (за все время)</span>
          <span className="stat-value">{(stats?.total_revenue ?? 0).toLocaleString('ru')} ₽</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">К получению (за вычетом 18%)</span>
          <span className="stat-value accent">{(stats?.net_revenue ?? 0).toLocaleString('ru')} ₽</span>
        </div>
        {me && (
          <div className="stat-card">
            <span className="stat-label">Лимит на сегодня</span>
            <span className="stat-value">
              {me.limit_set_for_today
                ? `${me.orders_used_today ?? 0} / ${me.max_orders ?? 0}`
                : 'Не задан'}
            </span>
          </div>
        )}
      </div>

      <div className="dashboard-grid">
        <Link to="/orders" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
          <h3>Заказы</h3>
          <p className="empty-text">Запросы на покупку, активные заказы и история</p>
          <span className="card-footer-link">Перейти к заказам →</span>
        </Link>
        <Link to="/shop" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
          <h3>Настройки магазина</h3>
          <p className="empty-text">Лимиты, ссылка на магазин, товары</p>
          <span className="card-footer-link">Настройки →</span>
        </Link>
        <Link to="/stats" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
          <h3>Статистика продаж</h3>
          <p className="empty-text">Детальная статистика по выручке</p>
          <span className="card-footer-link">Статистика →</span>
        </Link>
      </div>
    </div>
  );
}
