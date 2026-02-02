import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './Layout.css';

const nav = [
  { to: '/', label: 'Дашборд', icon: '📊' },
  { to: '/sellers', label: 'Продавцы', icon: '🏪' },
  { to: '/agents', label: 'Посредники', icon: '👥' },
  { to: '/stats', label: 'Статистика', icon: '📈' },
];

export function Layout() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <h1>Shop<span>Flow</span></h1>
        </div>
        <nav className="sidebar-nav">
          {nav.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            >
              <span className="nav-icon">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button onClick={handleLogout} className="sidebar-link logout-btn">
            <span className="nav-icon">🚪</span>
            Выход
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
