import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { setApiBaseUrl } from './api/client';
import { App } from './App';

const API_BASE_FALLBACK = import.meta.env.VITE_API_URL || '';

async function initAndRender() {
  // Сначала подгружаем config.json, чтобы URL фото (и API) был известен до первого рендера
  try {
    const res = await fetch('/config.json');
    const config = res.ok ? await res.json() : null;
    if (config?.apiUrl && String(config.apiUrl).trim()) {
      setApiBaseUrl(String(config.apiUrl).trim().replace(/\/$/, ''));
    } else if (API_BASE_FALLBACK) {
      setApiBaseUrl(API_BASE_FALLBACK.replace(/\/$/, ''));
    }
  } catch {
    if (API_BASE_FALLBACK) setApiBaseUrl(API_BASE_FALLBACK.replace(/\/$/, ''));
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

initAndRender();
