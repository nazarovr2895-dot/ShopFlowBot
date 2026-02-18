import { useState } from 'react';
import { updateMe } from '../../../api/sellerClient';
import { DataRow, FormField, Toggle, useToast } from '../../../components/ui';
import { CalendarClock, Pencil } from 'lucide-react';
import type { SettingsTabProps } from './types';
import './PreordersSettingsTab.css';

const WEEKDAYS = [
  { value: 0, label: 'Понедельник' },
  { value: 1, label: 'Вторник' },
  { value: 2, label: 'Среда' },
  { value: 3, label: 'Четверг' },
  { value: 4, label: 'Пятница' },
  { value: 5, label: 'Суббота' },
  { value: 6, label: 'Воскресенье' },
];

const SCHEDULE_TYPE_LABELS: Record<string, string> = {
  weekly: 'Каждую неделю',
  interval_days: 'Каждые N дней',
  custom_dates: 'Выбранные даты',
};

export function PreordersSettingsTab({ me, reload }: SettingsTabProps) {
  const toast = useToast();
  const [isEditing, setIsEditing] = useState(false);

  // Edit state
  const [preorderEnabled, setPreorderEnabled] = useState(me.preorder_enabled ?? false);
  const [scheduleType, setScheduleType] = useState<'weekly' | 'interval_days' | 'custom_dates'>(
    (me.preorder_schedule_type as 'weekly' | 'interval_days' | 'custom_dates') || 'weekly'
  );
  const [weekday, setWeekday] = useState(me.preorder_weekday ?? 0);
  const [intervalDays, setIntervalDays] = useState(me.preorder_interval_days ?? 10);
  const [baseDate, setBaseDate] = useState(me.preorder_base_date ?? '');
  const [customDates, setCustomDates] = useState<string[]>(me.preorder_custom_dates ?? []);
  const [newCustomDate, setNewCustomDate] = useState('');
  const [minLeadDays, setMinLeadDays] = useState(me.preorder_min_lead_days ?? 2);
  const [maxPerDate, setMaxPerDate] = useState(me.preorder_max_per_date != null ? String(me.preorder_max_per_date) : '');
  const [discountPercent, setDiscountPercent] = useState(me.preorder_discount_percent ? String(me.preorder_discount_percent) : '');
  const [discountMinDays, setDiscountMinDays] = useState(me.preorder_discount_min_days ?? 7);
  const [saving, setSaving] = useState(false);

  const startEditing = () => {
    setPreorderEnabled(me.preorder_enabled ?? false);
    setScheduleType((me.preorder_schedule_type as 'weekly' | 'interval_days' | 'custom_dates') || 'weekly');
    setWeekday(me.preorder_weekday ?? 0);
    setIntervalDays(me.preorder_interval_days ?? 10);
    setBaseDate(me.preorder_base_date ?? '');
    setCustomDates(me.preorder_custom_dates ?? []);
    setNewCustomDate('');
    setMinLeadDays(me.preorder_min_lead_days ?? 2);
    setMaxPerDate(me.preorder_max_per_date != null ? String(me.preorder_max_per_date) : '');
    setDiscountPercent(me.preorder_discount_percent ? String(me.preorder_discount_percent) : '');
    setDiscountMinDays(me.preorder_discount_min_days ?? 7);
    setIsEditing(true);
  };

  const cancelEditing = () => setIsEditing(false);

  const addCustomDate = () => {
    if (newCustomDate && !customDates.includes(newCustomDate)) {
      setCustomDates([...customDates, newCustomDate].sort());
      setNewCustomDate('');
    }
  };

  const removeCustomDate = (dateToRemove: string) => {
    setCustomDates(customDates.filter((d) => d !== dateToRemove));
  };

  const handleSave = async () => {
    if (preorderEnabled) {
      if (scheduleType === 'interval_days' && (!baseDate || intervalDays < 1)) {
        toast.warning('Укажите базовую дату и интервал в днях');
        return;
      }
      if (scheduleType === 'custom_dates' && customDates.length === 0) {
        toast.warning('Выберите хотя бы одну дату');
        return;
      }
    }
    setSaving(true);
    try {
      const maxPD = maxPerDate ? parseInt(maxPerDate, 10) : null;
      const discPct = discountPercent ? parseFloat(discountPercent) : 0;
      await updateMe({
        preorder_enabled: preorderEnabled,
        preorder_schedule_type: preorderEnabled ? scheduleType : undefined,
        preorder_weekday: preorderEnabled && scheduleType === 'weekly' ? weekday : undefined,
        preorder_interval_days: preorderEnabled && scheduleType === 'interval_days' ? intervalDays : undefined,
        preorder_base_date: preorderEnabled && scheduleType === 'interval_days' && baseDate ? baseDate : null,
        preorder_custom_dates: preorderEnabled && scheduleType === 'custom_dates' && customDates.length > 0 ? customDates : null,
        preorder_min_lead_days: preorderEnabled ? minLeadDays : undefined,
        preorder_max_per_date: preorderEnabled ? maxPD : null,
        preorder_discount_percent: preorderEnabled ? discPct : undefined,
        preorder_discount_min_days: preorderEnabled && discPct > 0 ? discountMinDays : undefined,
      });
      await reload();
      setIsEditing(false);
      toast.success('Настройки предзаказов сохранены');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  const viewScheduleLabel = SCHEDULE_TYPE_LABELS[me.preorder_schedule_type || ''] || me.preorder_schedule_type || '—';
  const viewWeekdayLabel = WEEKDAYS.find((d) => d.value === me.preorder_weekday)?.label;

  return (
    <div className="settings-preorders">
      <div className="card settings-preorders-section">
        <div className="settings-preorders-header">
          <div className="settings-preorders-header-left">
            <CalendarClock size={20} className="settings-preorders-icon" />
            <h3>Предзаказы</h3>
          </div>
          {!isEditing && (
            <button className="btn btn-ghost btn-sm" onClick={startEditing}>
              <Pencil size={14} />
              Изменить
            </button>
          )}
        </div>
        <p className="settings-preorders-hint">
          Покупатели смогут выбирать дату поставки заранее.
        </p>

        {isEditing ? (
          <div className="settings-preorders-form">
            <Toggle checked={preorderEnabled} onChange={setPreorderEnabled} label="Включить предзаказы" />

            {preorderEnabled && (
              <>
                <FormField label="Тип расписания">
                  <div className="settings-preorders-radio-group">
                    <label className="settings-preorders-radio">
                      <input type="radio" name="preorderSchedule" checked={scheduleType === 'weekly'} onChange={() => setScheduleType('weekly')} />
                      Каждую неделю (выберите день)
                    </label>
                    <label className="settings-preorders-radio">
                      <input type="radio" name="preorderSchedule" checked={scheduleType === 'interval_days'} onChange={() => setScheduleType('interval_days')} />
                      Каждые N дней
                    </label>
                    <label className="settings-preorders-radio">
                      <input type="radio" name="preorderSchedule" checked={scheduleType === 'custom_dates'} onChange={() => setScheduleType('custom_dates')} />
                      Выбрать даты на календаре
                    </label>
                  </div>
                </FormField>

                {scheduleType === 'weekly' && (
                  <FormField label="День недели">
                    <select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))} className="form-input settings-preorders-input-md">
                      {WEEKDAYS.map((d) => (
                        <option key={d.value} value={d.value}>{d.label}</option>
                      ))}
                    </select>
                  </FormField>
                )}

                {scheduleType === 'interval_days' && (
                  <div className="settings-preorders-row">
                    <FormField label="Интервал (дней)">
                      <input type="number" min={1} max={365} value={intervalDays} onChange={(e) => setIntervalDays(Number(e.target.value) || 10)} className="form-input settings-preorders-input-sm" />
                    </FormField>
                    <FormField label="Базовая дата">
                      <input type="date" value={baseDate} onChange={(e) => setBaseDate(e.target.value)} className="form-input" />
                    </FormField>
                  </div>
                )}

                {scheduleType === 'custom_dates' && (
                  <div className="settings-preorders-dates-block">
                    <FormField label="Выберите даты поставки">
                      <div className="settings-preorders-date-add">
                        <input type="date" value={newCustomDate} onChange={(e) => setNewCustomDate(e.target.value)} className="form-input" />
                        <button type="button" className="btn btn-secondary" onClick={addCustomDate} disabled={!newCustomDate}>Добавить</button>
                      </div>
                    </FormField>
                    {customDates.length > 0 && (
                      <div className="settings-preorders-chips">
                        {customDates.map((d) => (
                          <div key={d} className="settings-preorders-chip">
                            <span>{new Date(d).toLocaleDateString('ru-RU')}</span>
                            <button type="button" onClick={() => removeCustomDate(d)} className="settings-preorders-chip-remove" aria-label="Удалить">×</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="settings-preorders-extra">
                  <span className="settings-preorders-extra-title">Дополнительные настройки</span>
                  <div className="settings-preorders-row">
                    <FormField label="Минимум дней до заказа" hint="Например, 2 = минимум за 2 дня">
                      <input type="number" min={0} max={30} value={minLeadDays} onChange={(e) => setMinLeadDays(Number(e.target.value) || 0)} className="form-input settings-preorders-input-sm" />
                    </FormField>
                    <FormField label="Лимит заказов на дату" hint="Пусто = неограниченно">
                      <input type="number" min={0} value={maxPerDate} onChange={(e) => setMaxPerDate(e.target.value)} placeholder="Без ограничений" className="form-input settings-preorders-input-narrow" />
                    </FormField>
                  </div>
                  <div className="settings-preorders-row">
                    <FormField label="Скидка за ранний предзаказ (%)" hint="Например, 10 = скидка 10%">
                      <input type="number" min={0} max={50} step={0.5} value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} placeholder="0" className="form-input settings-preorders-input-sm" />
                    </FormField>
                    {parseFloat(discountPercent) > 0 && (
                      <FormField label="За сколько дней скидка" hint={`Скидка за ${discountMinDays}+ дней`}>
                        <input type="number" min={1} max={90} value={discountMinDays} onChange={(e) => setDiscountMinDays(Number(e.target.value) || 7)} className="form-input settings-preorders-input-sm" />
                      </FormField>
                    )}
                  </div>
                </div>

                {me.preorder_available_dates && me.preorder_available_dates.length > 0 && (
                  <p className="settings-preorders-dates-hint">
                    Ближайшие даты поставки: {me.preorder_available_dates.slice(0, 4).join(', ')}
                  </p>
                )}
              </>
            )}

            <div className="settings-preorders-actions">
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
              <button className="btn btn-ghost" onClick={cancelEditing}>Отмена</button>
            </div>
          </div>
        ) : (
          <div className="settings-preorders-view">
            <DataRow label="Статус" value={me.preorder_enabled ? 'Включено' : 'Отключено'} />
            {me.preorder_enabled && (
              <>
                <DataRow label="Тип расписания" value={viewScheduleLabel} />
                {me.preorder_schedule_type === 'weekly' && viewWeekdayLabel && (
                  <DataRow label="День недели" value={viewWeekdayLabel} />
                )}
                {me.preorder_schedule_type === 'interval_days' && (
                  <>
                    <DataRow label="Интервал" value={`${me.preorder_interval_days ?? '—'} дней`} />
                    <DataRow label="Базовая дата" value={me.preorder_base_date || '—'} />
                  </>
                )}
                {me.preorder_schedule_type === 'custom_dates' && me.preorder_custom_dates && (
                  <DataRow label="Выбранные даты" value={me.preorder_custom_dates.map((d) => new Date(d).toLocaleDateString('ru-RU')).join(', ')} />
                )}
                <DataRow label="Мин. дней до заказа" value={me.preorder_min_lead_days ?? 0} />
                <DataRow label="Лимит на дату" value={me.preorder_max_per_date != null ? me.preorder_max_per_date : 'Без ограничений'} />
                {(me.preorder_discount_percent ?? 0) > 0 && (
                  <>
                    <DataRow label="Скидка" value={`${me.preorder_discount_percent}%`} accent />
                    <DataRow label="За дней до даты" value={`${me.preorder_discount_min_days ?? 7}+`} />
                  </>
                )}
                {me.preorder_available_dates && me.preorder_available_dates.length > 0 && (
                  <DataRow label="Ближайшие даты" value={me.preorder_available_dates.slice(0, 4).join(', ')} muted />
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
