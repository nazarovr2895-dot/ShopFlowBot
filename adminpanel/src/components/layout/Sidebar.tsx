import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { isTelegram, getTelegramWebApp } from '../../utils/environment';
import {
  LayoutDashboard,
  ShoppingBag,
  Store,
  Warehouse,
  Users,
  BarChart3,
  Settings,
  LogOut,
  UserCircle,
  DollarSign,
  MapPin,
  GitBranch,
  ChevronDown,
  Check,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import './Sidebar.css';

/* ── Nav config ──────────────────────────────────────────── */

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  dividerBefore?: boolean;
}

const sellerNav: NavItem[] = [
  { to: '/', label: 'Дашборд', icon: LayoutDashboard },
  { to: '/orders', label: 'Заказы', icon: ShoppingBag },
  { to: '/catalog', label: 'Каталог', icon: Store },
  { to: '/stock', label: 'Склад', icon: Warehouse },
  { to: '/customers', label: 'Клиенты', icon: Users },
  { to: '/analytics', label: 'Аналитика', icon: BarChart3 },
  { to: '/settings', label: 'Настройки', icon: Settings, dividerBefore: true },
];

const adminNav: NavItem[] = [
  { to: '/', label: 'Дашборд', icon: LayoutDashboard },
  { to: '/orders', label: 'Заказы', icon: ShoppingBag },
  { to: '/sellers', label: 'Продавцы', icon: UserCircle },
  { to: '/customers', label: 'Покупатели', icon: Users },
  { to: '/finance', label: 'Финансы', icon: DollarSign },
  { to: '/analytics', label: 'Аналитика', icon: BarChart3 },
  { to: '/coverage', label: 'Покрытие', icon: MapPin },
];

/* ── Branch Switcher ─────────────────────────────────────── */

function BranchSwitcher() {
  const { sellerId, branches, switchBranch } = useAuth();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  const currentBranch = branches.find(b => b.seller_id === sellerId);
  const label = currentBranch?.shop_name || 'Филиал';

  const handleSwitch = async (targetId: number) => {
    if (targetId === sellerId || switching) return;
    setSwitching(true);
    try {
      await switchBranch(targetId);
    } catch {
      setSwitching(false);
    }
    setOpen(false);
  };

  return (
    <div className="branch-switcher" style={{ position: 'relative' }}>
      <button
        className="sidebar-v2-link branch-switcher-btn"
        onClick={() => setOpen(!open)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
      >
        <GitBranch size={18} className="sidebar-v2-icon" />
        <span className="sidebar-v2-link-text" style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {switching ? 'Переключение...' : label}
        </span>
        <ChevronDown size={14} style={{ opacity: 0.5, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>
      {open && (
        <div
          className="branch-switcher-dropdown"
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            right: 0,
            background: 'var(--card-bg, #fff)',
            border: '1px solid var(--border, #e5e7eb)',
            borderRadius: '8px',
            boxShadow: '0 -4px 12px rgba(0,0,0,0.1)',
            marginBottom: '4px',
            zIndex: 100,
            maxHeight: '200px',
            overflowY: 'auto',
          }}
        >
          {branches.map((b) => (
            <button
              key={b.seller_id}
              onClick={() => handleSwitch(b.seller_id)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 0.75rem',
                border: 'none',
                background: b.seller_id === sellerId ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                cursor: b.seller_id === sellerId ? 'default' : 'pointer',
                textAlign: 'left',
                fontSize: '0.8rem',
              }}
            >
              {b.seller_id === sellerId ? (
                <Check size={14} style={{ color: 'var(--primary, #6366f1)', flexShrink: 0 }} />
              ) : (
                <div style={{ width: 14, flexShrink: 0 }} />
              )}
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {b.shop_name || `Филиал #${b.seller_id}`}
                </div>
                {b.address_name && (
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {b.address_name}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Component ───────────────────────────────────────────── */

export function Sidebar() {
  const { role, isNetwork, logout } = useAuth();
  const navigate = useNavigate();
  const baseNav = role === 'seller' ? sellerNav : adminNav;
  // Add "Филиалы" link for all sellers (so they can add branches)
  const nav = role === 'seller'
    ? [
        ...baseNav.filter(i => i.to !== '/settings'),
        { to: '/branches', label: 'Филиалы', icon: GitBranch, dividerBefore: true },
        { to: '/settings', label: 'Настройки', icon: Settings },
      ]
    : baseNav;

  const handleLogout = () => {
    logout();
    if (isTelegram()) {
      getTelegramWebApp()?.close();
    } else {
      navigate('/login');
    }
  };

  return (
    <aside className="sidebar-v2">
      {/* Brand */}
      <div className="sidebar-v2-brand">
        <img src="/android-chrome-192x192.png" alt="flurai" className="sidebar-v2-logo-img" width={28} height={28} />
        <span className="sidebar-v2-brand-text">flurai</span>
      </div>

      {/* Navigation */}
      <nav className="sidebar-v2-nav">
        {nav.map((item) => (
          <div key={item.to}>
            {item.dividerBefore && <div className="sidebar-v2-divider" />}
            <NavLink
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `sidebar-v2-link ${isActive ? 'sidebar-v2-link--active' : ''}`
              }
            >
              <item.icon size={18} className="sidebar-v2-icon" />
              <span className="sidebar-v2-link-text">{item.label}</span>
            </NavLink>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="sidebar-v2-footer">
        <div className="sidebar-v2-divider" />
        {role === 'seller' && isNetwork && <BranchSwitcher />}
        <button className="sidebar-v2-link sidebar-v2-logout" onClick={handleLogout}>
          <LogOut size={18} className="sidebar-v2-icon" />
          <span className="sidebar-v2-link-text">Выход</span>
        </button>
      </div>
    </aside>
  );
}
