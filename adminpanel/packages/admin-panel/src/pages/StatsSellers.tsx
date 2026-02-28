import { useEffect, useState, useCallback, useMemo } from 'react';
import { getFinanceSummary, getAllSellers, type AdminFinanceParams } from '../api/adminClient';
import type { AdminFinanceResponse, Seller } from '../types';
import { SellerAnalyticsModal } from '../components/SellerAnalyticsModal';
import { ChevronUp, ChevronDown, Search } from 'lucide-react';
import './Stats.css';

type RangePreset = '7d' | '30d' | '90d' | 'custom';
type SortKey = 'shop_name' | 'orders' | 'revenue' | 'commission' | 'share_pct';
type SortDir = 'asc' | 'desc';

function toYYYYMMDD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtCurrency(n: number): string {
  return `${n.toLocaleString('ru-RU')} ₽`;
}

export function StatsSellers() {
  const [financeData, setFinanceData] = useState<AdminFinanceResponse | null>(null);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [loading, setLoading] = useState(true);

  const [preset, setPreset] = useState<RangePreset>('30d');
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 29);
    return toYYYYMMDD(d);
  });
  const [dateTo, setDateTo] = useState(() => toYYYYMMDD(new Date()));

  const [sortKey, setSortKey] = useState<SortKey>('revenue');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSellerId, setSelectedSellerId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let from = dateFrom;
      let to = dateTo;
      if (preset !== 'custom') {
        const now = new Date();
        to = toYYYYMMDD(now);
        const d = new Date();
        if (preset === '7d') d.setDate(d.getDate() - 6);
        else if (preset === '30d') d.setDate(d.getDate() - 29);
        else d.setDate(d.getDate() - 89);
        from = toYYYYMMDD(d);
      }
      const params: AdminFinanceParams = { date_from: from, date_to: to };
      const [finance, sellersList] = await Promise.all([
        getFinanceSummary(params),
        getAllSellers(),
      ]);
      setFinanceData(finance);
      setSellers(sellersList || []);
    } catch {
      setFinanceData(null);
    } finally {
      setLoading(false);
    }
  }, [preset, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const handlePreset = (p: RangePreset) => {
    setPreset(p);
    if (p !== 'custom') {
      const now = new Date();
      setDateTo(toYYYYMMDD(now));
      const d = new Date();
      if (p === '7d') d.setDate(d.getDate() - 6);
      else if (p === '30d') d.setDate(d.getDate() - 29);
      else d.setDate(d.getDate() - 89);
      setDateFrom(toYYYYMMDD(d));
    }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sortedSellers = useMemo(() => {
    if (!financeData) return [];
    let list = [...financeData.by_seller];

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((s) => s.shop_name.toLowerCase().includes(q));
    }

    list.sort((a, b) => {
      const valA = a[sortKey];
      const valB = b[sortKey];
      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      const nA = Number(valA) || 0;
      const nB = Number(valB) || 0;
      return sortDir === 'asc' ? nA - nB : nB - nA;
    });

    return list;
  }, [financeData, sortKey, sortDir, searchQuery]);

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <span className="ss-sort-icon ss-sort-icon--inactive">⇅</span>;
    return sortDir === 'asc'
      ? <ChevronUp size={14} className="ss-sort-icon" />
      : <ChevronDown size={14} className="ss-sort-icon" />;
  };

  const selectedSeller = selectedSellerId ? sellers.find((s) => s.tg_id === selectedSellerId) : undefined;
  const selectedFinanceRow = selectedSellerId ? financeData?.by_seller.find((s) => s.seller_id === selectedSellerId) : undefined;

  return (
    <div className="stats-page">
      {/* ── Controls ── */}
      <div className="ss-controls">
        <div className="ss-presets">
          {(['7d', '30d', '90d', 'custom'] as RangePreset[]).map((p) => (
            <button
              key={p}
              className={`af-preset-btn ${preset === p ? 'af-preset-btn--active' : ''}`}
              onClick={() => handlePreset(p)}
            >
              {p === '7d' ? '7 дней' : p === '30d' ? '30 дней' : p === '90d' ? '90 дней' : 'Период'}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="ss-custom-range">
            <input type="date" className="af-input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <span className="af-sep">—</span>
            <input type="date" className="af-input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            <button className="af-apply-btn" onClick={load}>Применить</button>
          </div>
        )}
        <div className="ss-search">
          <Search size={14} className="ss-search-icon" />
          <input
            type="text"
            className="ss-search-input"
            placeholder="Поиск по магазину..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="stats-loading"><div className="loader" /></div>
      ) : !financeData ? (
        <div className="ss-empty">Не удалось загрузить данные</div>
      ) : (
        <div className="card ss-table-card">
          <div className="ss-table-header">
            <h3>Продавцы ({sortedSellers.length})</h3>
          </div>
          <div className="ss-table-wrap">
            <table className="ss-table">
              <thead>
                <tr>
                  <th className="ss-th ss-th--clickable" onClick={() => handleSort('shop_name')}>
                    Магазин <SortIcon column="shop_name" />
                  </th>
                  <th className="ss-th">Тариф</th>
                  <th className="ss-th ss-th--clickable ss-th--right" onClick={() => handleSort('orders')}>
                    Заказов <SortIcon column="orders" />
                  </th>
                  <th className="ss-th ss-th--clickable ss-th--right" onClick={() => handleSort('revenue')}>
                    Выручка <SortIcon column="revenue" />
                  </th>
                  <th className="ss-th ss-th--clickable ss-th--right" onClick={() => handleSort('commission')}>
                    Комиссия <SortIcon column="commission" />
                  </th>
                  <th className="ss-th ss-th--clickable ss-th--right" onClick={() => handleSort('share_pct')}>
                    Доля <SortIcon column="share_pct" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedSellers.map((s) => (
                  <tr
                    key={s.seller_id}
                    className="ss-row"
                    onClick={() => setSelectedSellerId(s.seller_id)}
                  >
                    <td className="ss-cell-name">{s.shop_name}</td>
                    <td>
                      <span className={`af-plan-badge af-plan-badge--${s.plan}`}>
                        {s.plan === 'free' ? 'Free' : s.plan === 'pro' ? 'Pro' : 'Premium'}
                      </span>
                    </td>
                    <td className="ss-cell-num">{s.orders}</td>
                    <td className="ss-cell-num">{fmtCurrency(s.revenue)}</td>
                    <td className="ss-cell-num ss-cell-commission">{fmtCurrency(s.commission)}</td>
                    <td className="ss-cell-share">
                      <div className="af-share-bar">
                        <div className="af-share-fill" style={{ width: `${Math.min(s.share_pct, 100)}%` }} />
                      </div>
                      <span>{s.share_pct}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sortedSellers.length === 0 && (
              <p className="ss-empty">Нет данных за выбранный период</p>
            )}
          </div>
        </div>
      )}

      {/* ── Seller Analytics Modal ── */}
      {selectedSellerId && financeData && (
        <SellerAnalyticsModal
          sellerId={selectedSellerId}
          seller={selectedSeller}
          financeRow={selectedFinanceRow}
          platformMetrics={financeData.period}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onClose={() => setSelectedSellerId(null)}
        />
      )}
    </div>
  );
}
