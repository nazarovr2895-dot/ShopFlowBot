import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight, CheckCircle2, ShoppingBag, BarChart3,
  ClipboardList, Heart, Truck, Shield, HelpCircle, ChevronDown,
} from 'lucide-react';
import { ApplicationModal } from './ApplicationModal';
import { PricingCalculator } from './components/PricingCalculator';
import './LandingPage.css';
import './PricingPage.css';

const examples = [
  { sales: 80000, cost: 2000, label: 'Небольшой магазин', note: 'Только базовая подписка' },
  { sales: 200000, cost: 4000, label: 'Средний магазин', note: '2 000 + 1% × 200 000' },
  { sales: 500000, cost: 7000, label: 'Крупный магазин', note: '2 000 + 1% × 500 000' },
];

const included = [
  { icon: ShoppingBag, text: 'Каталог товаров с фото и ценами' },
  { icon: ClipboardList, text: 'Приём и управление заказами' },
  { icon: BarChart3, text: 'Аналитика продаж и статистика' },
  { icon: Heart, text: 'Программа лояльности для покупателей' },
  { icon: Truck, text: 'Зоны доставки и слоты' },
  { icon: Shield, text: 'Приём оплаты через YooKassa' },
];

const faqs = [
  {
    q: 'Что значит «1% от продаж»? Это комиссия?',
    a: 'Нет, это не комиссия. Все деньги от покупателей поступают напрямую на ваш счёт через YooKassa. 1% от суммы продаж свыше 100 000 ₽ добавляется к стоимости подписки на следующий месяц. Это способ формирования стоимости подписки, а не удержание с продаж.',
  },
  {
    q: 'Когда начинать платить за подписку?',
    a: 'После одобрения заявки и настройки магазина у вас есть пробный период. Подписка оплачивается через панель управления. До оплаты функционал магазина доступен для настройки.',
  },
  {
    q: 'Как рассчитывается стоимость подписки?',
    a: 'Базовая подписка — 2 000 ₽/мес. Если оборот за предыдущие 30 дней превышает 100 000 ₽, к базовой цене добавляется 1% от суммы продаж. Точный расчёт отображается в панели управления.',
  },
  {
    q: 'Что будет, если продажи в месяц 0 ₽?',
    a: 'Вы платите только базовую подписку — 2 000 ₽. Никаких дополнительных начислений.',
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`pricing-faq__item ${open ? 'pricing-faq__item--open' : ''}`}>
      <button className="pricing-faq__question" onClick={() => setOpen(!open)}>
        <HelpCircle size={18} className="pricing-faq__icon" />
        <span>{q}</span>
        <ChevronDown size={18} className="pricing-faq__chevron" />
      </button>
      <div className="pricing-faq__answer">
        <p>{a}</p>
      </div>
    </div>
  );
}

export function PricingPage() {
  const [showModal, setShowModal] = useState(false);
  const navigate = useNavigate();

  const formatNum = (n: number) => n.toLocaleString('ru-RU');

  return (
    <div className="landing" data-theme="light">
      {/* Header */}
      <header className="landing-header">
        <div className="landing-container landing-header__inner">
          <Link to="/" className="landing-header__brand" style={{ textDecoration: 'none', color: 'inherit' }}>
            <img src="/android-chrome-192x192.png" alt="flurai" width={32} height={32} />
            <span className="landing-header__name">flurai</span>
          </Link>
          <nav className="landing-header__nav">
            <Link to="/pricing" className="landing-header__link" style={{ color: 'var(--landing-text)' }}>Тарифы</Link>
          </nav>
          <div className="landing-header__actions">
            <button className="landing-btn landing-btn--ghost" onClick={() => navigate('/login')}>Войти</button>
            <button className="landing-btn landing-btn--primary" onClick={() => setShowModal(true)}>Открыть магазин</button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="pricing-hero">
        <div className="landing-container">
          <h1 className="pricing-hero__title">Прозрачные тарифы</h1>
          <p className="pricing-hero__subtitle">
            Простая и понятная модель: фиксированная подписка + формирование стоимости по объёму продаж.
            Никаких скрытых комиссий — ваша выручка остаётся вашей.
          </p>
        </div>
      </section>

      {/* Main pricing explanation */}
      <section className="landing-section">
        <div className="landing-container">
          <div className="pricing-main-card">
            <div className="pricing-main-card__header">
              <div className="pricing-main-card__price">2 000 ₽<span>/мес</span></div>
              <div className="pricing-main-card__badge">базовая подписка</div>
            </div>

            <div className="pricing-main-card__body">
              <div className="pricing-explanation">
                <div className="pricing-explanation__block">
                  <div className="pricing-explanation__icon pricing-explanation__icon--green">✓</div>
                  <div>
                    <strong>Продажи до 100 000 ₽/мес</strong>
                    <p>Вы платите только 2 000 ₽ — базовую подписку. Больше ничего.</p>
                  </div>
                </div>

                <div className="pricing-explanation__divider" />

                <div className="pricing-explanation__block">
                  <div className="pricing-explanation__icon pricing-explanation__icon--accent">+1%</div>
                  <div>
                    <strong>Продажи свыше 100 000 ₽/мес</strong>
                    <p>
                      К базовой подписке добавляется 1% от суммы продаж. Это формирует стоимость подписки
                      на следующий месяц. <strong>Деньги от покупателей поступают напрямую на ваш счёт</strong> —
                      мы ничего не удерживаем с продаж.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pricing-callout">
                <strong>Важно:</strong> 1% — это не комиссия с продаж. Это часть формирования стоимости подписки.
                Вся выручка от покупателей поступает на ваш счёт через YooKassa без каких-либо удержаний.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Examples */}
      <section className="landing-section landing-section--alt">
        <div className="landing-container">
          <div className="landing-section__header">
            <h2 className="landing-section__title">Примеры расчёта</h2>
          </div>
          <div className="pricing-examples">
            {examples.map((ex) => (
              <div key={ex.sales} className="pricing-example-card">
                <div className="pricing-example-card__label">{ex.label}</div>
                <div className="pricing-example-card__sales">Продажи: {formatNum(ex.sales)} ₽/мес</div>
                <div className="pricing-example-card__cost">{formatNum(ex.cost)} ₽<span>/мес</span></div>
                <div className="pricing-example-card__note">{ex.note}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Calculator */}
      <section className="landing-section">
        <div className="landing-container">
          <PricingCalculator />
        </div>
      </section>

      {/* What's included */}
      <section className="landing-section landing-section--alt">
        <div className="landing-container">
          <div className="landing-section__header">
            <h2 className="landing-section__title">Что входит в подписку</h2>
            <p className="landing-section__subtitle">Все инструменты для управления магазином — без ограничений</p>
          </div>
          <div className="pricing-included-grid">
            {included.map((item) => (
              <div key={item.text} className="pricing-included-item">
                <div className="pricing-included-item__icon">
                  <item.icon size={20} />
                </div>
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="landing-section">
        <div className="landing-container">
          <div className="landing-section__header">
            <h2 className="landing-section__title">Частые вопросы</h2>
          </div>
          <div className="pricing-faq">
            {faqs.map((faq) => (
              <FaqItem key={faq.q} q={faq.q} a={faq.a} />
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="landing-cta-section">
        <div className="landing-container">
          <div className="landing-cta-block">
            <h2>Готовы начать продавать?</h2>
            <p>Оставьте заявку — мы поможем настроить ваш магазин в Telegram</p>
            <button className="landing-btn landing-btn--white landing-btn--lg" onClick={() => setShowModal(true)}>
              Открыть магазин <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-container">
          <div className="landing-footer__grid">
            <div className="landing-footer__col">
              <div className="landing-footer__brand">
                <img src="/android-chrome-192x192.png" alt="flurai" width={24} height={24} />
                <span>flurai</span>
              </div>
              <p className="landing-footer__desc">Платформа для продавцов в Telegram.</p>
            </div>
            <div className="landing-footer__col">
              <h4 className="landing-footer__col-title">Платформа</h4>
              <Link to="/" className="landing-footer__link">Главная</Link>
              <Link to="/pricing" className="landing-footer__link">Тарифы</Link>
            </div>
            <div className="landing-footer__col">
              <h4 className="landing-footer__col-title">Документы</h4>
              <Link to="/legal/offer" className="landing-footer__link">Пользовательское соглашение</Link>
              <Link to="/legal/privacy" className="landing-footer__link">Политика конфиденциальности</Link>
            </div>
          </div>
          <div className="landing-footer__bottom">
            <span className="landing-footer__copy">&copy; {new Date().getFullYear()} flurai</span>
            <span className="landing-footer__note">* Платформа взимает фиксированную абонентскую плату. Комиссия с продаж — 0%.</span>
          </div>
        </div>
      </footer>

      {showModal && <ApplicationModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
