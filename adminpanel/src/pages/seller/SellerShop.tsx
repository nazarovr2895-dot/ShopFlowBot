import { useEffect, useState } from 'react';
import { getMe, updateLimits, updateMe } from '../../api/sellerClient';
import type { SellerMe } from '../../api/sellerClient';
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
  const [me, setMe] = useState<SellerMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [limitValue, setLimitValue] = useState('');
  const [limitSaving, setLimitSaving] = useState(false);
  const [hashtagsValue, setHashtagsValue] = useState('');
  const [hashtagsSaving, setHashtagsSaving] = useState(false);
  const [preorderEnabled, setPreorderEnabled] = useState(false);
  const [preorderScheduleType, setPreorderScheduleType] = useState<'weekly' | 'interval_days' | 'custom_dates'>('weekly');
  const [preorderWeekday, setPreorderWeekday] = useState(0);
  const [preorderIntervalDays, setPreorderIntervalDays] = useState(10);
  const [preorderBaseDate, setPreorderBaseDate] = useState('');
  const [preorderCustomDates, setPreorderCustomDates] = useState<string[]>([]);
  const [newCustomDate, setNewCustomDate] = useState('');
  const [preorderSaving, setPreorderSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const meData = await getMe();
      setMe(meData);
      setLimitValue(String(meData?.max_orders ?? ''));
      setHashtagsValue(meData?.hashtags ?? '');
      setPreorderEnabled(meData?.preorder_enabled ?? false);
      setPreorderScheduleType((meData?.preorder_schedule_type as 'weekly' | 'interval_days' | 'custom_dates') || 'weekly');
      setPreorderWeekday(meData?.preorder_weekday ?? 0);
      setPreorderIntervalDays(meData?.preorder_interval_days ?? 10);
      setPreorderBaseDate(meData?.preorder_base_date ?? '');
      setPreorderCustomDates(meData?.preorder_custom_dates ?? []);
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
      alert(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setHashtagsSaving(false);
    }
  };

  const handleSaveLimit = async () => {
    const num = parseInt(limitValue, 10);
    if (isNaN(num) || num < 1 || num > 100) {
      alert('Введите число от 1 до 100');
      return;
    }
    setLimitSaving(true);
    try {
      await updateLimits(num);
      setMe((m) => m ? { ...m, max_orders: num } : null);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLimitSaving(false);
    }
  };

  const handleSavePreorder = async () => {
    if (preorderScheduleType === 'interval_days' && (!preorderBaseDate || preorderIntervalDays < 1)) {
      alert('Укажите базовую дату и интервал в днях');
      return;
    }
    if (preorderScheduleType === 'custom_dates' && preorderCustomDates.length === 0) {
      alert('Выберите хотя бы одну дату');
      return;
    }
    setPreorderSaving(true);
    try {
      await updateMe({
        preorder_enabled: preorderEnabled,
        preorder_schedule_type: preorderEnabled ? preorderScheduleType : null,
        preorder_weekday: preorderEnabled && preorderScheduleType === 'weekly' ? preorderWeekday : null,
        preorder_interval_days: preorderEnabled && preorderScheduleType === 'interval_days' ? preorderIntervalDays : null,
        preorder_base_date: preorderEnabled && preorderScheduleType === 'interval_days' && preorderBaseDate ? preorderBaseDate : null,
        preorder_custom_dates: preorderEnabled && preorderScheduleType === 'custom_dates' && preorderCustomDates.length > 0 ? preorderCustomDates : null,
      });
      const meData = await getMe();
      setMe(meData);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Ошибка');
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

  if (loading) {
    return (
      <div className="seller-shop-loading">
        <div className="loader" />
      </div>
    );
  }

  return (
    <div className="seller-shop-page">
      <h1 className="page-title">Настройка магазина</h1>

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
        <p className="section-hint">Лимит обнуляется каждый день в 6:00 (МСК). Укажите, сколько заказов сможете выполнить сегодня.</p>
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
            {limitSaving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
        {me?.limit_set_for_today && (
          <p className="limit-info">
            Использовано сегодня: {me.orders_used_today ?? 0} / {me.max_orders ?? 0}
          </p>
        )}
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
                alert('Ссылка скопирована');
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
