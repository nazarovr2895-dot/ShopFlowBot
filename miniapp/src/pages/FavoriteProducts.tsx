import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FavoriteProduct } from '../types';
import { api } from '../api/client';
import { Loader, EmptyState, ProductImage, HeartIcon } from '../components';
import { useTelegramWebApp } from '../hooks/useTelegramWebApp';
import { isBrowser } from '../utils/environment';
import { formatPrice } from '../utils/formatters';
import './FavoriteProducts.css';

export function FavoriteProducts() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<FavoriteProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<number | null>(null);
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

  const removeFromFavorites = async (productId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (removingId === productId) return;
    setRemovingId(productId);
    try {
      hapticFeedback('light');
      await api.removeFavoriteProduct(productId);
      setProducts((prev) => prev.filter((p) => p.product_id !== productId));
    } catch (err) {
      console.error(err);
    } finally {
      setRemovingId(null);
    }
  };

  const openInShop = (product: FavoriteProduct) => {
    navigate(`/shop/${product.seller_id}?product=${product.product_id}`);
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

  return (
    <div className="favorite-products-page">
      <h1 className="favorite-products-page__title">Избранное</h1>
      <div className="favorite-products-grid">
        {products.map((product) => {
          const firstPhotoId = (product.photo_ids && product.photo_ids[0]) || product.photo_id;
          const imageUrl = api.getProductImageUrl(firstPhotoId ?? null);
          return (
            <div
              key={product.product_id}
              className="favorite-product-card"
              onClick={() => openInShop(product)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openInShop(product);
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
                  <span className="favorite-product-card__shop-badge">
                    {product.shop_name}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
