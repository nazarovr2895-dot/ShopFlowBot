import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { setApiBaseUrl } from './api/client';
import { App } from './App';

// Рендер сразу — не ждём config.json (загрузка в фоне)
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// config.json подгружаем в фоне; если есть apiUrl — обновим базовый URL для API
fetch('/config.json')
  .then((res) => (res.ok ? res.json() : null))
  .then((config: { apiUrl?: string } | null) => {
    if (config?.apiUrl) {
      setApiBaseUrl(config.apiUrl.replace(/\/$/, ''));
    }
  })
  .catch(() => {});
