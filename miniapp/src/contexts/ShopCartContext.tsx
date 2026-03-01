import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import type { CartItemEntry } from '../types';
import { api } from '../api/client';
import { isBrowser } from '../utils/environment';
import {
  getGuestCart,
  addToGuestCart,
  updateGuestCartItem,
  removeGuestCartItem,
} from '../utils/guestCart';
import { computeRemaining } from '../hooks/useReservationTimer';

/* ─── Types ────────────────────────────────────── */

export interface AddToCartParams {
  product: { id: number; name: string; price: number; photo_id?: string | null };
  quantity?: number;
  preorderDeliveryDate?: string | null;
  sellerName?: string;
  sellerDeliveryType?: 'delivery' | 'pickup' | 'both' | null;
  sellerCityId?: number | null;
  sellerGiftNoteEnabled?: boolean;
}

interface ShopCartContextValue {
  sellerId: number;
  items: CartItemEntry[];
  cartQuantities: Map<number, number>;
  total: number;
  itemCount: number;
  deliveryPrice: number | null;
  deliveryType: 'delivery' | 'pickup' | 'both' | null;
  isLoading: boolean;

  // Panel state
  isPanelOpen: boolean;
  setPanelOpen: (open: boolean) => void;

  // Operations — return void (errors are thrown for callers to catch/handle)
  addItem: (params: AddToCartParams) => Promise<{ reserved_at?: string | null }>;
  updateQuantity: (productId: number, newQty: number) => Promise<void>;
  removeItem: (productId: number) => Promise<void>;
  refreshCart: () => Promise<void>;
  extendReservation: (productId: number) => Promise<void>;
}

const ShopCartContext = createContext<ShopCartContextValue | null>(null);

/* ─── Hook ─────────────────────────────────────── */

export function useShopCart(): ShopCartContextValue {
  const ctx = useContext(ShopCartContext);
  if (!ctx) throw new Error('useShopCart must be used within ShopCartProvider');
  return ctx;
}

/* ─── Provider ─────────────────────────────────── */

export function ShopCartProvider({ children }: { children: ReactNode }) {
  const { sellerId: sellerIdParam } = useParams<{ sellerId: string }>();
  const sellerId = Number(sellerIdParam);

  const [items, setItems] = useState<CartItemEntry[]>([]);
  const [cartQuantities, setCartQuantities] = useState<Map<number, number>>(new Map());
  const [deliveryPrice, setDeliveryPrice] = useState<number | null>(0);
  const [deliveryType, setDeliveryType] = useState<'delivery' | 'pickup' | 'both' | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPanelOpen, setPanelOpen] = useState(false);

  const isGuest = isBrowser() && !api.isAuthenticated();
  const isGuestRef = useRef(isGuest);
  isGuestRef.current = isGuest;

  /* ─── Load cart for this seller ────────────── */
  const loadCart = useCallback(async () => {
    if (!sellerId || isNaN(sellerId)) return;
    try {
      if (isGuestRef.current) {
        const guestItems = getGuestCart().filter((i) => i.seller_id === sellerId);
        const mapped: CartItemEntry[] = guestItems.map((i) => ({
          product_id: i.product_id,
          name: i.name,
          price: i.price,
          quantity: i.quantity,
          photo_id: i.photo_id ?? null,
        }));
        setItems(mapped);
        setDeliveryPrice(0);
        setDeliveryType(guestItems[0]?.delivery_type ?? null);
        const qtyMap = new Map<number, number>();
        for (const i of guestItems) qtyMap.set(i.product_id, i.quantity);
        setCartQuantities(qtyMap);
      } else {
        const groups = await api.getCart();
        const group = groups.find((g) => g.seller_id === sellerId);
        if (group) {
          setItems(group.items);
          setDeliveryPrice(group.delivery_price ?? null);
          setDeliveryType(group.delivery_type ?? null);
          const qtyMap = new Map<number, number>();
          for (const item of group.items) qtyMap.set(item.product_id, item.quantity);
          setCartQuantities(qtyMap);
        } else {
          setItems([]);
          setDeliveryPrice(0);
          setDeliveryType(null);
          setCartQuantities(new Map());
        }
      }
    } catch {
      // Ignore cart loading errors — show empty cart
    } finally {
      setIsLoading(false);
    }
  }, [sellerId]);

  useEffect(() => {
    setIsLoading(true);
    loadCart();
  }, [loadCart]);

  /* ─── Auto-refresh on expired reservations ──── */
  useEffect(() => {
    if (isGuestRef.current) return;
    const interval = setInterval(() => {
      const hasExpired = items.some(
        (item) => item.reserved_at && !item.is_preorder && computeRemaining(item.reserved_at) <= 0
      );
      if (hasExpired) loadCart();
    }, 5000);
    return () => clearInterval(interval);
  }, [items, loadCart]);

  /* ─── Add item ─────────────────────────────── */
  const addItem = useCallback(async (params: AddToCartParams): Promise<{ reserved_at?: string | null }> => {
    const { product, quantity = 1, preorderDeliveryDate, sellerName, sellerDeliveryType, sellerCityId, sellerGiftNoteEnabled } = params;

    if (isGuestRef.current) {
      addToGuestCart({
        product_id: product.id,
        seller_id: sellerId,
        name: product.name,
        price: product.price,
        quantity,
        photo_id: product.photo_id ?? null,
        seller_name: sellerName,
        delivery_type: sellerDeliveryType ?? null,
        city_id: sellerCityId ?? null,
        gift_note_enabled: sellerGiftNoteEnabled ?? false,
      });
      // Optimistic local update
      if (!preorderDeliveryDate) {
        setCartQuantities((prev) => {
          const next = new Map(prev);
          next.set(product.id, (prev.get(product.id) || 0) + quantity);
          return next;
        });
        // Reload full items list from localStorage
        const guestItems = getGuestCart().filter((i) => i.seller_id === sellerId);
        setItems(guestItems.map((i) => ({
          product_id: i.product_id,
          name: i.name,
          price: i.price,
          quantity: i.quantity,
          photo_id: i.photo_id ?? null,
        })));
      }
      return {};
    }

    const result = await api.addCartItem(product.id, quantity, preorderDeliveryDate);
    // Optimistic local update for non-preorder items
    if (!preorderDeliveryDate) {
      setCartQuantities((prev) => {
        const next = new Map(prev);
        next.set(product.id, result.quantity ?? (prev.get(product.id) || 0) + quantity);
        return next;
      });
      // Reload full items to pick up reserved_at etc
      await loadCart();
    }
    return { reserved_at: result.reserved_at };
  }, [sellerId, loadCart]);

  /* ─── Update quantity ──────────────────────── */
  const updateQuantity = useCallback(async (productId: number, newQty: number) => {
    // Optimistic update
    setCartQuantities((prev) => {
      const next = new Map(prev);
      if (newQty <= 0) next.delete(productId);
      else next.set(productId, newQty);
      return next;
    });

    if (newQty <= 0) {
      setItems((prev) => prev.filter((i) => i.product_id !== productId));
    } else {
      setItems((prev) => prev.map((i) =>
        i.product_id === productId ? { ...i, quantity: newQty } : i
      ));
    }

    try {
      if (isGuestRef.current) {
        if (newQty <= 0) {
          removeGuestCartItem(productId, sellerId);
        } else {
          updateGuestCartItem(productId, sellerId, newQty);
        }
      } else {
        if (newQty <= 0) {
          await api.removeCartItem(productId);
        } else {
          await api.updateCartItem(productId, newQty);
        }
      }
    } catch {
      // Rollback on error
      await loadCart();
    }
  }, [sellerId, loadCart]);

  /* ─── Remove item ──────────────────────────── */
  const removeItemFn = useCallback(async (productId: number) => {
    // Optimistic update
    setItems((prev) => prev.filter((i) => i.product_id !== productId));
    setCartQuantities((prev) => {
      const next = new Map(prev);
      next.delete(productId);
      return next;
    });

    try {
      if (isGuestRef.current) {
        removeGuestCartItem(productId, sellerId);
      } else {
        await api.removeCartItem(productId);
      }
    } catch {
      await loadCart();
    }
  }, [sellerId, loadCart]);

  /* ─── Extend reservation ───────────────────── */
  const extendReservation = useCallback(async (productId: number) => {
    const result = await api.extendReservation(productId);
    setItems((prev) =>
      prev.map((item) =>
        item.product_id === productId
          ? { ...item, reserved_at: result.reserved_at }
          : item
      )
    );
  }, []);

  /* ─── Computed ─────────────────────────────── */
  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  // Auto-close panel when cart becomes empty
  useEffect(() => {
    if (items.length === 0 && isPanelOpen) {
      setPanelOpen(false);
    }
  }, [items.length, isPanelOpen]);

  const value: ShopCartContextValue = {
    sellerId,
    items,
    cartQuantities,
    total,
    itemCount,
    deliveryPrice,
    deliveryType,
    isLoading,
    isPanelOpen,
    setPanelOpen,
    addItem,
    updateQuantity,
    removeItem: removeItemFn,
    refreshCart: loadCart,
    extendReservation,
  };

  return (
    <ShopCartContext.Provider value={value}>
      {children}
    </ShopCartContext.Provider>
  );
}
