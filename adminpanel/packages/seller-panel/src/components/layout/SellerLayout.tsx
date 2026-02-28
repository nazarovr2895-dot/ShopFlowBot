import { Outlet } from 'react-router-dom';
import { SellerSidebar } from './SellerSidebar';
import './Layout.css';

export function SellerLayout() {
  return (
    <div className="layout-v2">
      <SellerSidebar />
      <main className="layout-v2-main">
        <Outlet />
      </main>
    </div>
  );
}
