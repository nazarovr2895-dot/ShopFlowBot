import { useEffect, useState } from 'react';
import { BarChart3, GitBranch, Users, MapPin, AlertCircle } from 'lucide-react';
import { getMe, getStats, getSubscriberCount, getBranchesStats } from '../../api/sellerClient';
import type { SellerMe, SellerStats, BranchStats } from '../../api/sellerClient';
import { PageHeader, StatCard, ActionCard, Card } from '../../components/ui';
import { MiniSparkline } from '../../components/MiniSparkline';
import '../Dashboard.css';

const CURRENCY = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
function fmtCurrency(v: number) { return `${CURRENCY.format(v)} ₽`; }

function TrendBadge({ current, previous }: { current: number; previous: number | undefined }) {
  if (previous == null || previous === 0) return null;
  const diff = ((current - previous) / previous) * 100;
  const abs = Math.abs(Math.round(diff));
  if (abs === 0) return null;
  const variant = diff > 0 ? 'up' : 'down';
  const arrow = diff > 0 ? '↑' : '↓';
  return <span className={`trend-badge trend-badge--${variant}`}>{arrow} {abs}%</span>;
}

export function NetworkDashboard() {
  const [me, setMe] = useState<SellerMe | null>(null);
  const [weekStats, setWeekStats] = useState<SellerStats | null>(null);
  const [allTimeStats, setAllTimeStats] = useState<SellerStats | null>(null);
  const [branchStats, setBranchStats] = useState<BranchStats[]>([]);
  const [subscriberCount, setSubscriberCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [meData, weekData, allData, branchData, subCount] = await Promise.all([
          getMe(),
          getStats({ period: '7d', branch: 'all' }),
          getStats({ branch: 'all' }),
          getBranchesStats('7d').catch(() => ({ branches: [], period: '7d' })),
          getSubscriberCount('all').catch(() => ({ count: 0 })),
        ]);
        setMe(meData);
        setWeekStats(weekData);
        setAllTimeStats(allData);
        setBranchStats(branchData.branches.filter(b => !b.is_primary));
        setSubscriberCount(subCount.count);
      } catch {
        // ignore
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

  const commissionRate = weekStats?.commission_rate ?? 3;
  const weekRevenue = weekStats?.total_revenue ?? 0;
  const weekNetRevenue = weekStats?.net_revenue ?? 0;
  const sparklineData = weekStats?.daily_sales?.map((d) => ({ date: d.date, revenue: d.revenue })) ?? [];
  const totalActive = branchStats.reduce((s, b) => s + b.active_orders, 0);
  const totalPending = branchStats.reduce((s, b) => s + b.pending_requests, 0);

  return (
    <div className="dashboard">
      <PageHeader
        title="Панель управления сетью"
        subtitle={me?.shop_name || 'Моя сеть'}
      />

      {/* ── Hero Row ──────────────────────────── */}
      <div className="dashboard-hero-row">
        <div className="dashboard-hero-card dashboard-hero-card--accent">
          <div className="dashboard-hero-content">
            <span className="dashboard-hero-label">Выручка за 7 дней (все филиалы)</span>
            <span className="dashboard-hero-value">{fmtCurrency(weekRevenue)}</span>
            <TrendBadge current={weekRevenue} previous={weekStats?.previous_period_revenue} />
          </div>
          {sparklineData.length >= 2 && (
            <MiniSparkline data={sparklineData} width={160} height={48} />
          )}
        </div>
        <div className="dashboard-hero-card">
          <div className="dashboard-hero-content">
            <span className="dashboard-hero-label">К получению (−{commissionRate}%)</span>
            <span className="dashboard-hero-value">{fmtCurrency(weekNetRevenue)}</span>
          </div>
          <div className="dashboard-hero-secondary">
            <span className="dashboard-hero-orders">
              {weekStats?.total_completed_orders ?? 0} {pluralOrders(weekStats?.total_completed_orders ?? 0)}
            </span>
            <TrendBadge current={weekStats?.total_completed_orders ?? 0} previous={weekStats?.previous_period_orders} />
          </div>
        </div>
      </div>

      {/* ── Branch Cards ─────────────────────── */}
      {branchStats.length > 0 && (
        <Card>
          <h3 style={{ margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', fontWeight: 600 }}>
            <GitBranch size={18} /> Филиалы за 7 дней
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
            {branchStats.map((b) => (
              <div
                key={b.seller_id}
                style={{
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: b.is_blocked ? 'rgba(239,68,68,0.08)' : 'var(--bg-surface)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)' }}>{b.shop_name || `Филиал #${b.seller_id}`}</span>
                  {b.is_blocked && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <AlertCircle size={12} /> Заблокирован
                    </span>
                  )}
                </div>
                {b.address_name && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <MapPin size={12} /> {b.address_name}
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem 1rem', fontSize: '0.8rem', color: 'var(--text)' }}>
                  <div>
                    <span style={{ color: 'var(--text-secondary)' }}>Выручка:</span>{' '}
                    <strong>{fmtCurrency(b.revenue)}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)' }}>Заказов:</span>{' '}
                    <strong>{b.orders}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)' }}>Активных:</span>{' '}
                    <strong>{b.active_orders}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)' }}>Запросов:</span>{' '}
                    <strong>{b.pending_requests}</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Stats Grid ─────────────────────────── */}
      <div className="dashboard-stats-grid">
        <StatCard label="Всего филиалов" value={branchStats.length} link={{ to: '/branches', label: 'Перейти' }} />
        <StatCard label="Активные заказы" value={totalActive} />
        <StatCard label="Запросы на покупку" value={totalPending} />
        <StatCard label="Выполнено (всё время)" value={allTimeStats?.total_completed_orders ?? 0} />
        <StatCard label="Выручка (всё время)" value={fmtCurrency(allTimeStats?.total_revenue ?? 0)} />
        <StatCard label="Подписчики" value={subscriberCount} link={{ to: '/customers?tab=subscribers', label: 'Перейти' }} />
      </div>

      {/* ── Navigation Cards ───────────────────── */}
      <div className="dashboard-nav-grid">
        <ActionCard to="/analytics" icon={<BarChart3 size={20} />} title="Аналитика" description="Детальная статистика по филиалам" />
        <ActionCard to="/branches" icon={<GitBranch size={20} />} title="Филиалы" description="Управление филиалами сети" />
        <ActionCard to="/customers" icon={<Users size={20} />} title="Клиенты" description="Подписчики и лояльность" />
      </div>
    </div>
  );
}

function pluralOrders(n: number): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return 'заказов';
  if (last > 1 && last < 5) return 'заказа';
  if (last === 1) return 'заказ';
  return 'заказов';
}
