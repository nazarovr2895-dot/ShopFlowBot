import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { setSellerApiBaseUrl } from './api/sellerClient';
import { setYmapsApiKey } from '@shared/lib/ymaps';

async function initAndRender() {
  try {
    const res = await fetch(`/config.json?_=${Date.now()}`);
    const config = res.ok ? await res.json() : null;
    if (config?.apiUrl && String(config.apiUrl).trim()) {
      const url = String(config.apiUrl).trim().replace(/\/$/, '');
      setSellerApiBaseUrl(url);
    }
    if (config?.ymapsApiKey && String(config.ymapsApiKey).trim()) {
      setYmapsApiKey(String(config.ymapsApiKey).trim());
    }
  } catch {
    // Fallback to VITE_API_URL
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

initAndRender();
