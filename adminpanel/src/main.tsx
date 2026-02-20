import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { setAdminApiBaseUrl } from './api/adminClient';
import { setSellerApiBaseUrl } from './api/sellerClient';

async function initAndRender() {
  // Load runtime config (API URL) — same pattern as miniapp
  try {
    const res = await fetch('/config.json');
    const config = res.ok ? await res.json() : null;
    if (config?.apiUrl && String(config.apiUrl).trim()) {
      const url = String(config.apiUrl).trim().replace(/\/$/, '');
      setAdminApiBaseUrl(url);
      setSellerApiBaseUrl(url);
    }
  } catch {
    // Fallback to VITE_API_URL (set at build time)
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

initAndRender();
