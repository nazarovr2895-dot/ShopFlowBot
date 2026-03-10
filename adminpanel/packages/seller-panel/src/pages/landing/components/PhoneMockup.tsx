/**
 * SVG-макет телефона с реалистичным UI Mini App внутри.
 * Воспроизводит реальный интерфейс магазина: баннер, инфо, категории, товары.
 */
export function PhoneMockup() {
  return (
    <div className="phone-mockup-wrapper">
      <div className="phone-mockup-glow" aria-hidden="true" />

      <div className="phone-mockup">
        <svg viewBox="0 0 280 560" fill="none" xmlns="http://www.w3.org/2000/svg" className="phone-mockup__frame">
          <rect x="2" y="2" width="276" height="556" rx="36" fill="#1a1a2e" stroke="#333" strokeWidth="2" />
          <rect x="12" y="12" width="256" height="536" rx="28" fill="#ffffff" />
          <rect x="90" y="12" width="100" height="24" rx="12" fill="#1a1a2e" />
          <circle cx="140" cy="24" r="4" fill="#333" />
        </svg>

        <div className="phone-mockup__screen">
          {/* Баннер магазина */}
          <div className="pm-banner">
            <div className="pm-banner__flowers" aria-hidden="true" />
            <span className="pm-banner__title">мой магазин</span>
          </div>

          {/* Инфо магазина */}
          <div className="pm-shop-info">
            <div className="pm-shop-info__row">
              <div className="pm-shop-info__avatar" />
              <div className="pm-shop-info__text">
                <span className="pm-shop-info__name">Flowers</span>
                <span className="pm-shop-info__subs">3 подписчика</span>
              </div>
              <div className="pm-shop-info__actions">
                <span className="pm-shop-info__badge">Вы подписаны ✓</span>
              </div>
            </div>
          </div>

          {/* Описание */}
          <div className="pm-description">
            <p>Только тюльпаны — нежные, яркие и живые.</p>
          </div>

          {/* Информация */}
          <div className="pm-details">
            <div className="pm-details__item">
              <span className="pm-details__icon">✈</span>
              <span>Telegram</span>
            </div>
            <div className="pm-details__item">
              <span className="pm-details__dot pm-details__dot--green" />
              <span>Открыто</span>
              <span className="pm-details__time">00:00 — 23:59</span>
            </div>
            <div className="pm-details__item">
              <span className="pm-details__icon">●</span>
              <span>м. Университет дружбы</span>
            </div>
          </div>

          {/* Баллы лояльности */}
          <div className="pm-loyalty">
            <span>☆ 0 баллов</span>
          </div>

          {/* Категории */}
          <div className="pm-categories">
            <span className="pm-categories__tab">Все</span>
            <span className="pm-categories__tab pm-categories__tab--active">9 тюльпанов</span>
            <span className="pm-categories__tab">15 тюльпанов</span>
          </div>

          {/* Заголовок */}
          <div className="pm-products-header">Товары(14)</div>

          {/* Сетка товаров */}
          <div className="pm-products">
            <div className="pm-product">
              <div className="pm-product__img pm-product__img--1" />
              <span className="pm-product__name">Букет из 9 розово-бел...</span>
              <div className="pm-product__bottom">
                <span className="pm-product__price">1 200 ₽</span>
                <span className="pm-product__btn">В корзину</span>
              </div>
            </div>
            <div className="pm-product">
              <div className="pm-product__img pm-product__img--2" />
              <span className="pm-product__name">Букет из 9 красно-жёл...</span>
              <div className="pm-product__bottom">
                <span className="pm-product__price">1 200 ₽</span>
                <span className="pm-product__btn">В корзину</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
