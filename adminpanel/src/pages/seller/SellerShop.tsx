import { useEffect, useRef, useState } from 'react';
import { getMe, updateLimits, updateDefaultLimit, closeForToday, updateWeeklySchedule, updateMe, getBannerImageUrl, uploadBannerPhoto } from '../../api/sellerClient';
import type { SellerMe } from '../../api/sellerClient';
import { PageHeader, FormField, Toggle, useToast, useConfirm } from '../../components/ui';
import { Store, Image, Tag, Settings, CalendarDays, CalendarClock, Link as LinkIcon } from 'lucide-react';
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
      <PageHeader title="Настройки магазина" />

      {/* Основные настройки магазина */}
      <div className="card shop-section">
        <div className="shop-section-header">
          <Store size={20} className="shop-section-icon" />
          <h3>Основные настройки магазина</h3>
        </div>
        <p className="section-hint">
          Укажите название магазина, описание, тип и цену доставки, а также ссылку на карту для самовывоза.
        </p>
        <div className="shop-form-stack">
          <FormField label="Название магазина">
            <input
              type="text"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              placeholder="Например: Цветочный рай"
              className="form-input"
            />
          </FormField>
          <FormField label="Описание">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Краткое описание вашего магазина"
              className="form-input"
              rows={3}
            />
          </FormField>
          <FormField label="Тип доставки">
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
          </FormField>
          <FormField label="Цена доставки (₽)">
            <input
              type="number"
              min="0"
              step="0.01"
              value={deliveryPrice}
              onChange={(e) => setDeliveryPrice(e.target.value)}
              placeholder="0"
              className="form-input input-price"
            />
          </FormField>
          <FormField label="Название адреса">
            <input
              type="text"
              value={addressName}
              onChange={(e) => setAddressName(e.target.value)}
              placeholder="Например: ул. Тверская, д. 1"
              className="form-input"
            />
          </FormField>
          <FormField label="Ссылка на карту (Google Maps и т.д.)">
            <input
              type="text"
              value={mapUrl}
              onChange={(e) => setMapUrl(e.target.value)}
              placeholder="https://maps.google.com/..."
              className="form-input"
            />
          </FormField>
        </div>
        <button
          className="btn btn-primary btn-mt"
          onClick={handleSaveShopSettings}
          disabled={shopSettingsSaving}
        >
          {shopSettingsSaving ? 'Сохранение...' : 'Сохранить настройки магазина'}
        </button>
      </div>

      {/* Баннер магазина */}
      <div className="card shop-section">
        <div className="shop-section-header">
          <Image size={20} className="shop-section-icon" />
          <h3>Баннер магазина</h3>
        </div>
        <p className="section-hint">
          Баннер отображается в каталоге вашего магазина в Mini App (вверху страницы магазина). Рекомендуемый размер: 1200×400 px (3:1) или 1920×640 px. На узких экранах края могут обрезаться.
        </p>
        {me?.banner_url && (
          <div className="shop-banner-preview">
            <img src={getBannerImageUrl(me.banner_url) ?? ''} alt="Баннер магазина" />
          </div>
        )}
        <div className="shop-banner-actions">
          <input
            ref={bannerFileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleBannerUpload}
            className="shop-banner-file-input"
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

      {/* Хештеги */}
      <div className="card shop-section">
        <div className="shop-section-header">
          <Tag size={20} className="shop-section-icon" />
          <h3>Хештеги для поиска</h3>
        </div>
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
          className="btn btn-primary btn-mt-sm"
          onClick={handleSaveHashtags}
          disabled={hashtagsSaving}
        >
          {hashtagsSaving ? 'Сохранение...' : 'Сохранить хештеги'}
        </button>
      </div>

      {/* Лимиты */}
      <div className="card shop-section">
        <div className="shop-section-header">
          <Settings size={20} className="shop-section-icon" />
          <h3>Настройка лимитов</h3>
        </div>

        <div className="preorder-schedule-block">
          <FormField
            label="Стандартный дневной лимит"
            hint="Применяется автоматически каждый день. Задайте один раз -- больше не нужно обновлять каждое утро. Пусто или 0 = отключить."
          >
            <div className="limit-row">
              <input
                type="number"
                min={0}
                max={100}
                value={defaultLimitValue}
                onChange={(e) => setDefaultLimitValue(e.target.value)}
                placeholder="Не задан"
                className="form-input input-narrow"
              />
              <button
                className="btn btn-primary"
                onClick={handleSaveDefaultLimit}
                disabled={defaultLimitSaving}
              >
                {defaultLimitSaving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </FormField>
        </div>

        <div>
          <FormField
            label="Лимит на сегодня (переопределение)"
            hint="Если нужно изменить лимит только на сегодня -- задайте вручную. Сбросится в 6:00 (МСК), после чего снова заработает стандартный."
          >
            <div className="limit-row">
              <input
                type="number"
                min={1}
                max={100}
                value={limitValue}
                onChange={(e) => setLimitValue(e.target.value)}
                className="form-input input-sm"
              />
              <button
                className="btn btn-primary"
                onClick={handleSaveLimit}
                disabled={limitSaving}
              >
                {limitSaving ? 'Сохранение...' : 'Задать на сегодня'}
              </button>
            </div>
          </FormField>
        </div>

        {me?.limit_set_for_today && (
          <p className="limit-info">
            В работе сейчас: {me.orders_used_today ?? 0} / {me.max_orders ?? 0}
          </p>
        )}

        {me?.subscription_plan && (
          <p className="section-hint">
            Тариф: <strong>{me.subscription_plan === 'free' ? 'Free' : me.subscription_plan === 'pro' ? 'Pro' : 'Premium'}</strong> (макс. {me.plan_limit_cap ?? '?'} заказов/день)
          </p>
        )}

        <div className="shop-divider">
          <button
            className="btn btn-danger"
            onClick={handleCloseForToday}
            disabled={closingForToday}
          >
            {closingForToday ? 'Закрытие...' : 'Закрыться на сегодня'}
          </button>
          <p className="section-hint btn-mt-sm">
            Мгновенно прекращает приём заказов до 6:00 (МСК) следующего дня.
          </p>
        </div>
      </div>

      {/* Расписание лимитов по дням недели */}
      <div className="card shop-section">
        <div className="shop-section-header">
          <CalendarDays size={20} className="shop-section-icon" />
          <h3>Расписание лимитов по дням</h3>
        </div>
        <p className="section-hint">
          Задайте разный лимит для каждого дня недели. Например, в будни -- 10, в выходные -- 5. Приоритет: ручная установка &gt; расписание &gt; стандартный лимит.
        </p>
        <Toggle
          checked={scheduleEnabled}
          onChange={setScheduleEnabled}
          label="Включить расписание"
        />
        {scheduleEnabled && (
          <div className="shop-schedule-grid">
            {WEEKDAYS.map((d) => (
              <div key={d.value} className="shop-schedule-day-row">
                <span className="shop-schedule-day-label">{d.label}</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={weeklySchedule[String(d.value)] ?? ''}
                  onChange={(e) => setWeeklySchedule((prev) => ({ ...prev, [String(d.value)]: e.target.value }))}
                  placeholder="—"
                  className="form-input input-sm"
                />
              </div>
            ))}
          </div>
        )}
        <button
          className="btn btn-primary btn-mt-md"
          onClick={handleSaveSchedule}
          disabled={scheduleSaving}
        >
          {scheduleSaving ? 'Сохранение...' : 'Сохранить расписание'}
        </button>
      </div>

      {/* Предзаказы */}
      <div className="card shop-section">
        <div className="shop-section-header">
          <CalendarClock size={20} className="shop-section-icon" />
          <h3>Предзаказы</h3>
        </div>
        <p className="section-hint">
          Включите предзаказы и укажите, когда вы закупаетесь -- покупатели смогут выбирать дату поставки (например, следующий понедельник или через 10 дней).
        </p>
        <Toggle
          checked={preorderEnabled}
          onChange={setPreorderEnabled}
          label="Включить предзаказы"
        />
        {preorderEnabled && (
          <div className="preorder-schedule">
            <FormField label="Тип расписания">
              <div className="shop-radio-group">
                <label>
                  <input
                    type="radio"
                    name="preorderSchedule"
                    checked={preorderScheduleType === 'weekly'}
                    onChange={() => setPreorderScheduleType('weekly')}
                  />
                  Каждую неделю (выберите день)
                </label>
                <label>
                  <input
                    type="radio"
                    name="preorderSchedule"
                    checked={preorderScheduleType === 'interval_days'}
                    onChange={() => setPreorderScheduleType('interval_days')}
                  />
                  Каждые N дней
                </label>
                <label>
                  <input
                    type="radio"
                    name="preorderSchedule"
                    checked={preorderScheduleType === 'custom_dates'}
                    onChange={() => setPreorderScheduleType('custom_dates')}
                  />
                  Выбрать даты на календаре
                </label>
              </div>
            </FormField>
            {preorderScheduleType === 'weekly' && (
              <div className="preorder-schedule-block">
                <FormField label="День недели">
                  <select
                    value={preorderWeekday}
                    onChange={(e) => setPreorderWeekday(Number(e.target.value))}
                    className="form-input input-md"
                  >
                    {WEEKDAYS.map((d) => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </FormField>
              </div>
            )}
            {preorderScheduleType === 'interval_days' && (
              <div className="shop-form-row preorder-schedule-block">
                <FormField label="Интервал (дней)">
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={preorderIntervalDays}
                    onChange={(e) => setPreorderIntervalDays(Number(e.target.value) || 10)}
                    className="form-input input-sm"
                  />
                </FormField>
                <FormField label="Базовая дата (первая поставка, ГГГГ-ММ-ДД)">
                  <input
                    type="date"
                    value={preorderBaseDate}
                    onChange={(e) => setPreorderBaseDate(e.target.value)}
                    className="form-input"
                  />
                </FormField>
              </div>
            )}
            {preorderScheduleType === 'custom_dates' && (
              <div className="preorder-schedule-block">
                <FormField label="Выберите даты поставки">
                  <div className="shop-date-add-row">
                    <div className="shop-date-input-wrap">
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
                </FormField>
                {preorderCustomDates.length > 0 && (
                  <div className="shop-date-chips">
                    {preorderCustomDates.map((d) => (
                      <div key={d} className="shop-date-chip">
                        <span>{new Date(d).toLocaleDateString('ru-RU')}</span>
                        <button
                          type="button"
                          onClick={() => removeCustomDate(d)}
                          className="shop-date-chip-remove"
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
            <div className="shop-divider">
              <span className="shop-extra-settings-title">Дополнительные настройки</span>
              <div className="shop-form-row">
                <FormField label="Минимум дней до заказа" hint="Например, 2 = заказ можно оформить минимум за 2 дня до даты">
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={preorderMinLeadDays}
                    onChange={(e) => setPreorderMinLeadDays(Number(e.target.value) || 0)}
                    className="form-input input-sm"
                  />
                </FormField>
                <FormField label="Лимит заказов на дату" hint="Пусто = неограниченно">
                  <input
                    type="number"
                    min={0}
                    value={preorderMaxPerDate}
                    onChange={(e) => setPreorderMaxPerDate(e.target.value)}
                    placeholder="Без ограничений"
                    className="form-input input-narrow"
                  />
                </FormField>
              </div>
              <div className="shop-form-row btn-mt-md">
                <FormField label="Скидка за ранний предзаказ (%)" hint="Например, 10 = скидка 10% при раннем заказе">
                  <input
                    type="number"
                    min={0}
                    max={50}
                    step={0.5}
                    value={preorderDiscountPercent}
                    onChange={(e) => setPreorderDiscountPercent(e.target.value)}
                    placeholder="0"
                    className="form-input input-sm"
                  />
                </FormField>
                {parseFloat(preorderDiscountPercent) > 0 && (
                  <FormField label="За сколько дней скидка" hint={`Скидка действует если заказ за ${preorderDiscountMinDays}+ дней до даты`}>
                    <input
                      type="number"
                      min={1}
                      max={90}
                      value={preorderDiscountMinDays}
                      onChange={(e) => setPreorderDiscountMinDays(Number(e.target.value) || 7)}
                      className="form-input input-sm"
                    />
                  </FormField>
                )}
              </div>
            </div>
            {me?.preorder_available_dates && me.preorder_available_dates.length > 0 && (
              <p className="section-hint btn-mt-sm">
                Ближайшие даты поставки: {me.preorder_available_dates.slice(0, 4).join(', ')}
              </p>
            )}
        </div>
        )}
        <button
          className="btn btn-primary btn-mt-sm"
          onClick={handleSavePreorder}
          disabled={preorderSaving}
        >
          {preorderSaving ? 'Сохранение...' : 'Сохранить настройки предзаказов'}
        </button>
      </div>

      {/* Ссылка на магазин */}
      <div className="card shop-section">
        <div className="shop-section-header">
          <LinkIcon size={20} className="shop-section-icon" />
          <h3>Ссылка на магазин</h3>
        </div>
        <p className="section-hint">Отправьте эту ссылку клиентам -- они сразу попадут в каталог вашего магазина.</p>
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
