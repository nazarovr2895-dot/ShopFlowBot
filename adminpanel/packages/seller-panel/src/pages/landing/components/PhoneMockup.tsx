/**
 * SVG-макет телефона с UI Mini App внутри.
 * Плавающая анимация + градиентное свечение за макетом.
 */
export function PhoneMockup() {
  return (
    <div className="phone-mockup-wrapper">
      {/* Градиентное свечение */}
      <div className="phone-mockup-glow" aria-hidden="true" />

      <div className="phone-mockup">
        <svg viewBox="0 0 280 560" fill="none" xmlns="http://www.w3.org/2000/svg" className="phone-mockup__frame">
          {/* Корпус телефона */}
          <rect x="2" y="2" width="276" height="556" rx="36" fill="#1a1a2e" stroke="#333" strokeWidth="2" />
          {/* Экран */}
          <rect x="12" y="12" width="256" height="536" rx="28" fill="#ffffff" />
          {/* Нотч */}
          <rect x="90" y="12" width="100" height="24" rx="12" fill="#1a1a2e" />
          {/* Dynamic Island точка */}
          <circle cx="140" cy="24" r="4" fill="#333" />
        </svg>

        {/* Контент "экрана" */}
        <div className="phone-mockup__screen">
          {/* Хедер магазина */}
          <div className="pm-header">
            <div className="pm-header__logo" />
            <span className="pm-header__name">Цветочный дом</span>
            <div className="pm-header__cart">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
              <span className="pm-header__badge">2</span>
            </div>
          </div>

          {/* Каталог */}
          <div className="pm-catalog">
            {/* Карточка 1 — крупная */}
            <div className="pm-card pm-card--featured">
              <div className="pm-card__img pm-card__img--rose" />
              <div className="pm-card__info">
                <span className="pm-card__name">Букет «Нежность»</span>
                <span className="pm-card__price">2 490 ₽</span>
              </div>
              <button className="pm-card__btn">В корзину</button>
            </div>

            {/* Две маленькие карточки */}
            <div className="pm-card-row">
              <div className="pm-card pm-card--sm">
                <div className="pm-card__img pm-card__img--tulip" />
                <span className="pm-card__name">Тюльпаны</span>
                <span className="pm-card__price">1 290 ₽</span>
              </div>
              <div className="pm-card pm-card--sm">
                <div className="pm-card__img pm-card__img--peony" />
                <span className="pm-card__name">Пионы</span>
                <span className="pm-card__price">3 490 ₽</span>
              </div>
            </div>
          </div>

          {/* Tab bar */}
          <div className="pm-tabbar">
            <div className="pm-tabbar__item pm-tabbar__item--active">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              <span>Каталог</span>
            </div>
            <div className="pm-tabbar__item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" x2="21" y1="6" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
              <span>Заказы</span>
            </div>
            <div className="pm-tabbar__item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
              <span>Избранное</span>
            </div>
            <div className="pm-tabbar__item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              <span>Профиль</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
