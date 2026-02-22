import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { PublicSellerDetail, Product } from '../types';
import { api } from '../api/client';
import { useTelegramWebApp } from '../hooks/useTelegramWebApp';
import { isBrowser } from '../utils/environment';
import { addToGuestCart } from '../utils/guestCart';
import { Loader, EmptyState, ProductImage, HeartIcon, DesktopBackNav } from '../components';
import { ProductComposition } from '../components/ProductComposition';
import './ProductDetail.css';

export function ProductDetail() {
  const { sellerId, productId } = useParams<{ sellerId: string; productId: string }>();
  const navigate = useNavigate();
  const { setBackButton, hapticFeedback, showAlert } = useTelegramWebApp();
  const [product, setProduct] = useState<Product | null>(null);
  const [shopName, setShopName] = useState<string>('');
  const [sellerDetail, setSellerDetail] = useState<PublicSellerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [selectedPreorderDate, setSelectedPreorderDate] = useState<string | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [togglingFavorite, setTogglingFavorite] = useState(false);
  const scrollTrackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setBackButton(true, () => navigate(-1));
    return () => setBackButton(false);
  }, [setBackButton, navigate]);

  useEffect(() => {
    if (!sellerId || !productId) return;
    const load = async () => {
      setLoading(true);
      try {
        const id = parseInt(sellerId, 10);
        const data: PublicSellerDetail = await api.getSellerDetail(id);
        setSellerDetail(data);
        setShopName(data.shop_name || 'Магазин');
        const pid = parseInt(productId, 10);
        const p = data.products.find((x) => x.id === pid) ?? (data.preorder_products ?? []).find((x) => x.id === pid) ?? null;
        setProduct(p ?? null);
      } catch {
        setProduct(null);
        setSellerDetail(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [sellerId, productId]);

  useEffect(() => {
    setPhotoIndex(0);
  }, [productId]);

  // Load favorite state when product is loaded
  useEffect(() => {
    if (!product || !api.isAuthenticated()) {
      setIsFavorite(false);
      return;
    }
    const check = async () => {
      try {
        const favorites = await api.getFavoriteProducts();
        setIsFavorite(favorites.some((p) => p.product_id === product.id));
      } catch {
        setIsFavorite(false);
      }
    };
    check();
  }, [product?.id, product]);

  const toggleFavorite = async () => {
    if (!product || togglingFavorite) return;
    setTogglingFavorite(true);
    const wasFavorite = isFavorite;
    
    // Optimistic update
    setIsFavorite(!wasFavorite);
    
    try {
      hapticFeedback('light');
      if (wasFavorite) {
        await api.removeFavoriteProduct(product.id);
        showAlert('Убрано из избранного');
      } else {
        await api.addFavoriteProduct(product.id);
        showAlert('Добавлено в избранное');
      }
    } catch (err) {
      // Rollback on error
      setIsFavorite(wasFavorite);
      const msg = err instanceof Error ? err.message : 'Ошибка';
      if (msg.includes('401') || msg.includes('Unauthorized') || msg.includes('аутентификац')) {
        showAlert('Откройте приложение в Telegram, чтобы добавлять товары в избранное.');
      } else {
        showAlert(msg);
      }
    } finally {
      setTogglingFavorite(false);
    }
  };

  const addToCart = async (preorderDate?: string | null) => {
    if (!product) return;
    setAdding(true);
    try {
      hapticFeedback('medium');

      // Guest cart: browser + not authenticated → save to localStorage
      if (isBrowser() && !api.isAuthenticated()) {
        addToGuestCart({
          product_id: product.id,
          seller_id: Number(sellerId),
          name: product.name,
          price: product.price,
          quantity: 1,
          photo_id: product.photo_id ?? null,
          seller_name: shopName || undefined,
          delivery_type: sellerDetail?.delivery_type ?? null,
        });
        showAlert(preorderDate ? 'Предзаказ добавлен в корзину' : 'Добавлено в корзину');
        setSelectedPreorderDate(null);
        return;
      }

      const result = await api.addCartItem(product.id, 1, preorderDate);
      if (preorderDate) {
        showAlert('Предзаказ добавлен в корзину');
      } else if (result.reserved_at) {
        showAlert('Товар забронирован на 5 минут');
      } else {
        showAlert('Добавлено в корзину');
      }
      setSelectedPreorderDate(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Ошибка';
      const isAuthError = msg.includes('401') || msg.includes('Unauthorized') || msg.includes('Missing') || msg.includes('X-Telegram');
      const isStockError = msg.includes('409') || msg.includes('Товар закончился') || msg.includes('Недостаточно');
      if (isStockError) {
        showAlert('Товар закончился');
      } else if (isAuthError) {
        if (isBrowser()) {
          showAlert('Войдите в профиле, чтобы добавлять товары в корзину');
          navigate('/profile');
        } else {
          showAlert('Добавление в корзину доступно только в приложении Telegram. Откройте магазин через бота.');
        }
      } else {
        showAlert(msg);
      }
    } finally {
      setAdding(false);
    }
  };

  if (loading) return <Loader centered />;
  if (!product) {
    return (
      <div className="product-detail-page">
        <EmptyState title="Товар не найден" description="" icon="📦" />
      </div>
    );
  }

  const photoIds = (product.photo_ids && product.photo_ids.length) ? product.photo_ids : (product.photo_id ? [product.photo_id] : []);
  const hasMultiplePhotos = photoIds.length > 1;
  const isPreorder = product.is_preorder === true;
  const inStock = !isPreorder && (product.quantity ?? 0) > 0;
  const availableDates = sellerDetail?.preorder_available_dates ?? [];
  const formatPrice = (n: number) =>
    new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(n);

  const handleScroll = () => {
    const el = scrollTrackRef.current;
    if (!el || !hasMultiplePhotos) return;
    const width = el.offsetWidth;
    if (width <= 0) return;
    const idx = Math.round(el.scrollLeft / width);
    const clamped = Math.min(Math.max(0, idx), photoIds.length - 1);
    setPhotoIndex(clamped);
  };

  const goToSlide = (i: number) => {
    setPhotoIndex(i);
    const el = scrollTrackRef.current;
    if (el) {
      const width = el.offsetWidth;
      el.scrollTo({ left: i * width, behavior: 'smooth' });
    }
  };

  return (
    <div className="product-detail-page">
      <DesktopBackNav title={shopName || 'Товар'} />
      <div className="product-detail__layout">
      <div className="product-detail__image-wrap">
        {hasMultiplePhotos ? (
          <div
            ref={scrollTrackRef}
            className="product-detail__image-track"
            onScroll={handleScroll}
          >
            {photoIds.map((pid, i) => {
              const imageUrl = api.getProductImageUrl(pid ?? null);
              return (
                <div key={i} className="product-detail__image-slide">
                  <ProductImage
                    src={imageUrl}
                    alt={`${product.name} — фото ${i + 1}`}
                    className="product-detail__image"
                    placeholderClassName="product-detail__image-placeholder"
                    placeholderIconClassName="product-detail__image-placeholder-icon"
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <ProductImage
            src={api.getProductImageUrl(photoIds[0] ?? product.photo_id ?? null)}
            alt={product.name}
            className="product-detail__image"
            placeholderClassName="product-detail__image-placeholder"
            placeholderIconClassName="product-detail__image-placeholder-icon"
          />
        )}
        {hasMultiplePhotos && (
          <div className="product-detail__photo-dots">
            {photoIds.map((_, i) => (
              <button
                key={i}
                type="button"
                className={`product-detail__photo-dot ${i === photoIndex ? 'active' : ''}`}
                onClick={() => goToSlide(i)}
                aria-label={`Фото ${i + 1}`}
              />
            ))}
          </div>
        )}
        {api.isAuthenticated() && (
          <div className="product-detail__heart">
            <HeartIcon
              isFavorite={isFavorite}
              onClick={toggleFavorite}
              size={28}
            />
          </div>
        )}
      </div>
      <div className="product-detail__body">
        {shopName && (
          <p className="product-detail__shop">{shopName}</p>
        )}
        <h1 className="product-detail__name">{product.name}</h1>
        {product.description && (
          <p className="product-detail__description">{product.description}</p>
        )}
        {product.composition && product.composition.length > 0 && (
          <ProductComposition items={product.composition} />
        )}
        {isPreorder ? (
          <p className="product-detail__qty">Товар по предзаказу</p>
        ) : typeof product.quantity === 'number' && (
          <p className="product-detail__qty">В наличии: {product.quantity} шт.</p>
        )}
        <div className="product-detail__price">{formatPrice(product.price)}</div>
        {isPreorder && availableDates.length > 0 ? (
          <div className="product-detail__preorder">
            {selectedPreorderDate === 'pick' ? (
              <div className="product-detail__preorder-dates">
                <span className="product-detail__preorder-label">Выберите дату поставки:</span>
                {availableDates.slice(0, 4).map((d) => (
                  <button
                    key={d}
                    type="button"
                    className="product-detail__preorder-date-btn"
                    disabled={adding}
                    onClick={() => addToCart(d)}
                  >
                    {new Date(d).toLocaleDateString('ru-RU')}
                  </button>
                ))}
                <button type="button" className="product-detail__preorder-cancel" onClick={() => setSelectedPreorderDate(null)}>
                  Отмена
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="product-detail__add-btn"
                disabled={adding}
                onClick={() => setSelectedPreorderDate('pick')}
              >
                {adding ? '…' : 'Заказать на дату'}
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            className="product-detail__add-btn"
            disabled={!inStock || adding}
            onClick={() => addToCart()}
          >
            {adding ? '…' : inStock ? 'В корзину' : 'Нет в наличии'}
          </button>
        )}
      </div>
      </div>{/* .product-detail__layout */}
    </div>
  );
}
