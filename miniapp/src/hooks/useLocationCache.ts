import { useState, useEffect, useCallback } from 'react';
import type { SellerFilters } from '../types';
import { api } from '../api/client';

const STORAGE_KEY = 'flowshop_location_filters';

interface CachedLocation {
  city_id?: number;
  district_id?: number;
  metro_id?: number;
  delivery_type?: 'delivery' | 'pickup' | 'both';
  sort_price?: 'asc' | 'desc';
  sort_mode?: 'all_city' | 'nearby';
  free_delivery?: boolean;
  search?: string;
  timestamp: number;
}

// Cache expiration time (30 days in milliseconds)
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000;

/**
 * Load cached filters from localStorage
 */
function loadFromStorage(): SellerFilters {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return {};

    const cached: CachedLocation = JSON.parse(stored);
    
    // Check if cache is expired
    if (Date.now() - cached.timestamp > CACHE_TTL) {
      localStorage.removeItem(STORAGE_KEY);
      return {};
    }

    // Return only the filter fields, not the timestamp
    const { timestamp, ...filters } = cached;
    return filters;
  } catch (error) {
    console.error('Error loading location cache:', error);
    return {};
  }
}

/**
 * Save filters to localStorage
 */
function saveToStorage(filters: SellerFilters): void {
  try {
    const cached: CachedLocation = {
      ...filters,
      timestamp: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
  } catch (error) {
    console.error('Error saving location cache:', error);
  }
}

/**
 * Clear the location cache from localStorage
 */
export function clearLocationCache(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Error clearing location cache:', error);
  }
}

/**
 * Hook to manage location filters with localStorage persistence
 */
export function useLocationCache() {
  const [filters, setFiltersState] = useState<SellerFilters>(() => loadFromStorage());
  const [isInitialized, setIsInitialized] = useState(false);

  // Check user profile for location on mount and sync with localStorage
  useEffect(() => {
    const syncUserLocation = async () => {
      try {
        const user = await api.getCurrentUser();
        
        // If user has location set, use it (has priority over localStorage)
        if (user?.city_id && user?.district_id) {
          const userFilters = {
            city_id: user.city_id,
            district_id: user.district_id,
          };
          
          // Update state with user's location
          setFiltersState((prev) => ({
            ...prev,
            ...userFilters,
          }));
          
          // Update localStorage to keep in sync
          try {
            const existing = localStorage.getItem(STORAGE_KEY);
            let cached = existing ? JSON.parse(existing) : {};
            cached = {
              ...cached,
              ...userFilters,
              timestamp: Date.now(),
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
          } catch (e) {
            console.error('Failed to sync user location to localStorage:', e);
          }
        }
      } catch (error) {
        // Silently fail - use localStorage data if available
        console.error('Failed to sync user location:', error);
      } finally {
        setIsInitialized(true);
      }
    };

    syncUserLocation();
  }, []);

  // Save to localStorage whenever filters change (after initialization)
  useEffect(() => {
    if (isInitialized) {
      saveToStorage(filters);
    }
  }, [filters, isInitialized]);

  const setFilters = useCallback((newFilters: SellerFilters | ((prev: SellerFilters) => SellerFilters)) => {
    setFiltersState((prev) => {
      if (typeof newFilters === 'function') {
        return newFilters(prev);
      }
      // Merge with existing filters instead of replacing
      return { ...prev, ...newFilters };
    });
  }, []);

  const resetFilters = useCallback(() => {
    setFiltersState({});
    clearLocationCache();
  }, []);

  return {
    filters,
    setFilters,
    resetFilters,
    isInitialized,
  };
}
