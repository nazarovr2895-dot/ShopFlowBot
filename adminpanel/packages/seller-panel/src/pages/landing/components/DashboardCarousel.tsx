/**
 * Горизонтальная карусель «скриншотов» панели управления.
 * Показывает реалистичные мокапы: заказы, аналитика, клиенты, каталог.
 */
export function DashboardCarousel() {
  return (
    <div className="dash-carousel">
      <div className="dash-carousel__track">
        {/* ─── Заказы ─── */}
        <div className="dash-carousel__card">
          <div className="dc-screen">
            <div className="dc-screen__header">
              <span className="dc-screen__title">Заказы</span>
            </div>
            <div className="dc-tabs">
              <span className="dc-tabs__tab dc-tabs__tab--active">
                Запросы <span className="dc-tabs__badge">3</span>
              </span>
              <span className="dc-tabs__tab">Активные</span>
              <span className="dc-tabs__tab">История</span>
            </div>
            <div className="dc-orders">
              <div className="dc-order">
                <div className="dc-order__left">
                  <span className="dc-order__id">#1024</span>
                  <span className="dc-order__buyer">Анна К.</span>
                </div>
                <div className="dc-order__right">
                  <span className="dc-order__status dc-order__status--new">Новый</span>
                  <span className="dc-order__price">2 490 ₽</span>
                </div>
              </div>
              <div className="dc-order">
                <div className="dc-order__left">
                  <span className="dc-order__id">#1023</span>
                  <span className="dc-order__buyer">Мария С.</span>
                </div>
                <div className="dc-order__right">
                  <span className="dc-order__status dc-order__status--accepted">Принят</span>
                  <span className="dc-order__price">4 800 ₽</span>
                </div>
              </div>
              <div className="dc-order">
                <div className="dc-order__left">
                  <span className="dc-order__id">#1022</span>
                  <span className="dc-order__buyer">Дмитрий В.</span>
                </div>
                <div className="dc-order__right">
                  <span className="dc-order__status dc-order__status--delivery">Доставляется</span>
                  <span className="dc-order__price">1 800 ₽</span>
                </div>
              </div>
              <div className="dc-order">
                <div className="dc-order__left">
                  <span className="dc-order__id">#1021</span>
                  <span className="dc-order__buyer">Елена Р.</span>
                </div>
                <div className="dc-order__right">
                  <span className="dc-order__status dc-order__status--new">Новый</span>
                  <span className="dc-order__price">3 200 ₽</span>
                </div>
              </div>
            </div>
          </div>
          <span className="dash-carousel__label">Заказы</span>
        </div>

        {/* ─── Аналитика ─── */}
        <div className="dash-carousel__card">
          <div className="dc-screen">
            <div className="dc-screen__header">
              <span className="dc-screen__title">Аналитика</span>
            </div>
            <div className="dc-analytics-hero">
              <span className="dc-analytics-hero__label">Выручка за 7 дней</span>
              <div className="dc-analytics-hero__row">
                <span className="dc-analytics-hero__value">127 400 ₽</span>
                <span className="dc-analytics-hero__trend dc-analytics-hero__trend--up">↑ 12%</span>
              </div>
            </div>
            <div className="dc-chart">
              <svg viewBox="0 0 260 70" className="dc-chart__svg">
                <defs>
                  <linearGradient id="dcChartGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d="M0 55 Q30 50 55 40 Q80 28 110 32 Q140 36 165 18 Q190 8 220 12 Q245 16 260 4 L260 70 L0 70Z" fill="url(#dcChartGrad)" />
                <path d="M0 55 Q30 50 55 40 Q80 28 110 32 Q140 36 165 18 Q190 8 220 12 Q245 16 260 4" fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </div>
            <div className="dc-stats-row">
              <div className="dc-stats-row__item">
                <span className="dc-stats-row__label">Заказов</span>
                <span className="dc-stats-row__value">48</span>
              </div>
              <div className="dc-stats-row__item">
                <span className="dc-stats-row__label">Средний чек</span>
                <span className="dc-stats-row__value">2 654 ₽</span>
              </div>
              <div className="dc-stats-row__item">
                <span className="dc-stats-row__label">Конверсия</span>
                <span className="dc-stats-row__value">8.3%</span>
              </div>
            </div>
          </div>
          <span className="dash-carousel__label">Аналитика</span>
        </div>

        {/* ─── Клиенты ─── */}
        <div className="dash-carousel__card">
          <div className="dc-screen">
            <div className="dc-screen__header">
              <span className="dc-screen__title">Клиенты</span>
              <span className="dc-screen__subtitle">48 клиентов · 12 подписчиков</span>
            </div>
            <div className="dc-customers">
              <div className="dc-customer">
                <div className="dc-customer__avatar dc-customer__avatar--purple">АК</div>
                <div className="dc-customer__info">
                  <span className="dc-customer__name">Анна Козлова</span>
                  <span className="dc-customer__meta">5 заказов · 230 баллов</span>
                </div>
                <span className="dc-customer__segment dc-customer__segment--vip">VIP</span>
              </div>
              <div className="dc-customer">
                <div className="dc-customer__avatar dc-customer__avatar--blue">МС</div>
                <div className="dc-customer__info">
                  <span className="dc-customer__name">Мария Смирнова</span>
                  <span className="dc-customer__meta">3 заказа · 120 баллов</span>
                </div>
                <span className="dc-customer__segment dc-customer__segment--regular">Постоянный</span>
              </div>
              <div className="dc-customer">
                <div className="dc-customer__avatar dc-customer__avatar--green">ДВ</div>
                <div className="dc-customer__info">
                  <span className="dc-customer__name">Дмитрий Волков</span>
                  <span className="dc-customer__meta">1 заказ · 45 баллов</span>
                </div>
                <span className="dc-customer__segment dc-customer__segment--new">Новый</span>
              </div>
              <div className="dc-customer">
                <div className="dc-customer__avatar dc-customer__avatar--orange">ЕР</div>
                <div className="dc-customer__info">
                  <span className="dc-customer__name">Елена Романова</span>
                  <span className="dc-customer__meta">8 заказов · 560 баллов</span>
                </div>
                <span className="dc-customer__segment dc-customer__segment--vip">VIP</span>
              </div>
            </div>
          </div>
          <span className="dash-carousel__label">Клиенты</span>
        </div>

        {/* ─── Каталог ─── */}
        <div className="dash-carousel__card">
          <div className="dc-screen">
            <div className="dc-screen__header">
              <span className="dc-screen__title">Каталог</span>
            </div>
            <div className="dc-catalog-tabs">
              <span className="dc-catalog-tabs__pill dc-catalog-tabs__pill--active">Все (14)</span>
              <span className="dc-catalog-tabs__pill">Букеты (8)</span>
              <span className="dc-catalog-tabs__pill">Добавки (6)</span>
            </div>
            <div className="dc-catalog-list">
              <div className="dc-catalog-item">
                <div className="dc-catalog-item__img dc-catalog-item__img--1" />
                <div className="dc-catalog-item__info">
                  <span className="dc-catalog-item__name">Букет «Нежность»</span>
                  <span className="dc-catalog-item__price">2 490 ₽</span>
                </div>
                <span className="dc-catalog-item__eye">👁</span>
              </div>
              <div className="dc-catalog-item">
                <div className="dc-catalog-item__img dc-catalog-item__img--2" />
                <div className="dc-catalog-item__info">
                  <span className="dc-catalog-item__name">9 тюльпанов микс</span>
                  <span className="dc-catalog-item__price">1 200 ₽</span>
                </div>
                <span className="dc-catalog-item__eye">👁</span>
              </div>
              <div className="dc-catalog-item">
                <div className="dc-catalog-item__img dc-catalog-item__img--3" />
                <div className="dc-catalog-item__info">
                  <span className="dc-catalog-item__name">Пионовые розы</span>
                  <span className="dc-catalog-item__price">3 490 ₽</span>
                </div>
                <span className="dc-catalog-item__eye">👁</span>
              </div>
            </div>
          </div>
          <span className="dash-carousel__label">Каталог</span>
        </div>
      </div>
    </div>
  );
}
