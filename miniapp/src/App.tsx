import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ShopsList, ShopDetails } from './pages';
import { LocationSetup, Loader } from './components';
import { useTelegramWebApp } from './hooks/useTelegramWebApp';
import { api } from './api/client';
import { useLocationCache } from './hooks/useLocationCache';
import './App.css';

function AppContent() {
  const { webApp } = useTelegramWebApp();
  const { setFilters } = useLocationCache();
  const [isCheckingLocation, setIsCheckingLocation] = useState(true);
  const [needsLocationSetup, setNeedsLocationSetup] = useState(false);

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

  // Check if user needs to set up location (with timeout so we don't hang forever)
  useEffect(() => {
    const REQUEST_TIMEOUT_MS = 12_000;

    const checkUserLocation = async () => {
      try {
        const userPromise = api.getCurrentUser();
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), REQUEST_TIMEOUT_MS)
        );
        const user = await Promise.race([userPromise, timeoutPromise]);

        // Check if user has city_id set (district optional — "все округи" = no district_id)
        if (!user.city_id) {
          setNeedsLocationSetup(true);
        } else {
          // Update filters with user's saved location (merge with existing)
          // Also update localStorage directly to ensure ShopsList gets the values
          const updatedFilters: { city_id: number; district_id?: number } = {
            city_id: user.city_id,
          };
          if (user.district_id != null) updatedFilters.district_id = user.district_id;
          
          // Update state
          setFilters((prev) => ({
            ...prev,
            ...updatedFilters,
          }));
          
          // Also update localStorage directly to sync with ShopsList
          try {
            const STORAGE_KEY = 'flowshop_location_filters';
            const existing = localStorage.getItem(STORAGE_KEY);
            let cached = existing ? JSON.parse(existing) : {};
            cached = {
              ...cached,
              ...updatedFilters,
              timestamp: Date.now(),
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
          } catch (e) {
            console.error('Failed to update localStorage:', e);
          }
        }
      } catch (error) {
        console.error('Failed to check user location:', error);
        // If we can't check, allow access but show location setup
        setNeedsLocationSetup(true);
      } finally {
        setIsCheckingLocation(false);
      }
    };

    checkUserLocation();
  }, [setFilters]);

  const handleLocationComplete = async (cityId: number, districtId?: number) => {
    try {
      // Save location to user profile (districtId undefined = "все округи")
      await api.updateLocation(cityId, districtId);

      // Update filters (merge with existing)
      const updatedFilters: { city_id: number; district_id?: number } = {
        city_id: cityId,
      };
      if (districtId != null) updatedFilters.district_id = districtId;
      
      setFilters((prev) => ({
        ...prev,
        ...updatedFilters,
      }));
      
      // Also update localStorage directly to sync with ShopsList
      try {
        const STORAGE_KEY = 'flowshop_location_filters';
        const existing = localStorage.getItem(STORAGE_KEY);
        let cached = existing ? JSON.parse(existing) : {};
        cached = {
          ...cached,
          ...updatedFilters,
          timestamp: Date.now(),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
      } catch (e) {
        console.error('Failed to update localStorage:', e);
      }
      
      // Hide location setup
      setNeedsLocationSetup(false);
    } catch (error) {
      console.error('Failed to save location:', error);
      // Still allow to proceed even if save fails
      const updatedFilters: { city_id: number; district_id?: number } = {
        city_id: cityId,
      };
      if (districtId != null) updatedFilters.district_id = districtId;
      
      setFilters((prev) => ({
        ...prev,
        ...updatedFilters,
      }));
      
      // Update localStorage even if API call failed
      try {
        const STORAGE_KEY = 'flowshop_location_filters';
        const existing = localStorage.getItem(STORAGE_KEY);
        let cached = existing ? JSON.parse(existing) : {};
        cached = {
          ...cached,
          ...updatedFilters,
          timestamp: Date.now(),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
      } catch (e) {
        console.error('Failed to update localStorage:', e);
      }
      
      setNeedsLocationSetup(false);
    }
  };

  // Show loading state while checking
  if (isCheckingLocation) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <Loader centered />
      </div>
    );
  }

  // Show location setup if needed
  if (needsLocationSetup) {
    return <LocationSetup onComplete={handleLocationComplete} />;
  }

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
