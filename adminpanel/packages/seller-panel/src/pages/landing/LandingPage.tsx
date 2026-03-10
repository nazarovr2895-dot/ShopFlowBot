import { useState, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ShoppingBag, BarChart3, Heart,
  ClipboardList, Shield, Zap, ArrowRight,
  CheckCircle2, Store, Settings, TrendingUp,
  Users, Globe, Megaphone, Truck, HelpCircle, ChevronDown,
} from 'lucide-react';
import { ApplicationModal } from './ApplicationModal';
import { DashboardCarousel } from './components/DashboardCarousel';
import { PricingCalculator } from './components/PricingCalculator';
import { DecorativeBlob } from './components/DecorativeBlob';
import { useScrollReveal } from './hooks/useScrollReveal';
import { useAnimatedCounter } from './hooks/useAnimatedCounter';
import './LandingPage.css';
import './PricingPage.css';

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

const pricingExamples = [
  { sales: 80000, cost: 2000, label: 'Небольшой магазин', note: 'Только базовая подписка' },
  { sales: 200000, cost: 4000, label: 'Средний магазин', note: '2 000 + 1% × 200 000' },
  { sales: 500000, cost: 7000, label: 'Крупный магазин', note: '2 000 + 1% × 500 000' },
];

const pricingIncluded = [
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
    a: 'Нет, это не комиссия. Все деньги от покупателей поступают напрямую на ваш счёт через YooKassa. 1% от суммы продаж свыше 100 000 ₽ добавляется к стоимости подписки на следующий месяц.',
  },
  {
    q: 'Когда начинать платить за подписку?',
    a: 'После одобрения заявки и настройки магазина у вас есть пробный период. Подписка оплачивается через панель управления.',
  },
  {
    q: 'Как рассчитывается стоимость подписки?',
    a: 'Базовая подписка — 2 000 ₽/мес. Если оборот за предыдущие 30 дней превышает 100 000 ₽, к базовой цене добавляется 1% от суммы продаж.',
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
  const [menuOpen, setMenuOpen] = useState(false);
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
          <div className="landing-header__actions">
            <a href="#pricing" className="landing-header__link">Тарифы</a>
            <button className="landing-btn landing-btn--ghost" onClick={() => navigate('/login')}>
              Войти
            </button>
            <button className="landing-btn landing-btn--primary" onClick={() => setShowModal(true)}>
              Открыть магазин
            </button>
          </div>
          <button
            className={`landing-header__burger${menuOpen ? ' landing-header__burger--open' : ''}`}
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Меню"
          >
            <span />
          </button>
        </div>
      </header>
      <div className={`landing-header__mobile-menu${menuOpen ? ' landing-header__mobile-menu--open' : ''}`}>
        <a href="#pricing" className="landing-header__link" onClick={() => setMenuOpen(false)}>Тарифы</a>
        <button className="landing-btn landing-btn--ghost" onClick={() => { navigate('/login'); setMenuOpen(false); }}>
          Войти
        </button>
        <button className="landing-btn landing-btn--primary" onClick={() => { setShowModal(true); setMenuOpen(false); }}>
          Открыть магазин
        </button>
      </div>

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
              <a href="#pricing" className="landing-btn landing-btn--outline landing-btn--lg">
                Тарифы
              </a>
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
            <DashboardCarousel />
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
                Готовая платформа для&nbsp;Telegram и&nbsp;российского рынка.
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

      {/* ─── Why flurai vs DIY ─── */}
      <section className="landing-section landing-section--alt" ref={reveal}>
        <div className="landing-container">
          <div className="landing-section__header landing-reveal">
            <h2 className="landing-section__title">Почему flurai <img src="/favicon.ico" alt="" className="landing-inline-logo" /> а&nbsp;не&nbsp;свой сайт</h2>
            <p className="landing-section__subtitle">
              Собственный интернет-магазин с Mini App — это дорого, долго и требует постоянного обслуживания
            </p>
          </div>
          <div className="landing-comparison landing-reveal landing-reveal--d2">
            <div className="landing-comparison__col landing-comparison__col--diy">
              <div className="landing-comparison__header landing-comparison__header--diy">
                Своё решение
              </div>
              <ul className="landing-comparison__list">
                <li><span className="landing-comparison__label">Разработка сайта</span><span className="landing-comparison__value">от 300 000 ₽</span></li>
                <li><span className="landing-comparison__label">Telegram Mini App</span><span className="landing-comparison__value">от 500 000 ₽</span></li>
                <li><span className="landing-comparison__label">Хостинг и серверы</span><span className="landing-comparison__value">от 5 000 ₽/мес</span></li>
                <li><span className="landing-comparison__label">Платёжная интеграция</span><span className="landing-comparison__value">от 50 000 ₽</span></li>
                <li><span className="landing-comparison__label">CRM + лояльность</span><span className="landing-comparison__value">от 3 000 ₽/мес</span></li>
                <li><span className="landing-comparison__label">Техподдержка и обновления</span><span className="landing-comparison__value">от 30 000 ₽/мес</span></li>
              </ul>
              <div className="landing-comparison__total landing-comparison__total--diy">
                <div>Итого за первый год</div>
                <div className="landing-comparison__total-value">~1 000 000 ₽+</div>
                <div className="landing-comparison__total-time">Срок запуска: 3-6 месяцев</div>
              </div>
            </div>
            <div className="landing-comparison__col landing-comparison__col--flurai">
              <div className="landing-comparison__header landing-comparison__header--flurai">
                flurai <img src="/favicon.ico" alt="" className="landing-inline-logo" />
              </div>
              <ul className="landing-comparison__list">
                <li><span className="landing-comparison__label">Telegram + сайт</span><span className="landing-comparison__value">готов за 5 минут</span></li>
                <li><span className="landing-comparison__label">Каталог, заказы, доставка</span><span className="landing-comparison__value">из коробки</span></li>
                <li><span className="landing-comparison__label">CRM + лояльность + аналитика</span><span className="landing-comparison__value">включено</span></li>
                <li><span className="landing-comparison__label">Обновления</span><span className="landing-comparison__value">автоматически</span></li>
                <li><span className="landing-comparison__label">Поддержка</span><span className="landing-comparison__value">включена</span></li>
                <li><span className="landing-comparison__label">Комиссия с продаж</span><span className="landing-comparison__value">0%</span></li>
              </ul>
              <div className="landing-comparison__total landing-comparison__total--flurai">
                <div>Подписка</div>
                <div className="landing-comparison__total-value">от 2 000 ₽/мес</div>
                <div className="landing-comparison__total-time">Срок запуска: 1 день</div>
              </div>
            </div>
          </div>
          <div className="landing-comparison__callout landing-reveal landing-reveal--d3">
            Всё включено — и работает уже сегодня
          </div>
        </div>
      </section>

      {/* ─── Why business needs a website ─── */}
      <section className="landing-section" ref={reveal}>
        <div className="landing-container">
          <div className="landing-section__header landing-reveal">
            <h2 className="landing-section__title">Зачем бизнесу свой магазин онлайн</h2>
            <p className="landing-section__subtitle">
              В 2026 году без онлайн-присутствия бизнес теряет деньги каждый день
            </p>
          </div>
          <div className="landing-why-online landing-reveal landing-reveal--d2">
            <div className="landing-why-online__card">
              <div className="landing-why-online__num">01</div>
              <h3>E-commerce растёт на 25-30% в год</h3>
              <p>
                По данным АКИТ, объём онлайн-торговли в&nbsp;России превысил 7,8 трлн ₽.
                Бизнес без интернет-магазина теряет клиентов тем, кто уже продаёт онлайн.
              </p>
            </div>
            <div className="landing-why-online__card">
              <div className="landing-why-online__num">02</div>
              <h3>Маркетплейсы забирают вашу маржу</h3>
              <p>
                Комиссии на Wildberries и Ozon составляют 15-30% от продажи. Свой магазин — это прямые
                продажи без посредников. Вы сами контролируете цены и&nbsp;клиентскую базу.
              </p>
            </div>
            <div className="landing-why-online__card">
              <div className="landing-why-online__num">03</div>
              <h3>Покупатели ушли в интернет</h3>
              <p>
                Более 70% россиян покупают через интернет. Telegram стал второй по&nbsp;популярности платформой
                для бизнеса — ваши клиенты уже&nbsp;там.
              </p>
            </div>
            <div className="landing-why-online__card">
              <div className="landing-why-online__num">04</div>
              <h3>Налоговый контроль ужесточается</h3>
              <p>
                ФНС автоматически отслеживает онлайн-транзакции. Легальный магазин
                с&nbsp;онлайн-кассой по&nbsp;54-ФЗ — это прозрачность и&nbsp;защита от&nbsp;штрафов.
              </p>
            </div>
            <div className="landing-why-online__card">
              <div className="landing-why-online__num">05</div>
              <h3>Конкуренция не ждёт</h3>
              <p>
                Каждый месяц без онлайн-продаж — это клиенты, которых получают ваши конкуренты.
                Запуск магазина на&nbsp;flurai занимает один день, а&nbsp;не&nbsp;полгода.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── What is Mini App ─── */}
      <section className="landing-section" ref={reveal}>
        <div className="landing-container">
          <div className="landing-section__header landing-reveal">
            <h2 className="landing-section__title">Что такое Mini App в&nbsp;Telegram</h2>
            <p className="landing-section__subtitle">
              Ваш магазин — прямо внутри мессенджера, без скачивания приложений
            </p>
          </div>
          <div className="landing-miniapp-explainer landing-reveal landing-reveal--d2">
            <div className="landing-miniapp-step">
              <div className="landing-miniapp-step__visual">
                <div className="landing-miniapp-chat">
                  <div className="landing-miniapp-chat__bubble">Привет! Нажмите кнопку, чтобы открыть магазин</div>
                  <div className="landing-miniapp-chat__btn">Открыть магазин</div>
                </div>
              </div>
              <div className="landing-miniapp-step__num">1</div>
              <h3>Покупатель открывает чат</h3>
              <p>Нажимает кнопку в чате бота — и магазин открывается прямо внутри Telegram</p>
            </div>
            <div className="landing-miniapp-step">
              <div className="landing-miniapp-step__visual">
                <div className="landing-miniapp-window">
                  <div className="landing-miniapp-window__bar" />
                  <div className="landing-miniapp-window__content">
                    <div className="landing-miniapp-window__card" />
                    <div className="landing-miniapp-window__card" />
                    <div className="landing-miniapp-window__btn">В корзину</div>
                  </div>
                </div>
              </div>
              <div className="landing-miniapp-step__num">2</div>
              <h3>Выбирает товары</h3>
              <p>Полноценный каталог с фото, ценами, категориями — как в обычном интернет-магазине</p>
            </div>
            <div className="landing-miniapp-step">
              <div className="landing-miniapp-step__visual">
                <div className="landing-miniapp-done">
                  <div className="landing-miniapp-done__check">✓</div>
                  <div className="landing-miniapp-done__text">Заказ оформлен!</div>
                </div>
              </div>
              <div className="landing-miniapp-step__num">3</div>
              <h3>Оплачивает и получает</h3>
              <p>Онлайн-оплата, уведомления о статусе — всё не выходя из мессенджера</p>
            </div>
          </div>
          <p className="landing-miniapp-note landing-reveal landing-reveal--d3">
            950+ млн пользователей Telegram — ваши потенциальные клиенты. Не нужно скачивать приложение, не нужно регистрироваться.
          </p>
        </div>
      </section>

      {/* ─── Steps ─── */}
      <section className="landing-section landing-section--alt" ref={reveal}>
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
            <h2 className="landing-section__title">Почему flurai <img src="/favicon.ico" alt="" className="landing-inline-logo" /></h2>
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

      {/* ─── Pricing ─── */}
      <section id="pricing" className="landing-section" ref={reveal}>
        <div className="landing-container">
          <div className="landing-section__header landing-reveal">
            <h2 className="landing-section__title">Прозрачные тарифы</h2>
            <p className="landing-section__subtitle">
              Простая модель: фиксированная подписка + формирование стоимости по объёму продаж. Никаких скрытых комиссий.
            </p>
          </div>
          <div className="landing-reveal landing-reveal--d2">
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
                        К базовой подписке добавляется 1% от суммы продаж. <strong>Деньги от покупателей поступают напрямую на ваш счёт</strong> — мы ничего не удерживаем.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="pricing-callout">
                  <strong>Важно:</strong> 1% — это не комиссия с продаж. Это часть формирования стоимости подписки.
                  Вся выручка поступает на ваш счёт через YooKassa без удержаний.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Pricing examples ─── */}
      <section className="landing-section landing-section--alt" ref={reveal}>
        <div className="landing-container">
          <div className="landing-section__header landing-reveal">
            <h2 className="landing-section__title">Примеры расчёта</h2>
          </div>
          <div className="pricing-examples landing-reveal landing-reveal--d2">
            {pricingExamples.map((ex) => (
              <div key={ex.sales} className="pricing-example-card">
                <div className="pricing-example-card__label">{ex.label}</div>
                <div className="pricing-example-card__sales">Продажи: {ex.sales.toLocaleString('ru-RU')} ₽/мес</div>
                <div className="pricing-example-card__cost">{ex.cost.toLocaleString('ru-RU')} ₽<span>/мес</span></div>
                <div className="pricing-example-card__note">{ex.note}</div>
              </div>
            ))}
          </div>
          <div className="landing-reveal landing-reveal--d3" style={{ marginTop: 40 }}>
            <PricingCalculator />
          </div>
        </div>
      </section>

      {/* ─── What's included ─── */}
      <section className="landing-section" ref={reveal}>
        <div className="landing-container">
          <div className="landing-section__header landing-reveal">
            <h2 className="landing-section__title">Что входит в подписку</h2>
            <p className="landing-section__subtitle">Все инструменты для управления магазином — без ограничений</p>
          </div>
          <div className="pricing-included-grid landing-reveal landing-reveal--d2">
            {pricingIncluded.map((item) => (
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

      {/* ─── FAQ ─── */}
      <section className="landing-section landing-section--alt" ref={reveal}>
        <div className="landing-container">
          <div className="landing-section__header landing-reveal">
            <h2 className="landing-section__title">Частые вопросы</h2>
          </div>
          <div className="pricing-faq landing-reveal landing-reveal--d2">
            {faqs.map((faq) => (
              <FaqItem key={faq.q} q={faq.q} a={faq.a} />
            ))}
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
              <a href="#pricing" className="landing-footer__link">Тарифы</a>
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
