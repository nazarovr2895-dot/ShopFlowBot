import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getMe, getStats, getOrders, getDashboardAlerts } from '../../api/sellerClient';
import type { SellerMe, SellerStats, DashboardAlerts } from '../../api/sellerClient';
import '../Dashboard.css';

const PENDING_POLL_INTERVAL_MS = 45 * 1000;
const NOTIFICATION_TITLE = 'ShopFlow';

export function SellerDashboard() {
  const [me, setMe] = useState<SellerMe | null>(null);
  const [stats, setStats] = useState<SellerStats | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [alerts, setAlerts] = useState<DashboardAlerts | null>(null);
  const [loading, setLoading] = useState(true);
  const lastPendingCountRef = useRef<number | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [meData, statsData, pendingOrders, activeOrders, alertsData] = await Promise.all([
          getMe(),
          getStats(),
          getOrders({ status: 'pending' }),
          getOrders({ status: 'accepted,assembling,in_transit' }),
          getDashboardAlerts(),
        ]);
        setMe(meData);
        setStats(statsData);
        const pending = pendingOrders?.length ?? 0;
        setPendingCount(pending);
        lastPendingCountRef.current = pending;
        setActiveCount(activeOrders?.length ?? 0);
        setAlerts(alertsData);
      } catch {
        setMe(null);
        setStats(null);
        setAlerts(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const tick = async () => {
      try {
        const pendingOrders = await getOrders({ status: 'pending' });
        const count = pendingOrders?.length ?? 0;
        const prev = lastPendingCountRef.current;
        const isHidden = document.visibilityState === 'hidden';
        if (isHidden && prev !== null && count > prev && Notification.permission === 'granted') {
          const text = count - prev === 1
            ? 'Новый запрос на покупку'
            : `Новых запросов на покупку: ${count - prev}`;
          new Notification(NOTIFICATION_TITLE, { body: text });
        }
        lastPendingCountRef.current = count;
        setPendingCount(count);
      } catch {
        // ignore poll errors
      }
    };
    const id = setInterval(tick, PENDING_POLL_INTERVAL_MS);
    return () => clearInterval(id);
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

      {(alerts?.low_stock_bouquets?.length ?? 0) + (alerts?.expiring_items?.length ?? 0) > 0 && (
        <div className="card dashboard-alerts">
          <h3>Внимание</h3>
          {alerts?.low_stock_bouquets?.length ? (
            <p>
              Букеты с низким остатком:{' '}
              {alerts.low_stock_bouquets.map((b) => (
                <Link key={b.id} to="/bouquets">{b.name} (можно собрать: {b.can_assemble_count})</Link>
              )).reduce((prev, curr, i) => (i === 0 ? [curr] : [...prev, ', ', curr]), [] as React.ReactNode[])}
            </p>
          ) : null}
          {alerts?.expiring_items?.length ? (
            <p>
              Цветы с истекающим сроком (≤2 дн.):{' '}
              {alerts.expiring_items.slice(0, 5).map((e, i) => (
                <span key={i}>{e.flower_name} в «{e.reception_name}» ({e.days_left} дн.)</span>
              )).reduce((prev, curr, i) => (i === 0 ? [curr] : [...prev, ', ', curr]), [] as React.ReactNode[])}
              {' '}<Link to="/receptions">→ Приёмка</Link>
            </p>
          ) : null}
        </div>
      )}

      <div className="dashboard-quick-actions">
        <Link to="/receptions" className="btn btn-primary">Приёмка</Link>
        <Link to="/customers" className="btn btn-secondary">Добавить клиента</Link>
        <Link to="/showcase" className="btn btn-secondary">Витрина</Link>
        <Link to="/inventory" className="btn btn-secondary">Инвентаризация</Link>
      </div>

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
