import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import './Layout.css';

export function Layout() {
  return (
    <div className="layout-v2">
      <Sidebar />
      <main className="layout-v2-main">
        <Outlet />
      </main>
    </div>
  );
}
