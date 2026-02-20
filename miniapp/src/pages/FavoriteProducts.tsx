import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FavoriteProduct, Product } from '../types';
import { api } from '../api/client';
import { Loader, EmptyState, ProductImage, HeartIcon, ProductModal } from '../components';
import { useTelegramWebApp } from '../hooks/useTelegramWebApp';
import { isBrowser } from '../utils/environment';
import './FavoriteProducts.css';

/** Convert FavoriteProduct → Product for the modal */
function toProduct(fp: FavoriteProduct): Product {
  return {
    id: fp.product_id,
    name: fp.name,
    description: fp.description,
    price: fp.price,
    photo_id: fp.photo_id,
    photo_ids: fp.photo_ids,
    quantity: fp.quantity,
    is_preorder: fp.is_preorder,
    composition: fp.composition,
  };
}

interface SellerInfo {
  delivery_price: number;
  delivery_type: 'delivery' | 'pickup' | 'both' | null;
}

interface LoyaltyInfo {
  points_balance: number;
  points_percent: number;
  linked: boolean;
  max_points_discount_percent: number;
  points_to_ruble_rate: number;
}

export function FavoriteProducts() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<FavoriteProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [addingId, setAddingId] = useState<number | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<FavoriteProduct | null>(null);
  const [sellerInfo, setSellerInfo] = useState<SellerInfo | null>(null);
  const [loyalty, setLoyalty] = useState<LoyaltyInfo | null>(null);
  const [cartQuantities, setCartQuantities] = useState<Map<number, number>>(new Map());
  const { hapticFeedback } = useTelegramWebApp();

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getFavoriteProducts();
        setProducts(data);
      } catch (e) {
        console.error(e);
        setProducts([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Load cart quantities to show inline counters on cards
  useEffect(() => {
    if (!api.isAuthenticated()) return;
    let cancelled = false;
    const loadCart = async () => {
      try {
        const qtyMap = new Map<number, number>();
        const groups = await api.getCart();
        for (const group of groups) {
          for (const item of group.items) {
            qtyMap.set(item.product_id, item.quantity);
          }
        }
        if (!cancelled) setCartQuantities(qtyMap);
      } catch {
        // Ignore cart loading errors
      }
    };
    loadCart();
    return () => { cancelled = true; };
  }, []);

  // Load seller details + loyalty when a product is selected
  useEffect(() => {
    if (!selectedProduct) {
      setSellerInfo(null);
      setLoyalty(null);
      return;
    }

    let cancelled = false;
    const sellerId = selectedProduct.seller_id;

    // Load seller delivery info
    api.getSellerDetail(sellerId)
      .then((data) => {
        if (!cancelled) {
          setSellerInfo({
            delivery_price: data.delivery_price,
            delivery_type: data.delivery_type,
          });
        }
      })
      .catch(() => { if (!cancelled) setSellerInfo(null); });

    // Load loyalty if authenticated
    if (api.isAuthenticated()) {
      api.getMyLoyaltyAtSeller(sellerId)
        .then((data) => {
          if (!cancelled) setLoyalty(data);
        })
        .catch(() => { if (!cancelled) setLoyalty(null); });
    }

    return () => { cancelled = true; };
  }, [selectedProduct?.seller_id, selectedProduct]);

  const removeFromFavorites = async (productId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (removingId === productId) return;
    setRemovingId(productId);
    try {
      hapticFeedback('light');
      await api.removeFavoriteProduct(productId);
      setProducts((prev) => prev.filter((p) => p.product_id !== productId));
      setSelectedProduct(null);
      // No alert — visual removal is the feedback
    } catch (err) {
      console.error(err);
    } finally {
      setRemovingId(null);
    }
  };

  const addToCart = async (productId: number, _date: string | null, quantity: number) => {
    setAddingId(productId);
    try {
      hapticFeedback('light');
      await api.addCartItem(productId, quantity);
      // Update local cart state (no alert — visual change is the feedback)
      setCartQuantities((prev) => {
        const next = new Map(prev);
        next.set(productId, (prev.get(productId) || 0) + quantity);
        return next;
      });
      setSelectedProduct(null);
    } catch (err) {
      console.error(err);
    } finally {
      setAddingId(null);
    }
  };

  const addToCartFromCard = async (productId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setAddingId(productId);
    try {
      hapticFeedback('light');
      await api.addCartItem(productId, 1);
      setCartQuantities((prev) => {
        const next = new Map(prev);
        next.set(productId, (prev.get(productId) || 0) + 1);
        return next;
      });
    } catch (err) {
      console.error(err);
    } finally {
      setAddingId(null);
    }
  };

  const updateCartQuantity = async (productId: number, newQty: number, e: React.MouseEvent) => {
    e.stopPropagation();
    hapticFeedback('light');
    // Optimistic update
    setCartQuantities((prev) => {
      const next = new Map(prev);
      if (newQty <= 0) {
        next.delete(productId);
      } else {
        next.set(productId, newQty);
      }
      return next;
    });

    try {
      if (newQty <= 0) {
        await api.removeCartItem(productId);
      } else {
        await api.updateCartItem(productId, newQty);
      }
    } catch {
      // Rollback on error — reload cart
      try {
        const qtyMap = new Map<number, number>();
        const groups = await api.getCart();
        for (const group of groups) {
          for (const item of group.items) {
            qtyMap.set(item.product_id, item.quantity);
          }
        }
        setCartQuantities(qtyMap);
      } catch { /* ignore */ }
    }
  };

  if (loading) return <Loader centered />;

  if (products.length === 0) {
    const needsAuth = isBrowser() && !api.isAuthenticated();
    return (
      <div className="favorite-products-page">
        <EmptyState
          title="Здесь появятся ваши избранные товары"
          description={needsAuth ? 'Войдите, чтобы сохранять товары в избранное' : 'Добавляйте товары в избранное, нажимая на иконку сердца на карточке товара'}
          icon="❤️"
        />
        {needsAuth ? (
          <button
            type="button"
            className="favorite-products-page__catalog-link"
            onClick={() => navigate('/profile')}
          >
            Войти в профиль
          </button>
        ) : (
          <button
            type="button"
            className="favorite-products-page__catalog-link"
            onClick={() => navigate('/catalog')}
          >
            Перейти в каталог
          </button>
        )}
      </div>
    );
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      maximumFractionDigits: 0,
    }).format(price);
  };

  return (
    <div className="favorite-products-page">
      <h1 className="favorite-products-page__title">Избранное</h1>
      <div className="favorite-products-grid">
        {products.map((product) => {
          const firstPhotoId = (product.photo_ids && product.photo_ids[0]) || product.photo_id;
          const imageUrl = api.getProductImageUrl(firstPhotoId ?? null);
          const inStock = (product.quantity ?? 0) > 0;
          const cartQty = cartQuantities.get(product.product_id) || 0;
          const isAdding = addingId === product.product_id;
          return (
            <div
              key={product.product_id}
              className="favorite-product-card"
              onClick={() => setSelectedProduct(product)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedProduct(product);
                }
              }}
            >
              <div className="favorite-product-card__image-wrap">
                <ProductImage
                  src={imageUrl}
                  alt={product.name}
                  className="favorite-product-card__image"
                  placeholderClassName="favorite-product-card__image-placeholder"
                />
              </div>
              <div className="favorite-product-card__info">
                <span className="favorite-product-card__price">{formatPrice(product.price)}</span>
                <span className="favorite-product-card__name">{product.name}</span>
                <div className="favorite-product-card__bottom">
                  <div className="favorite-product-card__actions">
                    {api.isAuthenticated() && (
                      <HeartIcon
                        isFavorite={true}
                        onClick={(e) => removeFromFavorites(product.product_id, e)}
                        size={20}
                        className="favorite-product-card__heart-icon"
                      />
                    )}
                  </div>
                  {cartQty > 0 ? (
                    <div className="favorite-product-card__qty-counter" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="favorite-product-card__qty-counter-btn"
                        onClick={(e) => updateCartQuantity(product.product_id, cartQty - 1, e)}
                      >
                        −
                      </button>
                      <span className="favorite-product-card__qty-counter-value">{cartQty}</span>
                      <button
                        type="button"
                        className="favorite-product-card__qty-counter-btn"
                        onClick={(e) => updateCartQuantity(product.product_id, cartQty + 1, e)}
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="favorite-product-card__cart-btn"
                      disabled={!inStock || isAdding}
                      onClick={(e) => addToCartFromCard(product.product_id, e)}
                    >
                      {isAdding ? '…' : inStock ? 'В корзину' : 'Нет'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Product modal — same as in ShopDetails, with loyalty & delivery */}
      {selectedProduct && (
        <ProductModal
          product={toProduct(selectedProduct)}
          isOpen={!!selectedProduct}
          onClose={() => setSelectedProduct(null)}
          isFavorite={true}
          onToggleFavorite={(e) => removeFromFavorites(selectedProduct.product_id, e)}
          onAddToCart={(qty: number) => addToCart(selectedProduct.product_id, null, qty)}
          isAdding={addingId === selectedProduct.product_id}
          inStock={(selectedProduct.quantity ?? 0) > 0}
          isPreorder={selectedProduct.is_preorder || false}
          deliveryPrice={sellerInfo?.delivery_price}
          deliveryType={sellerInfo?.delivery_type}
          loyaltyPointsPercent={loyalty?.points_percent ?? 0}
          pointsBalance={loyalty?.points_balance ?? 0}
          pointsToRubleRate={loyalty?.points_to_ruble_rate ?? 1}
          maxPointsDiscountPercent={loyalty?.max_points_discount_percent ?? 100}
          loyaltyLinked={loyalty?.linked ?? false}
        />
      )}
    </div>
  );
}
