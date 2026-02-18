import { useEffect, useState, useCallback } from 'react';
import { getAdminCustomers, getCities, type AdminCustomersParams } from '../../api/adminClient';
import type { AdminCustomersResponse, City } from '../../types';
import { PageHeader } from '../../components/ui';
import { Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import './AdminCustomers.css';

function fmtCurrency(n: number): string {
  return `${n.toLocaleString('ru-RU')} ₽`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function AdminCustomers() {
  const [data, setData] = useState<AdminCustomersResponse | null>(null);
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);

  const [cityId, setCityId] = useState('');
  const [minOrders, setMinOrders] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: AdminCustomersParams = { page, per_page: 30 };
      if (cityId) params.city_id = Number(cityId);
      if (minOrders) params.min_orders = Number(minOrders);
      const result = await getAdminCustomers(params);
      setData(result);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [cityId, minOrders, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { getCities().then(setCities).catch(() => setCities([])); }, []);

  return (
    <div className="admin-customers">
      <PageHeader title="Покупатели" subtitle="Клиентская база платформы" />

      {/* ── Summary Cards ── */}
      {data && (
        <div className="ac-summary-grid">
          <div className="ac-summary-card">
            <div className="ac-summary-label">Всего покупателей</div>
            <div className="ac-summary-value">{data.summary.total_buyers.toLocaleString('ru')}</div>
          </div>
          <div className="ac-summary-card">
            <div className="ac-summary-label">С заказами</div>
            <div className="ac-summary-value">{data.summary.active_buyers.toLocaleString('ru')}</div>
          </div>
          <div className="ac-summary-card">
            <div className="ac-summary-label">Новых сегодня</div>
            <div className="ac-summary-value">{data.summary.new_today}</div>
          </div>
          <div className="ac-summary-card ac-summary-card--accent">
            <div className="ac-summary-label">Средний LTV</div>
            <div className="ac-summary-value">{fmtCurrency(data.summary.avg_ltv)}</div>
          </div>
        </div>
      )}

      {/* ── City Distribution ── */}
      {data && data.city_distribution.length > 0 && (
        <div className="ac-city-bar">
          <div className="ac-city-title">География</div>
          <div className="ac-city-items">
            {data.city_distribution.map((c) => (
              <div key={c.city} className="ac-city-item">
                <span className="ac-city-name">{c.city}</span>
                <div className="ac-city-bar-bg">
                  <div
                    className="ac-city-bar-fill"
                    style={{ width: `${Math.round((c.count / (data.summary.total_buyers || 1)) * 100)}%` }}
                  />
                </div>
                <span className="ac-city-count">{c.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Filters ── */}
      <div className="ac-filters">
        <Filter size={16} className="ac-filter-icon" />
        <select value={cityId} onChange={(e) => { setCityId(e.target.value); setPage(1); }} className="ac-select">
          <option value="">Все города</option>
          {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input
          type="number"
          placeholder="Мин. заказов"
          className="ac-input"
          value={minOrders}
          onChange={(e) => { setMinOrders(e.target.value); setPage(1); }}
          min="0"
        />
      </div>

      {/* ── Table ── */}
      {loading ? (
        <div className="ac-loading"><div className="loader" /></div>
      ) : !data || data.customers.length === 0 ? (
        <div className="ac-empty">Нет покупателей по фильтрам</div>
      ) : (
        <>
          <div className="ac-table-wrap">
            <table className="ac-table">
              <thead>
                <tr>
                  <th>Покупатель</th>
                  <th>Телефон</th>
                  <th>Город</th>
                  <th>Заказов</th>
                  <th>Потрачено</th>
                  <th>Последний заказ</th>
                  <th>Регистрация</th>
                </tr>
              </thead>
              <tbody>
                {data.customers.map((c) => (
                  <tr key={c.tg_id}>
                    <td className="ac-cell-name">
                      {c.fio || c.username || `#${c.tg_id}`}
                    </td>
                    <td className="ac-cell-phone">{c.phone || '—'}</td>
                    <td className="ac-cell-city">{c.city || '—'}</td>
                    <td className="ac-cell-num">{c.orders_count}</td>
                    <td className="ac-cell-num ac-cell-spent">{fmtCurrency(c.total_spent)}</td>
                    <td className="ac-cell-date">{fmtDate(c.last_order_at)}</td>
                    <td className="ac-cell-date">{fmtDate(c.registered_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.pages > 1 && (
            <div className="ac-pagination">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="ac-page-btn">
                <ChevronLeft size={16} />
              </button>
              <span className="ac-page-info">{page} из {data.pages}</span>
              <button disabled={page >= data.pages} onClick={() => setPage(page + 1)} className="ac-page-btn">
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
