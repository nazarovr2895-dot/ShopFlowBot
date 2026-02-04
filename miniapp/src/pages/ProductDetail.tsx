import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { PublicSellerDetail, Product } from '../types';
import { api } from '../api/client';
import { useTelegramWebApp } from '../hooks/useTelegramWebApp';
import { Loader, EmptyState, ProductImage } from '../components';
import './ProductDetail.css';

export function ProductDetail() {
  const { sellerId, productId } = useParams<{ sellerId: string; productId: string }>();
  const navigate = useNavigate();
  const { setBackButton, hapticFeedback, showAlert } = useTelegramWebApp();
  const [product, setProduct] = useState<Product | null>(null);
  const [shopName, setShopName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
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
        setShopName(data.shop_name || 'Магазин');
        const p = data.products.find((x) => x.id === parseInt(productId, 10));
        setProduct(p ?? null);
      } catch {
        setProduct(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [sellerId, productId]);

  useEffect(() => {
    setPhotoIndex(0);
  }, [productId]);

  const addToCart = async () => {
    if (!product) return;
    setAdding(true);
    try {
      hapticFeedback('medium');
      await api.addCartItem(product.id, 1);
      showAlert('Добавлено в корзину');
    } catch (e) {
      showAlert(e instanceof Error ? e.message : 'Ошибка');
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
  const inStock = (product.quantity ?? 0) > 0;
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
      </div>
      <div className="product-detail__body">
        {shopName && (
          <p className="product-detail__shop">{shopName}</p>
        )}
        <h1 className="product-detail__name">{product.name}</h1>
        {product.description && (
          <p className="product-detail__description">{product.description}</p>
        )}
        {typeof product.quantity === 'number' && (
          <p className="product-detail__qty">В наличии: {product.quantity} шт.</p>
        )}
        <div className="product-detail__price">{formatPrice(product.price)}</div>
        <button
          type="button"
          className="product-detail__add-btn"
          disabled={!inStock || adding}
          onClick={addToCart}
        >
          {adding ? '…' : inStock ? 'В корзину' : 'Нет в наличии'}
        </button>
      </div>
    </div>
  );
}
