import { Outlet } from 'react-router-dom';
import { AdminSidebar } from './AdminSidebar';
import './Layout.css';

export function AdminLayout() {
  return (
    <div className="layout-v2">
      <AdminSidebar />
      <main className="layout-v2-main">
        <Outlet />
      </main>
    </div>
  );
}
