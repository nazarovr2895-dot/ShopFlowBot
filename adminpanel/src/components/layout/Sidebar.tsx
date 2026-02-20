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
];

/* ── Component ───────────────────────────────────────────── */

export function Sidebar() {
  const { role, logout } = useAuth();
  const navigate = useNavigate();
  const nav = role === 'seller' ? sellerNav : adminNav;

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
        <button className="sidebar-v2-link sidebar-v2-logout" onClick={handleLogout}>
          <LogOut size={18} className="sidebar-v2-icon" />
          <span className="sidebar-v2-link-text">Выход</span>
        </button>
      </div>
    </aside>
  );
}
