import { useEffect, useState } from 'react';
import { getAllStats, getSellerStats, getAgentsStats } from '../api/adminClient';
import type { SellerStats, AgentStats } from '../types';
import './Stats.css';

export function Stats() {
  const [sellerStats, setSellerStats] = useState<SellerStats[]>([]);
  const [agentStats, setAgentStats] = useState<AgentStats[]>([]);
  const [sellerSearch, setSellerSearch] = useState('');
  const [singleSeller, setSingleSeller] = useState<SellerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [sellers, agents] = await Promise.all([
          getAllStats(),
          getAgentsStats(),
        ]);
        setSellerStats(sellers || []);
        setAgentStats(agents || []);
      } catch {
        setSellerStats([]);
        setAgentStats([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleSellerSearch = async () => {
    if (!sellerSearch.trim()) return;
    setSearching(true);
    try {
      const s = await getSellerStats(sellerSearch.trim());
      setSingleSeller(s);
    } catch {
      setSingleSeller(null);
    } finally {
      setSearching(false);
    }
  };

  const totalOrders = sellerStats.reduce((s, x) => s + (x.orders_count || 0), 0);
  const totalSales = sellerStats.reduce((s, x) => s + (x.total_sales || 0), 0);
  const totalProfit = sellerStats.reduce((s, x) => s + (x.platform_profit || 0), 0);

  if (loading) {
    return (
      <div className="stats-loading">
        <div className="loader" />
      </div>
    );
  }

  return (
    <div className="stats-page">
      <h1 className="page-title">Статистика</h1>

      <div className="stats-summary card">
        <h3>Общая статистика</h3>
        <div className="summary-grid">
          <div className="summary-item">
            <span className="summary-label">Заказов</span>
            <span className="summary-value">{totalOrders}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Продажи</span>
            <span className="summary-value">{totalSales.toLocaleString('ru')} ₽</span>
          </div>
          <div className="summary-item accent">
            <span className="summary-label">Доход платформы (18%)</span>
            <span className="summary-value">{totalProfit.toLocaleString('ru')} ₽</span>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Статистика по продавцу</h3>
        <div className="search-row">
          <input
            type="text"
            className="form-input"
            placeholder="Введите ФИО продавца..."
            value={sellerSearch}
            onChange={(e) => setSellerSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSellerSearch()}
          />
          <button
            className="btn btn-primary"
            onClick={handleSellerSearch}
            disabled={searching}
          >
            {searching ? 'Поиск...' : 'Найти'}
          </button>
        </div>
        {singleSeller && (
          <div className="single-seller-stats">
            <p><strong>{singleSeller.fio}</strong></p>
            <p>Заказов: {singleSeller.orders_count}</p>
            <p>Продажи: {singleSeller.total_sales.toLocaleString('ru')} ₽</p>
            <p>Доход: {singleSeller.platform_profit.toLocaleString('ru')} ₽</p>
          </div>
        )}
      </div>

      <div className="card table-wrap">
        <h3>Все продавцы</h3>
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
            {sellerStats.map((s) => (
              <tr key={s.fio}>
                <td>{s.fio}</td>
                <td>{s.orders_count}</td>
                <td>{s.total_sales.toLocaleString('ru')} ₽</td>
                <td>{s.platform_profit.toLocaleString('ru')} ₽</td>
              </tr>
            ))}
          </tbody>
        </table>
        {sellerStats.length === 0 && <p className="empty-text">Нет данных</p>}
      </div>

      <div className="card table-wrap">
        <h3>Статистика по агентам</h3>
        <table className="table">
          <thead>
            <tr>
              <th>ФИО</th>
              <th>Заказов</th>
              <th>Оборот</th>
            </tr>
          </thead>
          <tbody>
            {agentStats.map((s) => (
              <tr key={s.fio}>
                <td>{s.fio}</td>
                <td>{s.orders_count}</td>
                <td>{s.total_sales.toLocaleString('ru')} ₽</td>
              </tr>
            ))}
          </tbody>
        </table>
        {agentStats.length === 0 && <p className="empty-text">Нет данных</p>}
      </div>
    </div>
  );
}
