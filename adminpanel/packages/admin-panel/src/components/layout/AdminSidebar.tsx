import { NavLink, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../contexts/AdminAuthContext';
import { isTelegram, getTelegramWebApp } from '@shared/utils/environment';
import {
  LayoutDashboard, ShoppingBag, UserCircle, Users,
  DollarSign, BarChart3, MapPin, LogOut,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import './Sidebar.css';

interface NavItem { to: string; label: string; icon: LucideIcon; }

const adminNav: NavItem[] = [
  { to: '/', label: 'Дашборд', icon: LayoutDashboard },
  { to: '/orders', label: 'Заказы', icon: ShoppingBag },
  { to: '/sellers', label: 'Продавцы', icon: UserCircle },
  { to: '/customers', label: 'Покупатели', icon: Users },
  { to: '/finance', label: 'Финансы', icon: DollarSign },
  { to: '/analytics', label: 'Аналитика', icon: BarChart3 },
  { to: '/coverage', label: 'Покрытие', icon: MapPin },
];

export function AdminSidebar() {
  const { logout } = useAdminAuth();
  const navigate = useNavigate();

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
      <div className="sidebar-v2-brand">
        <img src="/android-chrome-192x192.png" alt="flurai" className="sidebar-v2-logo-img" width={28} height={28} />
        <span className="sidebar-v2-brand-text">flurai</span>
      </div>

      <nav className="sidebar-v2-nav">
        {adminNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => `sidebar-v2-link ${isActive ? 'sidebar-v2-link--active' : ''}`}
          >
            <item.icon size={18} className="sidebar-v2-icon" />
            <span className="sidebar-v2-link-text">{item.label}</span>
          </NavLink>
        ))}
      </nav>

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
