import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAllStats, getAllSellers } from '../api/adminClient';
import type { SellerStats } from '../types';
import { PageHeader, StatCard, EmptyState } from '../components/ui';
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
      <PageHeader title="Дашборд" subtitle="Обзор платформы" />

      <div className="stats-grid">
        <StatCard
          label="Продавцов"
          value={sellersCount}
          link={{ to: '/sellers', label: 'Управление →' }}
        />
        <StatCard label="Заказов" value={totalOrders} />
        <StatCard label="Продажи" value={`${totalSales.toLocaleString('ru')} ₽`} />
        <StatCard label="Доход платформы" value={`${totalProfit.toLocaleString('ru')} ₽`} accent />
      </div>

      <div className="dashboard-grid">
        <div className="card">
          <h3>Топ продавцов</h3>
          {sellerStats.length === 0 ? (
            <EmptyState title="Нет данных" />
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
