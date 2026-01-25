import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import { ShopsList, ShopDetails } from './pages';
import { useTelegramWebApp } from './hooks/useTelegramWebApp';
import './App.css';

function AppContent() {
  const { webApp } = useTelegramWebApp();

  useEffect(() => {
    // Apply theme colors from Telegram
    const root = document.documentElement;
    const theme = webApp.themeParams;

    if (theme.bg_color) {
      root.style.setProperty('--tg-theme-bg-color', theme.bg_color);
    }
    if (theme.text_color) {
      root.style.setProperty('--tg-theme-text-color', theme.text_color);
    }
    if (theme.hint_color) {
      root.style.setProperty('--tg-theme-hint-color', theme.hint_color);
    }
    if (theme.link_color) {
      root.style.setProperty('--tg-theme-link-color', theme.link_color);
    }
    if (theme.button_color) {
      root.style.setProperty('--tg-theme-button-color', theme.button_color);
    }
    if (theme.button_text_color) {
      root.style.setProperty('--tg-theme-button-text-color', theme.button_text_color);
    }
    if (theme.secondary_bg_color) {
      root.style.setProperty('--tg-theme-secondary-bg-color', theme.secondary_bg_color);
    }
  }, [webApp.themeParams]);

  return (
    <Routes>
      <Route path="/" element={<ShopsList />} />
      <Route path="/shop/:sellerId" element={<ShopDetails />} />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
