import type { CartSellerGroup, CartItemEntry } from '../types';

export interface GuestCartItem {
  product_id: number;
  seller_id: number;
  name: string;
  price: number;
  quantity: number;
  photo_id?: string | null;
  seller_name?: string;
}

const GUEST_CART_KEY = 'flowshop_guest_cart';

export function getGuestCart(): GuestCartItem[] {
  try {
    const raw = localStorage.getItem(GUEST_CART_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveGuestCart(items: GuestCartItem[]): void {
  localStorage.setItem(GUEST_CART_KEY, JSON.stringify(items));
}

export function clearGuestCart(): void {
  localStorage.removeItem(GUEST_CART_KEY);
}

export function addToGuestCart(item: GuestCartItem): void {
  const cart = getGuestCart();
  const existing = cart.find(
    (i) => i.product_id === item.product_id && i.seller_id === item.seller_id
  );
  if (existing) {
    existing.quantity += item.quantity;
  } else {
    cart.push({ ...item });
  }
  saveGuestCart(cart);
}

export function updateGuestCartItem(productId: number, sellerId: number, quantity: number): void {
  let cart = getGuestCart();
  if (quantity <= 0) {
    cart = cart.filter((i) => !(i.product_id === productId && i.seller_id === sellerId));
  } else {
    cart = cart.map((i) =>
      i.product_id === productId && i.seller_id === sellerId ? { ...i, quantity } : i
    );
  }
  saveGuestCart(cart);
}

export function removeGuestCartItem(productId: number, sellerId: number): void {
  updateGuestCartItem(productId, sellerId, 0);
}

export function getGuestCartCount(): number {
  return getGuestCart().reduce((sum, i) => sum + i.quantity, 0);
}

/** Convert flat guest cart to CartSellerGroup[] for display in Cart page. */
export function guestCartToGroups(items: GuestCartItem[]): CartSellerGroup[] {
  const bySellerMap: Record<number, GuestCartItem[]> = {};
  for (const item of items) {
    if (!bySellerMap[item.seller_id]) bySellerMap[item.seller_id] = [];
    bySellerMap[item.seller_id].push(item);
  }
  return Object.entries(bySellerMap).map(([sellerId, sellerItems]) => ({
    seller_id: Number(sellerId),
    shop_name: sellerItems[0].seller_name || 'Магазин',
    items: sellerItems.map((i): CartItemEntry => ({
      product_id: i.product_id,
      name: i.name,
      price: i.price,
      quantity: i.quantity,
      photo_id: i.photo_id ?? null,
    })),
    total: sellerItems.reduce((s, i) => s + i.price * i.quantity, 0),
    delivery_price: 0,
    address_name: null,
    map_url: null,
  }));
}
