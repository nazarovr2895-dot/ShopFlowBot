import { useEffect, useState } from 'react';
import { getStats } from '../../api/sellerClient';
import type { SellerStats as SellerStatsType } from '../../api/sellerClient';
import '../Stats.css';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Ожидают',
  accepted: 'В работе',
  assembling: 'Собираются',
  in_transit: 'В пути',
  done: 'Выполнены',
  completed: 'Завершены',
  rejected: 'Отклонены',
};

export function SellerStats() {
  const [stats, setStats] = useState<SellerStatsType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getStats();
        setStats(data);
      } catch {
        setStats(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="stats-loading">
        <div className="loader" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="stats-page">
        <h1 className="page-title">Статистика продаж</h1>
        <div className="card">
          <p className="empty-text">Не удалось загрузить статистику</p>
        </div>
      </div>
    );
  }

  const statusRows = Object.entries(stats.orders_by_status || {}).map(([status, count]) => (
    <tr key={status}>
      <td>{STATUS_LABELS[status] || status}</td>
      <td>{count}</td>
    </tr>
  ));

  return (
    <div className="stats-page">
      <h1 className="page-title">Статистика продаж</h1>

      <div className="card">
        <h3>Заказы по статусам</h3>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Статус</th>
                <th>Количество</th>
              </tr>
            </thead>
            <tbody>
              {statusRows.length > 0 ? statusRows : <tr><td colSpan={2}>Нет данных</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>Финансы</h3>
        <div className="single-seller-stats">
          <p><strong>Выполнено заказов:</strong> {stats.total_completed_orders}</p>
          <p><strong>Общая выручка:</strong> {stats.total_revenue.toLocaleString('ru')} ₽</p>
          <p><strong>Комиссия платформы (18%):</strong> {stats.commission_18.toLocaleString('ru')} ₽</p>
          <p><strong>К получению:</strong> <span className="accent">{stats.net_revenue.toLocaleString('ru')} ₽</span></p>
        </div>
      </div>
    </div>
  );
}
