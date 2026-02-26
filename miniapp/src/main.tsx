import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { setApiBaseUrl } from './api/client';
import { setYmapsApiKey } from './api/ymapsConfig';
import { App } from './App';

const API_BASE_FALLBACK = import.meta.env.VITE_API_URL || '';
const YMAPS_KEY_FALLBACK = import.meta.env.VITE_YANDEX_MAPS_KEY || '';

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
    // Yandex Maps API key
    const ymapsKey = config?.ymapsApiKey ? String(config.ymapsApiKey).trim() : '';
    setYmapsApiKey(ymapsKey || YMAPS_KEY_FALLBACK);
    // Preload Yandex Maps SDK in background (non-blocking)
    if (ymapsKey || YMAPS_KEY_FALLBACK) {
      import('./components/map/ymaps').then(({ loadYmaps }) => loadYmaps().catch(() => {}));
    }
  } catch {
    if (API_BASE_FALLBACK) setApiBaseUrl(API_BASE_FALLBACK.replace(/\/$/, ''));
    if (YMAPS_KEY_FALLBACK) setYmapsApiKey(YMAPS_KEY_FALLBACK);
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

initAndRender();
