import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingBag, BarChart3, Heart, Truck,
  ClipboardList, Shield, Zap, ArrowRight,
  CheckCircle2, Store, Settings, TrendingUp,
} from 'lucide-react';
import { ApplicationModal } from './ApplicationModal';
import './LandingPage.css';

const features = [
  {
    icon: ShoppingBag,
    title: 'Каталог товаров',
    desc: 'Удобное управление ассортиментом, фото, ценами и остатками в реальном времени',
  },
  {
    icon: ClipboardList,
    title: 'Заказы и доставка',
    desc: 'Приём заказов, управление доставкой с зонами и слотами, уведомления покупателям',
  },
  {
    icon: BarChart3,
    title: 'Аналитика продаж',
    desc: 'Подробная статистика: выручка, конверсия, популярные товары, динамика по дням',
  },
  {
    icon: Heart,
    title: 'Программа лояльности',
    desc: 'Баллы за покупки, тиеры, скидки на предзаказы — повышайте возвращаемость клиентов',
  },
  {
    icon: Truck,
    title: 'Зоны доставки',
    desc: 'Гибкая настройка зон, стоимости и лимитов доставки по районам и станциям метро',
  },
  {
    icon: Shield,
    title: 'Приём оплаты',
    desc: 'Подключите свой YooKassa аккаунт — оплата поступает напрямую на ваш счёт',
  },
];

const steps = [
  {
    num: '01',
    icon: Store,
    title: 'Оставьте заявку',
    desc: 'Заполните форму с ИНН и названием магазина. Мы проверим данные и свяжемся с вами.',
  },
  {
    num: '02',
    icon: Settings,
    title: 'Настройте магазин',
    desc: 'Добавьте товары, настройте доставку, подключите оплату — всё через удобную панель.',
  },
  {
    num: '03',
    icon: TrendingUp,
    title: 'Принимайте заказы',
    desc: 'Покупатели найдут вас в Telegram Mini App. Получайте заказы и растите продажи.',
  },
];

export function LandingPage() {
  const [showModal, setShowModal] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="landing" data-theme="light">
      {/* Header */}
      <header className="landing-header">
        <div className="landing-container landing-header__inner">
          <div className="landing-header__brand">
            <img src="/android-chrome-192x192.png" alt="flurai" width={32} height={32} />
            <span className="landing-header__name">flurai</span>
          </div>
          <div className="landing-header__actions">
            <button className="landing-btn landing-btn--ghost" onClick={() => navigate('/login')}>
              Войти
            </button>
            <button className="landing-btn landing-btn--primary" onClick={() => setShowModal(true)}>
              Открыть магазин
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="landing-hero">
        <div className="landing-container">
          <div className="landing-hero__content">
            <div className="landing-hero__badge">
              <Zap size={14} />
              <span>Telegram Mini App для бизнеса</span>
            </div>
            <h1 className="landing-hero__title">
              Ваш магазин<br />в Telegram
            </h1>
            <p className="landing-hero__subtitle">
              Платформа для продавцов: каталог, заказы, доставка, аналитика и программа лояльности —
              всё в одном месте. Покупатели находят вас через Telegram Mini App.
            </p>
            <div className="landing-hero__cta">
              <button className="landing-btn landing-btn--primary landing-btn--lg" onClick={() => setShowModal(true)}>
                Открыть магазин
                <ArrowRight size={18} />
              </button>
            </div>
            <div className="landing-hero__stats">
              <div className="landing-hero__stat">
                <strong>0%</strong>
                <span>комиссия с продаж*</span>
              </div>
              <div className="landing-hero__stat-divider" />
              <div className="landing-hero__stat">
                <strong>5 мин</strong>
                <span>настройка магазина</span>
              </div>
              <div className="landing-hero__stat-divider" />
              <div className="landing-hero__stat">
                <strong>24/7</strong>
                <span>приём заказов</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="landing-section">
        <div className="landing-container">
          <div className="landing-section__header">
            <h2 className="landing-section__title">Всё для вашего бизнеса</h2>
            <p className="landing-section__subtitle">
              Инструменты, которые помогут вам продавать больше и управлять магазином эффективнее
            </p>
          </div>
          <div className="landing-features-grid">
            {features.map((f) => (
              <div key={f.title} className="landing-feature-card">
                <div className="landing-feature-card__icon">
                  <f.icon size={24} />
                </div>
                <h3 className="landing-feature-card__title">{f.title}</h3>
                <p className="landing-feature-card__desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="landing-section landing-section--alt">
        <div className="landing-container">
          <div className="landing-section__header">
            <h2 className="landing-section__title">Как начать продавать</h2>
            <p className="landing-section__subtitle">
              Три простых шага — и ваш магазин готов к работе
            </p>
          </div>
          <div className="landing-steps">
            {steps.map((s) => (
              <div key={s.num} className="landing-step">
                <div className="landing-step__num">{s.num}</div>
                <div className="landing-step__icon">
                  <s.icon size={28} />
                </div>
                <h3 className="landing-step__title">{s.title}</h3>
                <p className="landing-step__desc">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Advantages */}
      <section className="landing-section">
        <div className="landing-container">
          <div className="landing-section__header">
            <h2 className="landing-section__title">Почему flurai</h2>
          </div>
          <div className="landing-advantages">
            {[
              'Оплата поступает напрямую на ваш счёт — мы не задерживаем деньги',
              'Покупатели заказывают прямо в Telegram — без скачивания приложений',
              'Полный контроль: каталог, остатки, цены, расписание — всё в вашей панели',
              'Уведомления о заказах в Telegram — ничего не пропустите',
              'Гибкая доставка: зоны, слоты, самовывоз — настройте под свой бизнес',
              'Детальная аналитика продаж и поведения покупателей',
            ].map((text) => (
              <div key={text} className="landing-advantage">
                <CheckCircle2 size={20} className="landing-advantage__icon" />
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="landing-cta-section">
        <div className="landing-container">
          <div className="landing-cta-block">
            <h2>Готовы начать?</h2>
            <p>Оставьте заявку — мы поможем запустить ваш магазин в Telegram</p>
            <button className="landing-btn landing-btn--white landing-btn--lg" onClick={() => setShowModal(true)}>
              Открыть магазин
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-container landing-footer__inner">
          <div className="landing-footer__brand">
            <img src="/android-chrome-192x192.png" alt="flurai" width={24} height={24} />
            <span>flurai</span>
          </div>
          <p className="landing-footer__note">
            * Платформа взимает фиксированную абонентскую плату. Комиссия с продаж — 0%.
          </p>
        </div>
      </footer>

      {showModal && (
        <ApplicationModal onClose={() => setShowModal(false)} />
      )}
    </div>
  );
}
