import { useState, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ShoppingBag, BarChart3, Heart,
  ClipboardList, Shield, Zap, ArrowRight,
  CheckCircle2, Store, Settings, TrendingUp,
  Users, Globe, Megaphone,
} from 'lucide-react';
import { ApplicationModal } from './ApplicationModal';
import { PhoneMockup } from './components/PhoneMockup';
import { DashboardPreview } from './components/DashboardPreview';
import { DecorativeBlob } from './components/DecorativeBlob';
import { useScrollReveal } from './hooks/useScrollReveal';
import { useAnimatedCounter } from './hooks/useAnimatedCounter';
import './LandingPage.css';

const features = [
  {
    icon: ShoppingBag,
    title: 'Каталог и предзаказы',
    desc: 'Управление ассортиментом с фото, ценами, остатками. Каталог предзаказов с гибким расписанием: по дням недели, интервалу или точным датам. Скидки за ранний заказ.',
  },
  {
    icon: Heart,
    title: 'Программа лояльности',
    desc: 'Баллы за каждую покупку — процент от суммы. Тиерная система: Бронза, Серебро, Золото с растущим кешбэком. Настройте срок сгорания баллов и максимальную скидку.',
  },
  {
    icon: Users,
    title: 'Клиентская база',
    desc: 'Все покупатели и подписчики — в одной CRM. Видите историю заказов, сумму покупок, баллы лояльности. RFM-сегменты: VIP, постоянные, новые, уходящие — работайте с каждой группой.',
  },
  {
    icon: ClipboardList,
    title: 'Заказы и доставка',
    desc: 'Приём заказов 24/7, управление доставкой с зонами и слотами, автоматические уведомления покупателям на каждом этапе.',
  },
  {
    icon: BarChart3,
    title: 'Аналитика продаж',
    desc: 'Подробная статистика: выручка, конверсия, популярные товары, динамика по дням. Понимайте своих покупателей и принимайте решения на основе данных.',
  },
  {
    icon: Shield,
    title: 'Приём оплаты',
    desc: 'Подключите свой YooKassa аккаунт — оплата поступает напрямую на ваш счёт. Мы не трогаем ваши деньги.',
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
    desc: 'Покупатели заказывают через Telegram или сайт. Растите базу подписчиков и продажи.',
  },
];

const advantages = [
  'Это ваш магазин, не маркетплейс — вы владеете клиентской базой и контролируете бренд',
  'Магазин работает и в Telegram, и как полноценный сайт — покупатели приходят отовсюду',
  'Оплата поступает напрямую на ваш счёт — мы не трогаем ваши деньги',
  'Система подписчиков: покупатели подписываются на ваш магазин и получают обновления',
  'Встроенная CRM с программой лояльности — видите каждого клиента и его историю',
  'Предзаказы со скидками за ранний заказ — планируйте спрос заранее',
  'Уведомления о заказах в Telegram — ничего не пропустите',
  'Детальная аналитика продаж и поведения покупателей',
];

function AnimatedStat({ target, label, suffix = '' }: { target: number; label: string; suffix?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const value = useAnimatedCounter(target, visible);

  const observerCallback = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.5 }
    );
    obs.observe(el);
  }, []);

  return (
    <div className="landing-hero__stat" ref={(el) => { (ref as any).current = el; observerCallback(el); }}>
      <strong>{suffix}{value.toLocaleString('ru-RU')}</strong>
      <span>{label}</span>
    </div>
  );
}

export function LandingPage() {
  const [showModal, setShowModal] = useState(false);
  const navigate = useNavigate();
  const reveal = useScrollReveal();

  return (
    <div className="landing" data-theme="light">
      {/* ─── Header ─── */}
      <header className="landing-header">
        <div className="landing-container landing-header__inner">
          <div className="landing-header__brand">
            <img src="/android-chrome-192x192.png" alt="flurai" width={32} height={32} />
            <span className="landing-header__name">flurai</span>
          </div>
          <nav className="landing-header__nav">
            <Link to="/pricing" className="landing-header__link">Тарифы</Link>
          </nav>
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

      {/* ─── Hero ─── */}
      <section className="landing-hero">
        <div className="landing-hero__bg">
          <DecorativeBlob color1="#6366f1" color2="#a78bfa" size={500} top="-100px" left="-150px" opacity={0.15} blur={100} />
          <DecorativeBlob color1="#8b5cf6" color2="#ec4899" size={400} top="50px" right="-100px" opacity={0.1} blur={100} />
          <div className="landing-hero__dot-grid" aria-hidden="true" />
        </div>
        <div className="landing-container landing-hero__grid">
          <div className="landing-hero__content">
            <div className="landing-hero__badge">
              <Zap size={14} />
              <span>Telegram Mini App + Веб-сайт</span>
            </div>
            <h1 className="landing-hero__title">
              Ваш собственный<br />интернет-магазин
            </h1>
            <p className="landing-hero__subtitle">
              Не маркетплейс — а ваша платформа. Магазин в&nbsp;Telegram и&nbsp;на&nbsp;сайте,
              каталог с&nbsp;предзаказами, программа лояльности, CRM с&nbsp;подписчиками и&nbsp;аналитика.
              Вы владеете клиентской базой и&nbsp;контролируете бренд.
            </p>
            <div className="landing-hero__cta">
              <button className="landing-btn landing-btn--primary landing-btn--lg" onClick={() => setShowModal(true)}>
                Открыть магазин
                <ArrowRight size={18} />
              </button>
              <Link to="/pricing" className="landing-btn landing-btn--outline landing-btn--lg">
                Тарифы
              </Link>
            </div>
            <div className="landing-hero__stats">
              <AnimatedStat target={0} label="комиссия с продаж" suffix="" />
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
          <div className="landing-hero__visual">
            <PhoneMockup />
          </div>
        </div>
      </section>

      {/* ─── Features ─── */}
      <section className="landing-section" ref={reveal}>
        <div className="landing-container">
          <div className="landing-section__header landing-reveal">
            <h2 className="landing-section__title">Всё для вашего бизнеса</h2>
            <p className="landing-section__subtitle">
              Инструменты, которые помогут вам продавать больше и управлять магазином эффективнее
            </p>
          </div>
          <div className="landing-features-grid">
            {features.map((f, i) => (
              <div key={f.title} className={`landing-feature-card landing-reveal landing-reveal--d${i + 1}`}>
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

      {/* ─── Dashboard preview ─── */}
      <section className="landing-section landing-section--alt" ref={reveal}>
        <div className="landing-container">
          <div className="landing-section__header landing-reveal">
            <h2 className="landing-section__title">Мощная панель управления</h2>
            <p className="landing-section__subtitle">
              Всё что нужно для управления магазином — в одном месте
            </p>
          </div>
          <div className="landing-reveal landing-reveal--d2">
            <DashboardPreview />
          </div>
        </div>
      </section>

      {/* ─── Platform philosophy ─── */}
      <section className="landing-section" ref={reveal}>
        <div className="landing-container">
          <div className="landing-section__header landing-reveal">
            <h2 className="landing-section__title">Не маркетплейс, а ваш магазин</h2>
            <p className="landing-section__subtitle">
              flurai — это не площадка, где вы конкурируете с сотнями продавцов за внимание покупателей
            </p>
          </div>
          <div className="landing-philosophy landing-reveal landing-reveal--d2">
            <div className="landing-philosophy__card landing-philosophy__card--main">
              <div className="landing-philosophy__icon">
                <Store size={32} />
              </div>
              <h3>Ваш бренд, ваши клиенты</h3>
              <p>
                Мы создаём инфраструктуру — вы создаёте магазин. Покупатели подписываются именно на&nbsp;вас,
                а не на платформу. Клиентская база, история заказов, программа лояльности — всё это принадлежит вам.
                Как Yandex Kit или Shopify, но&nbsp;для&nbsp;Telegram и&nbsp;российского рынка.
              </p>
            </div>
            <div className="landing-philosophy__grid">
              <div className="landing-philosophy__card">
                <div className="landing-philosophy__icon">
                  <Globe size={24} />
                </div>
                <h3>Telegram + Сайт</h3>
                <p>
                  Ваш магазин — это не только Mini App в&nbsp;Telegram. Это полноценный сайт,
                  доступный всем. Покупатели приходят из любого канала: мессенджер, поиск, соцсети.
                </p>
              </div>
              <div className="landing-philosophy__card">
                <div className="landing-philosophy__icon">
                  <Users size={24} />
                </div>
                <h3>Подписчики и CRM</h3>
                <p>
                  Покупатели подписываются на ваш магазин. Вы видите каждого клиента: его заказы, предпочтения,
                  баллы лояльности, сегмент. Это ваша аудитория, с которой можно работать напрямую.
                </p>
              </div>
              <div className="landing-philosophy__card">
                <div className="landing-philosophy__icon">
                  <Megaphone size={24} />
                </div>
                <h3>Маркетинг и продвижение</h3>
                <p>
                  Вы продвигаете свой магазин сами — и получаете 100% клиентов. А со временем
                  маркетинговые кампании платформы принесут дополнительные продажи без усилий с вашей стороны.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Steps ─── */}
      <section className="landing-section" ref={reveal}>
        <div className="landing-container">
          <div className="landing-section__header landing-reveal">
            <h2 className="landing-section__title">Как начать продавать</h2>
            <p className="landing-section__subtitle">
              Три простых шага — и ваш магазин готов к работе
            </p>
          </div>
          <div className="landing-steps">
            {steps.map((s, i) => (
              <div key={s.num} className={`landing-step landing-reveal landing-reveal--d${i + 1}`}>
                <div className="landing-step__num">{s.num}</div>
                <div className="landing-step__icon">
                  <s.icon size={28} />
                </div>
                <h3 className="landing-step__title">{s.title}</h3>
                <p className="landing-step__desc">{s.desc}</p>
                {i < steps.length - 1 && <div className="landing-step__connector" aria-hidden="true" />}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Advantages ─── */}
      <section className="landing-section landing-section--alt" ref={reveal}>
        <div className="landing-container">
          <div className="landing-section__header landing-reveal">
            <h2 className="landing-section__title">Почему flurai</h2>
          </div>
          <div className="landing-advantages">
            {advantages.map((text, i) => (
              <div key={i} className={`landing-advantage landing-reveal landing-reveal--d${i + 1}`}>
                <CheckCircle2 size={20} className="landing-advantage__icon" />
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Pricing teaser ─── */}
      <section className="landing-section" ref={reveal}>
        <div className="landing-container">
          <div className="landing-section__header landing-reveal">
            <h2 className="landing-section__title">Прозрачные тарифы</h2>
            <p className="landing-section__subtitle">Никаких скрытых комиссий — вы знаете, сколько платите</p>
          </div>
          <div className="landing-pricing-teaser landing-reveal landing-reveal--d2">
            <div className="landing-pricing-teaser__card">
              <div className="landing-pricing-teaser__value">2 000 ₽</div>
              <div className="landing-pricing-teaser__label">базовая подписка в месяц</div>
            </div>
            <div className="landing-pricing-teaser__card">
              <div className="landing-pricing-teaser__value">0%</div>
              <div className="landing-pricing-teaser__label">комиссия с ваших продаж</div>
            </div>
            <div className="landing-pricing-teaser__card">
              <div className="landing-pricing-teaser__value">100%</div>
              <div className="landing-pricing-teaser__label">выручка — ваша</div>
            </div>
          </div>
          <div className="landing-pricing-teaser__action landing-reveal landing-reveal--d3">
            <Link to="/pricing" className="landing-btn landing-btn--outline">
              Подробнее о тарифах
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="landing-cta-section">
        <div className="landing-container">
          <div className="landing-cta-block">
            <div className="landing-cta-block__shapes" aria-hidden="true">
              <div className="landing-cta-shape landing-cta-shape--1" />
              <div className="landing-cta-shape landing-cta-shape--2" />
              <div className="landing-cta-shape landing-cta-shape--3" />
            </div>
            <h2>Готовы начать?</h2>
            <p>Оставьте заявку — мы поможем запустить ваш магазин в Telegram и&nbsp;на&nbsp;сайте</p>
            <button className="landing-btn landing-btn--white landing-btn--lg" onClick={() => setShowModal(true)}>
              Открыть магазин
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="landing-footer">
        <div className="landing-container">
          <div className="landing-footer__grid">
            <div className="landing-footer__col">
              <div className="landing-footer__brand">
                <img src="/android-chrome-192x192.png" alt="flurai" width={24} height={24} />
                <span>flurai</span>
              </div>
              <p className="landing-footer__desc">
                Ваш собственный магазин в&nbsp;Telegram и&nbsp;на&nbsp;сайте. Каталог, предзаказы, лояльность, CRM, аналитика.
              </p>
            </div>
            <div className="landing-footer__col">
              <h4 className="landing-footer__col-title">Платформа</h4>
              <Link to="/pricing" className="landing-footer__link">Тарифы</Link>
              <button className="landing-footer__link" onClick={() => setShowModal(true)}>Открыть магазин</button>
              <button className="landing-footer__link" onClick={() => navigate('/login')}>Войти</button>
            </div>
            <div className="landing-footer__col">
              <h4 className="landing-footer__col-title">Документы</h4>
              <Link to="/legal/offer" className="landing-footer__link">Пользовательское соглашение</Link>
              <Link to="/legal/privacy" className="landing-footer__link">Политика конфиденциальности</Link>
            </div>
          </div>
          <div className="landing-footer__bottom">
            <span className="landing-footer__copy">&copy; {new Date().getFullYear()} flurai</span>
            <span className="landing-footer__note">
              * Платформа взимает фиксированную абонентскую плату. Комиссия с продаж — 0%.
            </span>
          </div>
        </div>
      </footer>

      {showModal && (
        <ApplicationModal onClose={() => setShowModal(false)} />
      )}
    </div>
  );
}
