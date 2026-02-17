import { useEffect, useRef, useState } from 'react';
import { getMe, updateLimits, updateDefaultLimit, closeForToday, updateWeeklySchedule, updateMe, getBannerImageUrl, uploadBannerPhoto } from '../../api/sellerClient';
import type { SellerMe } from '../../api/sellerClient';
import { useToast, useConfirm } from '../../components/ui';
import './SellerShop.css';

const WEEKDAYS = [
  { value: 0, label: 'Понедельник' },
  { value: 1, label: 'Вторник' },
  { value: 2, label: 'Среда' },
  { value: 3, label: 'Четверг' },
  { value: 4, label: 'Пятница' },
  { value: 5, label: 'Суббота' },
  { value: 6, label: 'Воскресенье' },
];

export function SellerShop() {
  const toast = useToast();
  const confirm = useConfirm();
  const [me, setMe] = useState<SellerMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [limitValue, setLimitValue] = useState('');
  const [limitSaving, setLimitSaving] = useState(false);
  const [defaultLimitValue, setDefaultLimitValue] = useState('');
  const [defaultLimitSaving, setDefaultLimitSaving] = useState(false);
  const [closingForToday, setClosingForToday] = useState(false);
  // Weekly schedule
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [weeklySchedule, setWeeklySchedule] = useState<Record<string, string>>({});
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [hashtagsValue, setHashtagsValue] = useState('');
  const [hashtagsSaving, setHashtagsSaving] = useState(false);
  const [preorderEnabled, setPreorderEnabled] = useState(false);
  const [preorderScheduleType, setPreorderScheduleType] = useState<'weekly' | 'interval_days' | 'custom_dates'>('weekly');
  const [preorderWeekday, setPreorderWeekday] = useState(0);
  const [preorderIntervalDays, setPreorderIntervalDays] = useState(10);
  const [preorderBaseDate, setPreorderBaseDate] = useState('');
  const [preorderCustomDates, setPreorderCustomDates] = useState<string[]>([]);
  const [newCustomDate, setNewCustomDate] = useState('');
  const [preorderMinLeadDays, setPreorderMinLeadDays] = useState(2);
  const [preorderMaxPerDate, setPreorderMaxPerDate] = useState('');
  const [preorderDiscountPercent, setPreorderDiscountPercent] = useState('');
  const [preorderDiscountMinDays, setPreorderDiscountMinDays] = useState(7);
  const [preorderSaving, setPreorderSaving] = useState(false);
  // Shop settings
  const [shopName, setShopName] = useState('');
  const [description, setDescription] = useState('');
  const [deliveryType, setDeliveryType] = useState('');
  const [deliveryPrice, setDeliveryPrice] = useState('');
  const [addressName, setAddressName] = useState('');
  const [mapUrl, setMapUrl] = useState('');
  const [shopSettingsSaving, setShopSettingsSaving] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [bannerRemoving, setBannerRemoving] = useState(false);
  const bannerFileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const meData = await getMe();
      setMe(meData);
      setLimitValue(String(meData?.max_orders ?? ''));
      setDefaultLimitValue(meData?.default_daily_limit ? String(meData.default_daily_limit) : '');
      setHashtagsValue(meData?.hashtags ?? '');
      setPreorderEnabled(meData?.preorder_enabled ?? false);
      setPreorderScheduleType((meData?.preorder_schedule_type as 'weekly' | 'interval_days' | 'custom_dates') || 'weekly');
      setPreorderWeekday(meData?.preorder_weekday ?? 0);
      setPreorderIntervalDays(meData?.preorder_interval_days ?? 10);
      setPreorderBaseDate(meData?.preorder_base_date ?? '');
      setPreorderCustomDates(meData?.preorder_custom_dates ?? []);
      setPreorderMinLeadDays(meData?.preorder_min_lead_days ?? 2);
      setPreorderMaxPerDate(meData?.preorder_max_per_date != null ? String(meData.preorder_max_per_date) : '');
      setPreorderDiscountPercent(meData?.preorder_discount_percent ? String(meData.preorder_discount_percent) : '');
      setPreorderDiscountMinDays(meData?.preorder_discount_min_days ?? 7);
      // Weekly schedule
      const ws = meData?.weekly_schedule;
      if (ws && typeof ws === 'object' && Object.keys(ws).length > 0) {
        setScheduleEnabled(true);
        const mapped: Record<string, string> = {};
        for (const [k, v] of Object.entries(ws)) mapped[k] = String(v);
        setWeeklySchedule(mapped);
      } else {
        setScheduleEnabled(false);
        setWeeklySchedule({});
      }
      // Shop settings
      setShopName(meData?.shop_name ?? '');
      setDescription(meData?.description ?? '');
      setDeliveryType(meData?.delivery_type ?? '');
      setDeliveryPrice(String(meData?.delivery_price ?? ''));
      setAddressName(meData?.address_name ?? '');
      setMapUrl(meData?.map_url ?? '');
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSaveHashtags = async () => {
    setHashtagsSaving(true);
    try {
      await updateMe({ hashtags: hashtagsValue.trim() || '' });
      setMe((m) => m ? { ...m, hashtags: hashtagsValue.trim() || '' } : null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setHashtagsSaving(false);
    }
  };

  const handleSaveLimit = async () => {
    const num = parseInt(limitValue, 10);
    if (isNaN(num) || num < 1 || num > 100) {
      toast.warning('Введите число от 1 до 100');
      return;
    }
    setLimitSaving(true);
    try {
      await updateLimits(num);
      setMe((m) => m ? { ...m, max_orders: num } : null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLimitSaving(false);
    }
  };

  const handleSaveDefaultLimit = async () => {
    const raw = defaultLimitValue.trim();
    const num = raw === '' ? 0 : parseInt(raw, 10);
    if (isNaN(num) || num < 0 || num > 100) {
      toast.warning('Введите число от 0 до 100 (0 или пусто = отключить)');
      return;
    }
    setDefaultLimitSaving(true);
    try {
      await updateDefaultLimit(num);
      setMe((m) => m ? { ...m, default_daily_limit: num || 0 } : null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setDefaultLimitSaving(false);
    }
  };

  const handleCloseForToday = async () => {
    if (!await confirm({ message: 'Закрыть магазин на сегодня? Новые заказы не будут приниматься до 6:00 (МСК).' })) return;
    setClosingForToday(true);
    try {
      await closeForToday();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setClosingForToday(false);
    }
  };

  const handleSaveSchedule = async () => {
    if (!scheduleEnabled) {
      setScheduleSaving(true);
      try {
        await updateWeeklySchedule({});
        setWeeklySchedule({});
        await load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Ошибка');
      } finally {
        setScheduleSaving(false);
      }
      return;
    }
    const schedule: Record<string, number> = {};
    for (const [k, v] of Object.entries(weeklySchedule)) {
      const num = parseInt(v, 10);
      if (!isNaN(num) && num > 0) schedule[k] = num;
    }
    if (Object.keys(schedule).length === 0) {
      toast.warning('Задайте лимит хотя бы для одного дня');
      return;
    }
    setScheduleSaving(true);
    try {
      await updateWeeklySchedule(schedule);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setScheduleSaving(false);
    }
  };

  const handleSavePreorder = async () => {
    if (preorderScheduleType === 'interval_days' && (!preorderBaseDate || preorderIntervalDays < 1)) {
      toast.warning('Укажите базовую дату и интервал в днях');
      return;
    }
    if (preorderScheduleType === 'custom_dates' && preorderCustomDates.length === 0) {
      toast.warning('Выберите хотя бы одну дату');
      return;
    }
    setPreorderSaving(true);
    try {
      const maxPerDate = preorderMaxPerDate ? parseInt(preorderMaxPerDate, 10) : null;
      const discountPct = preorderDiscountPercent ? parseFloat(preorderDiscountPercent) : 0;
      await updateMe({
        preorder_enabled: preorderEnabled,
        preorder_schedule_type: preorderEnabled ? preorderScheduleType : undefined,
        preorder_weekday: preorderEnabled && preorderScheduleType === 'weekly' ? preorderWeekday : undefined,
        preorder_interval_days: preorderEnabled && preorderScheduleType === 'interval_days' ? preorderIntervalDays : undefined,
        preorder_base_date: preorderEnabled && preorderScheduleType === 'interval_days' && preorderBaseDate ? preorderBaseDate : null,
        preorder_custom_dates: preorderEnabled && preorderScheduleType === 'custom_dates' && preorderCustomDates.length > 0 ? preorderCustomDates : null,
        preorder_min_lead_days: preorderEnabled ? preorderMinLeadDays : undefined,
        preorder_max_per_date: preorderEnabled ? maxPerDate : null,
        preorder_discount_percent: preorderEnabled ? discountPct : undefined,
        preorder_discount_min_days: preorderEnabled && discountPct > 0 ? preorderDiscountMinDays : undefined,
      });
      const meData = await getMe();
      setMe(meData);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setPreorderSaving(false);
    }
  };

  const addCustomDate = () => {
    if (newCustomDate && !preorderCustomDates.includes(newCustomDate)) {
      setPreorderCustomDates([...preorderCustomDates, newCustomDate].sort());
      setNewCustomDate('');
    }
  };

  const removeCustomDate = (dateToRemove: string) => {
    setPreorderCustomDates(preorderCustomDates.filter(d => d !== dateToRemove));
  };

  const handleSaveShopSettings = async () => {
    setShopSettingsSaving(true);
    try {
      await updateMe({
        shop_name: shopName.trim() || undefined,
        description: description.trim() || undefined,
        delivery_type: deliveryType.trim() || undefined,
        delivery_price: deliveryPrice ? parseFloat(deliveryPrice) : undefined,
        address_name: addressName.trim() || undefined,
        map_url: mapUrl.trim() || undefined,
      });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setShopSettingsSaving(false);
    }
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBannerUploading(true);
    try {
      await uploadBannerPhoto(file);
      await load();
      e.target.value = '';
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка загрузки баннера');
    } finally {
      setBannerUploading(false);
    }
  };

  const handleRemoveBanner = async () => {
    setBannerRemoving(true);
    try {
      await updateMe({ banner_url: null });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBannerRemoving(false);
    }
  };

  if (loading) {
    return (
      <div className="seller-shop-loading">
        <div className="loader" />
      </div>
    );
  }

  return (
    <div className="seller-shop-page">
      {/* Основные настройки магазина */}
      <div className="card shop-section">
        <h3>🏪 Основные настройки магазина</h3>
        <p className="section-hint">
          Укажите название магазина, описание, тип и цену доставки, а также ссылку на карту для самовывоза.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label className="section-label">Название магазина</label>
            <input
              type="text"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              placeholder="Например: Цветочный рай"
              className="form-input"
            />
          </div>
          <div>
            <label className="section-label">Описание</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Краткое описание вашего магазина"
              className="form-input"
              rows={3}
            />
          </div>
          <div>
            <label className="section-label">Тип доставки</label>
            <select
              value={deliveryType}
              onChange={(e) => setDeliveryType(e.target.value)}
              className="form-input"
            >
              <option value="">Не указано</option>
              <option value="доставка">Только доставка</option>
              <option value="самовывоз">Только самовывоз</option>
              <option value="доставка и самовывоз">Доставка и самовывоз</option>
            </select>
          </div>
          <div>
            <label className="section-label">Цена доставки (₽)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={deliveryPrice}
              onChange={(e) => setDeliveryPrice(e.target.value)}
              placeholder="0"
              className="form-input"
              style={{ width: '150px' }}
            />
          </div>
          <div>
            <label className="section-label">Название адреса</label>
            <input
              type="text"
              value={addressName}
              onChange={(e) => setAddressName(e.target.value)}
              placeholder="Например: ул. Тверская, д. 1"
              className="form-input"
            />
          </div>
          <div>
            <label className="section-label">Ссылка на карту (Google Maps и т.д.)</label>
            <input
              type="text"
              value={mapUrl}
              onChange={(e) => setMapUrl(e.target.value)}
              placeholder="https://maps.google.com/..."
              className="form-input"
            />
          </div>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleSaveShopSettings}
          disabled={shopSettingsSaving}
          style={{ marginTop: '1rem' }}
        >
          {shopSettingsSaving ? 'Сохранение...' : 'Сохранить настройки магазина'}
        </button>
      </div>

      {/* Баннер магазина */}
      <div className="card shop-section">
        <h3>🖼️ Баннер магазина</h3>
        <p className="section-hint">
          Баннер отображается в каталоге вашего магазина в Mini App (вверху страницы магазина). Рекомендуемый размер: 1200×400 px (3:1) или 1920×640 px. На узких экранах края могут обрезаться.
        </p>
        {me?.banner_url && (
          <div className="shop-banner-preview">
            <img src={getBannerImageUrl(me.banner_url) ?? ''} alt="Баннер магазина" />
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', marginTop: '0.75rem' }}>
          <input
            ref={bannerFileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleBannerUpload}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={bannerUploading}
            onClick={() => bannerFileInputRef.current?.click()}
          >
            {bannerUploading ? 'Загрузка...' : me?.banner_url ? 'Заменить баннер' : 'Загрузить баннер'}
          </button>
          {me?.banner_url && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={bannerRemoving}
              onClick={handleRemoveBanner}
            >
              {bannerRemoving ? 'Удаление...' : 'Удалить баннер'}
            </button>
          )}
        </div>
      </div>

      {/* Хештеги — в начале, чтобы покупатели находили магазин по поиску */}
      <div className="card shop-section">
        <h3>🏷️ Хештеги для поиска</h3>
        <p className="section-hint">
          Укажите через запятую ключевые слова, по которым покупатели будут находить ваш магазин в каталоге (например: букет из 101 розы, тюльпаны 25, гвоздики).
        </p>
        <input
          type="text"
          value={hashtagsValue}
          onChange={(e) => setHashtagsValue(e.target.value)}
          placeholder="букет из 101 розы, тюльпаны 25, гвоздики"
          className="form-input hashtags-input"
        />
        <button
          className="btn btn-primary"
          onClick={handleSaveHashtags}
          disabled={hashtagsSaving}
          style={{ marginTop: '0.5rem' }}
        >
          {hashtagsSaving ? 'Сохранение...' : 'Сохранить хештеги'}
        </button>
      </div>

      {/* Лимиты */}
      <div className="card shop-section">
        <h3>⚙️ Настройка лимитов</h3>

        <div style={{ marginBottom: '1rem' }}>
          <label className="section-label">Стандартный дневной лимит</label>
          <p className="section-hint">Применяется автоматически каждый день. Задайте один раз — больше не нужно обновлять каждое утро. Пусто или 0 = отключить.</p>
          <div className="limit-row">
            <input
              type="number"
              min={0}
              max={100}
              value={defaultLimitValue}
              onChange={(e) => setDefaultLimitValue(e.target.value)}
              placeholder="Не задан"
              className="form-input"
              style={{ width: '120px' }}
            />
            <button
              className="btn btn-primary"
              onClick={handleSaveDefaultLimit}
              disabled={defaultLimitSaving}
            >
              {defaultLimitSaving ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </div>

        <div>
          <label className="section-label">Лимит на сегодня (переопределение)</label>
          <p className="section-hint">Если нужно изменить лимит только на сегодня — задайте вручную. Сбросится в 6:00 (МСК), после чего снова заработает стандартный.</p>
          <div className="limit-row">
            <input
              type="number"
              min={1}
              max={100}
              value={limitValue}
              onChange={(e) => setLimitValue(e.target.value)}
              className="form-input"
              style={{ width: '100px' }}
            />
            <button
              className="btn btn-primary"
              onClick={handleSaveLimit}
              disabled={limitSaving}
            >
              {limitSaving ? 'Сохранение...' : 'Задать на сегодня'}
            </button>
          </div>
        </div>

        {me?.limit_set_for_today && (
          <p className="limit-info" style={{ marginTop: '0.75rem' }}>
            В работе сейчас: {me.orders_used_today ?? 0} / {me.max_orders ?? 0}
          </p>
        )}

        {me?.subscription_plan && (
          <p className="section-hint" style={{ marginTop: '0.75rem' }}>
            Тариф: <strong>{me.subscription_plan === 'free' ? 'Free' : me.subscription_plan === 'pro' ? 'Pro' : 'Premium'}</strong> (макс. {me.plan_limit_cap ?? '?'} заказов/день)
          </p>
        )}

        <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
          <button
            className="btn btn-danger"
            onClick={handleCloseForToday}
            disabled={closingForToday}
            style={{ background: '#e74c3c', color: '#fff', border: 'none' }}
          >
            {closingForToday ? 'Закрытие...' : 'Закрыться на сегодня'}
          </button>
          <p className="section-hint" style={{ marginTop: '0.25rem' }}>
            Мгновенно прекращает приём заказов до 6:00 (МСК) следующего дня.
          </p>
        </div>
      </div>

      {/* Расписание лимитов по дням недели */}
      <div className="card shop-section">
        <h3>📆 Расписание лимитов по дням</h3>
        <p className="section-hint">
          Задайте разный лимит для каждого дня недели. Например, в будни — 10, в выходные — 5. Приоритет: ручная установка &gt; расписание &gt; стандартный лимит.
        </p>
        <label className="shop-checkbox-label">
          <input
            type="checkbox"
            checked={scheduleEnabled}
            onChange={(e) => setScheduleEnabled(e.target.checked)}
          />
          Включить расписание
        </label>
        {scheduleEnabled && (
          <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {WEEKDAYS.map((d) => (
              <div key={d.value} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ minWidth: '120px' }}>{d.label}</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={weeklySchedule[String(d.value)] ?? ''}
                  onChange={(e) => setWeeklySchedule((prev) => ({ ...prev, [String(d.value)]: e.target.value }))}
                  placeholder="—"
                  className="form-input"
                  style={{ width: '80px' }}
                />
              </div>
            ))}
          </div>
        )}
        <button
          className="btn btn-primary"
          onClick={handleSaveSchedule}
          disabled={scheduleSaving}
          style={{ marginTop: '0.75rem' }}
        >
          {scheduleSaving ? 'Сохранение...' : 'Сохранить расписание'}
        </button>
      </div>

      {/* Предзаказы */}
      <div className="card shop-section">
        <h3>📅 Предзаказы</h3>
        <p className="section-hint">
          Включите предзаказы и укажите, когда вы закупаетесь — покупатели смогут выбирать дату поставки (например, следующий понедельник или через 10 дней).
        </p>
        <label className="shop-checkbox-label">
          <input
            type="checkbox"
            checked={preorderEnabled}
            onChange={(e) => setPreorderEnabled(e.target.checked)}
          />
          Включить предзаказы
        </label>
        {preorderEnabled && (
          <div className="preorder-schedule" style={{ marginTop: '1rem' }}>
            <label className="section-label">Тип расписания</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <label>
                <input
                  type="radio"
                  name="preorderSchedule"
                  checked={preorderScheduleType === 'weekly'}
                  onChange={() => setPreorderScheduleType('weekly')}
                />
                {' '}Каждую неделю (выберите день)
              </label>
              <label>
                <input
                  type="radio"
                  name="preorderSchedule"
                  checked={preorderScheduleType === 'interval_days'}
                  onChange={() => setPreorderScheduleType('interval_days')}
                />
                {' '}Каждые N дней
              </label>
              <label>
                <input
                  type="radio"
                  name="preorderSchedule"
                  checked={preorderScheduleType === 'custom_dates'}
                  onChange={() => setPreorderScheduleType('custom_dates')}
                />
                {' '}Выбрать даты на календаре
              </label>
            </div>
            {preorderScheduleType === 'weekly' && (
              <div style={{ marginBottom: '0.75rem' }}>
                <label className="section-label">День недели</label>
                <select
                  value={preorderWeekday}
                  onChange={(e) => setPreorderWeekday(Number(e.target.value))}
                  className="form-input"
                  style={{ maxWidth: '200px' }}
                >
                  {WEEKDAYS.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </div>
            )}
            {preorderScheduleType === 'interval_days' && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <div>
                  <label className="section-label">Интервал (дней)</label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={preorderIntervalDays}
                    onChange={(e) => setPreorderIntervalDays(Number(e.target.value) || 10)}
                    className="form-input"
                    style={{ width: '80px' }}
                  />
                </div>
                <div>
                  <label className="section-label">Базовая дата (первая поставка, ГГГГ-ММ-ДД)</label>
                  <input
                    type="date"
                    value={preorderBaseDate}
                    onChange={(e) => setPreorderBaseDate(e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>
            )}
            {preorderScheduleType === 'custom_dates' && (
              <div style={{ marginBottom: '0.75rem' }}>
                <label className="section-label">Выберите даты поставки</label>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <input
                      type="date"
                      value={newCustomDate}
                      onChange={(e) => setNewCustomDate(e.target.value)}
                      className="form-input"
                    />
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={addCustomDate}
                    disabled={!newCustomDate}
                  >
                    Добавить
                  </button>
                </div>
                {preorderCustomDates.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {preorderCustomDates.map((d) => (
                      <div
                        key={d}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          padding: '0.25rem 0.5rem',
                          background: 'var(--bg)',
                          border: '1px solid var(--border)',
                          borderRadius: '4px',
                          fontSize: '0.9rem',
                        }}
                      >
                        <span>{new Date(d).toLocaleDateString('ru-RU')}</span>
                        <button
                          type="button"
                          onClick={() => removeCustomDate(d)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '1.2rem',
                            lineHeight: 1,
                            padding: 0,
                            color: 'var(--text-muted)',
                          }}
                          aria-label="Удалить"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {/* Дополнительные настройки предзаказов */}
            <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
              <label className="section-label" style={{ fontWeight: 600, marginBottom: '0.5rem', display: 'block' }}>Дополнительные настройки</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <label className="section-label">Минимум дней до заказа</label>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={preorderMinLeadDays}
                    onChange={(e) => setPreorderMinLeadDays(Number(e.target.value) || 0)}
                    className="form-input"
                    style={{ width: '80px' }}
                  />
                  <p className="section-hint" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                    Например, 2 = заказ можно оформить минимум за 2 дня до даты
                  </p>
                </div>
                <div>
                  <label className="section-label">Лимит заказов на дату</label>
                  <input
                    type="number"
                    min={0}
                    value={preorderMaxPerDate}
                    onChange={(e) => setPreorderMaxPerDate(e.target.value)}
                    placeholder="Без ограничений"
                    className="form-input"
                    style={{ width: '120px' }}
                  />
                  <p className="section-hint" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                    Пусто = неограниченно
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginTop: '0.75rem' }}>
                <div>
                  <label className="section-label">Скидка за ранний предзаказ (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    step={0.5}
                    value={preorderDiscountPercent}
                    onChange={(e) => setPreorderDiscountPercent(e.target.value)}
                    placeholder="0"
                    className="form-input"
                    style={{ width: '80px' }}
                  />
                  <p className="section-hint" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                    Например, 10 = скидка 10% при раннем заказе
                  </p>
                </div>
                {parseFloat(preorderDiscountPercent) > 0 && (
                  <div>
                    <label className="section-label">За сколько дней скидка</label>
                    <input
                      type="number"
                      min={1}
                      max={90}
                      value={preorderDiscountMinDays}
                      onChange={(e) => setPreorderDiscountMinDays(Number(e.target.value) || 7)}
                      className="form-input"
                      style={{ width: '80px' }}
                    />
                    <p className="section-hint" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                      Скидка действует если заказ за {preorderDiscountMinDays}+ дней до даты
                    </p>
                  </div>
                )}
              </div>
            </div>
            {me?.preorder_available_dates && me.preorder_available_dates.length > 0 && (
              <p className="section-hint" style={{ marginTop: '0.5rem' }}>
                Ближайшие даты поставки: {me.preorder_available_dates.slice(0, 4).join(', ')}
              </p>
            )}
        </div>
        )}
        <button
          className="btn btn-primary"
          onClick={handleSavePreorder}
          disabled={preorderSaving}
          style={{ marginTop: '0.5rem' }}
        >
          {preorderSaving ? 'Сохранение...' : 'Сохранить настройки предзаказов'}
        </button>
      </div>

      {/* Ссылка на магазин */}
      <div className="card shop-section">
        <h3>🔗 Ссылка на магазин</h3>
        <p className="section-hint">Отправьте эту ссылку клиентам — они сразу попадут в каталог вашего магазина.</p>
        {me?.shop_link ? (
          <div className="link-box">
            <code>{me.shop_link}</code>
            <button
              className="btn btn-sm btn-secondary"
              onClick={() => {
                navigator.clipboard.writeText(me.shop_link!);
                toast.success('Ссылка скопирована');
              }}
            >
              Копировать
            </button>
          </div>
        ) : (
          <p className="empty-text">Ссылка генерируется автоматически. Обратитесь к администратору.</p>
        )}
      </div>
    </div>
  );
}
