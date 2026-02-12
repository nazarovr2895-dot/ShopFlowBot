import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FavoriteProduct } from '../types';
import { api } from '../api/client';
import { Loader, EmptyState, ProductImage } from '../components';
import { isBrowser } from '../utils/environment';
import './FavoriteProducts.css';

export function FavoriteProducts() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<FavoriteProduct[]>([]);
  const [loading, setLoading] = useState(true);

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
          const imageUrl = api.getProductImageUrl(product.photo_id ?? null);
          return (
            <div
              key={product.product_id}
              className="favorite-product-card"
              onClick={() => navigate(`/shop/${product.seller_id}/product/${product.product_id}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate(`/shop/${product.seller_id}/product/${product.product_id}`);
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
                <span className="favorite-product-card__shop">{product.shop_name}</span>
                <span className="favorite-product-card__name">{product.name}</span>
                <span className="favorite-product-card__price">{formatPrice(product.price)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
