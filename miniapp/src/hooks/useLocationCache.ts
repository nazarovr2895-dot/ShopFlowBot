import { useState, useEffect, useCallback } from 'react';
import type { SellerFilters } from '../types';

const STORAGE_KEY = 'flowshop_location_filters';

interface CachedLocation {
  city_id?: number;
  district_id?: number;
  metro_id?: number;
  delivery_type?: 'delivery' | 'pickup' | 'both';
  sort_price?: 'asc' | 'desc';
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

  // Mark as initialized after first render (to handle SSR scenarios)
  useEffect(() => {
    setIsInitialized(true);
  }, []);

  // Save to localStorage whenever filters change (after initialization)
  useEffect(() => {
    if (isInitialized) {
      saveToStorage(filters);
    }
  }, [filters, isInitialized]);

  const setFilters = useCallback((newFilters: SellerFilters) => {
    setFiltersState(newFilters);
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
