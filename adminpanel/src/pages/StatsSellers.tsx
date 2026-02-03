import { useEffect, useState } from 'react';
import { getAllStats, getSellerStats } from '../api/adminClient';
import type { SellerStats } from '../types';
import './Stats.css';

export function StatsSellers() {
  const [sellerStats, setSellerStats] = useState<SellerStats[]>([]);
  const [sellerSearch, setSellerSearch] = useState('');
  const [singleSeller, setSingleSeller] = useState<SellerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const sellers = await getAllStats();
        setSellerStats(sellers || []);
      } catch {
        setSellerStats([]);
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
      setSingleSeller(s ?? null);
    } catch {
      setSingleSeller(null);
    } finally {
      setSearching(false);
    }
  };

  if (loading) {
    return (
      <div className="stats-loading">
        <div className="loader" />
      </div>
    );
  }

  return (
    <div className="stats-page">
      <h1 className="page-title">Статистика продавцов</h1>

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
    </div>
  );
}
