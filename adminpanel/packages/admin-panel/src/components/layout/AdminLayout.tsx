import { Outlet } from 'react-router-dom';
import { AdminSidebar } from './AdminSidebar';

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
