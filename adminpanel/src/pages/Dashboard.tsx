import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAllStats, getAllSellers } from '../api/adminClient';
import type { SellerStats } from '../types';
import './Dashboard.css';

export function Dashboard() {
  const [sellerStats, setSellerStats] = useState<SellerStats[]>([]);
  const [sellersCount, setSellersCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [stats, sellers] = await Promise.all([
          getAllStats(),
          getAllSellers(),
        ]);
        setSellerStats(stats || []);
        setSellersCount(sellers?.length || 0);
      } catch {
        setSellerStats([]);
        setSellersCount(0);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const totalOrders = sellerStats.reduce((s, x) => s + (x.orders_count || 0), 0);
  const totalSales = sellerStats.reduce((s, x) => s + (x.total_sales || 0), 0);
  const totalProfit = sellerStats.reduce((s, x) => s + (x.platform_profit || 0), 0);
  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="loader" />
      </div>
    );
  }

  return (
    <div className="dashboard">
      <h1 className="page-title">Дашборд</h1>

      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-label">Продавцов</span>
          <span className="stat-value">{sellersCount}</span>
          <Link to="/sellers" className="stat-link">Управление →</Link>
        </div>
        <div className="stat-card">
          <span className="stat-label">Заказов</span>
          <span className="stat-value">{totalOrders}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Продажи</span>
          <span className="stat-value">{totalSales.toLocaleString('ru')} ₽</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Доход платформы</span>
          <span className="stat-value accent">{totalProfit.toLocaleString('ru')} ₽</span>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="card">
          <h3>Топ продавцов</h3>
          {sellerStats.length === 0 ? (
            <p className="empty-text">Нет данных</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>ФИО</th>
                    <th>Заказов</th>
                    <th>Продажи</th>
                    <th>Доход 18%</th>
                  </tr>
                </thead>
                <tbody>
                  {sellerStats.slice(0, 5).map((s) => (
                    <tr key={s.fio}>
                      <td>{s.fio}</td>
                      <td>{s.orders_count}</td>
                      <td>{s.total_sales.toLocaleString('ru')} ₽</td>
                      <td>{s.platform_profit.toLocaleString('ru')} ₽</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Link to="/stats" className="card-footer-link">Вся статистика →</Link>
        </div>
      </div>
    </div>
  );
}
