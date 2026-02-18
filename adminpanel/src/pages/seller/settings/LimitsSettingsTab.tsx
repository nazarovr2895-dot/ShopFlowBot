import { useState } from 'react';
import { updateLimits, updateDefaultLimit, closeForToday, updateWeeklySchedule } from '../../../api/sellerClient';
import { DataRow, FormField, Toggle, useToast, useConfirm } from '../../../components/ui';
import { Settings, CalendarDays, Pencil } from 'lucide-react';
import type { SettingsTabProps } from './types';
import './LimitsSettingsTab.css';

const WEEKDAYS = [
  { value: 0, label: 'Понедельник' },
  { value: 1, label: 'Вторник' },
  { value: 2, label: 'Среда' },
  { value: 3, label: 'Четверг' },
  { value: 4, label: 'Пятница' },
  { value: 5, label: 'Суббота' },
  { value: 6, label: 'Воскресенье' },
];

export function LimitsSettingsTab({ me, reload }: SettingsTabProps) {
  const toast = useToast();
  const confirm = useConfirm();

  // Limits edit mode
  const [limitsEditing, setLimitsEditing] = useState(false);
  const [limitValue, setLimitValue] = useState(String(me.max_orders ?? ''));
  const [limitSaving, setLimitSaving] = useState(false);
  const [defaultLimitValue, setDefaultLimitValue] = useState(me.default_daily_limit ? String(me.default_daily_limit) : '');
  const [defaultLimitSaving, setDefaultLimitSaving] = useState(false);
  const [closingForToday, setClosingForToday] = useState(false);

  // Schedule edit mode
  const [scheduleEditing, setScheduleEditing] = useState(false);
  const [scheduleEnabled, setScheduleEnabled] = useState(
    !!(me.weekly_schedule && Object.keys(me.weekly_schedule).length > 0)
  );
  const [weeklySchedule, setWeeklySchedule] = useState<Record<string, string>>(() => {
    const ws = me.weekly_schedule;
    if (ws && typeof ws === 'object') {
      const mapped: Record<string, string> = {};
      for (const [k, v] of Object.entries(ws)) mapped[k] = String(v);
      return mapped;
    }
    return {};
  });
  const [scheduleSaving, setScheduleSaving] = useState(false);

  const startLimitsEdit = () => {
    setLimitValue(String(me.max_orders ?? ''));
    setDefaultLimitValue(me.default_daily_limit ? String(me.default_daily_limit) : '');
    setLimitsEditing(true);
  };

  const cancelLimitsEdit = () => setLimitsEditing(false);

  const startScheduleEdit = () => {
    const ws = me.weekly_schedule;
    const hasSchedule = ws && typeof ws === 'object' && Object.keys(ws).length > 0;
    setScheduleEnabled(!!hasSchedule);
    if (hasSchedule) {
      const mapped: Record<string, string> = {};
      for (const [k, v] of Object.entries(ws)) mapped[k] = String(v);
      setWeeklySchedule(mapped);
    } else {
      setWeeklySchedule({});
    }
    setScheduleEditing(true);
  };

  const cancelScheduleEdit = () => setScheduleEditing(false);

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
      await reload();
      toast.success('Стандартный лимит сохранён');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setDefaultLimitSaving(false);
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
      await reload();
      toast.success('Лимит на сегодня установлен');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLimitSaving(false);
    }
  };

  const handleCloseForToday = async () => {
    if (!await confirm({ message: 'Закрыть магазин на сегодня? Новые заказы не будут приниматься до 6:00 (МСК).' })) return;
    setClosingForToday(true);
    try {
      await closeForToday();
      await reload();
      toast.success('Магазин закрыт на сегодня');
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
        await reload();
        setScheduleEditing(false);
        toast.success('Расписание отключено');
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
      await reload();
      setScheduleEditing(false);
      toast.success('Расписание сохранено');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setScheduleSaving(false);
    }
  };

  const hasSchedule = me.weekly_schedule && typeof me.weekly_schedule === 'object' && Object.keys(me.weekly_schedule).length > 0;

  const planLabel = me.subscription_plan
    ? `${me.subscription_plan === 'free' ? 'Free' : me.subscription_plan === 'pro' ? 'Pro' : 'Premium'} (макс. ${me.plan_limit_cap ?? '?'} заказов/день)`
    : undefined;

  return (
    <div className="settings-limits">
      {/* Section 1: Limits */}
      <div className="card settings-limits-section">
        <div className="settings-limits-header">
          <div className="settings-limits-header-left">
            <Settings size={20} className="settings-limits-icon" />
            <h3>Настройка лимитов</h3>
          </div>
          {!limitsEditing && (
            <button className="btn btn-ghost btn-sm" onClick={startLimitsEdit}>
              <Pencil size={14} />
              Изменить
            </button>
          )}
        </div>

        {limitsEditing ? (
          <div className="settings-limits-form">
            <FormField label="Стандартный дневной лимит" hint="Применяется каждый день автоматически. Пусто или 0 = отключить.">
              <div className="settings-limits-input-row">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={defaultLimitValue}
                  onChange={(e) => setDefaultLimitValue(e.target.value)}
                  placeholder="Не задан"
                  className="form-input settings-limits-input-narrow"
                />
                <button className="btn btn-primary" onClick={handleSaveDefaultLimit} disabled={defaultLimitSaving}>
                  {defaultLimitSaving ? 'Сохранение...' : 'Сохранить'}
                </button>
              </div>
            </FormField>

            <FormField label="Лимит на сегодня (переопределение)" hint="Только на сегодня. Сбросится в 6:00 (МСК).">
              <div className="settings-limits-input-row">
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={limitValue}
                  onChange={(e) => setLimitValue(e.target.value)}
                  className="form-input settings-limits-input-sm"
                />
                <button className="btn btn-primary" onClick={handleSaveLimit} disabled={limitSaving}>
                  {limitSaving ? 'Сохранение...' : 'Задать на сегодня'}
                </button>
              </div>
            </FormField>

            {me.limit_set_for_today && (
              <p className="settings-limits-status">
                В работе сейчас: {me.orders_used_today ?? 0} / {me.max_orders ?? 0}
              </p>
            )}

            {planLabel && (
              <p className="settings-limits-plan">Тариф: <strong>{planLabel}</strong></p>
            )}

            <div className="settings-limits-divider">
              <button className="btn btn-danger" onClick={handleCloseForToday} disabled={closingForToday}>
                {closingForToday ? 'Закрытие...' : 'Закрыться на сегодня'}
              </button>
              <p className="settings-limits-hint-sm">
                Мгновенно прекращает приём заказов до 6:00 (МСК) следующего дня.
              </p>
            </div>

            <button className="btn btn-ghost" onClick={cancelLimitsEdit}>Отмена</button>
          </div>
        ) : (
          <div className="settings-limits-view">
            <DataRow label="Стандартный лимит" value={me.default_daily_limit ? `${me.default_daily_limit} заказов/день` : 'Не задан'} />
            <DataRow label="Действующий лимит" value={me.limit_set_for_today ? `${me.orders_used_today ?? 0} / ${me.max_orders ?? 0}` : 'Не активен'} />
            {planLabel && <DataRow label="Тариф" value={planLabel} />}
          </div>
        )}
      </div>

      {/* Section 2: Weekly schedule */}
      <div className="card settings-limits-section">
        <div className="settings-limits-header">
          <div className="settings-limits-header-left">
            <CalendarDays size={20} className="settings-limits-icon" />
            <h3>Расписание лимитов по дням</h3>
          </div>
          {!scheduleEditing && (
            <button className="btn btn-ghost btn-sm" onClick={startScheduleEdit}>
              <Pencil size={14} />
              Изменить
            </button>
          )}
        </div>
        <p className="settings-limits-hint">
          Разный лимит для каждого дня недели. Приоритет: ручная установка &gt; расписание &gt; стандартный лимит.
        </p>

        {scheduleEditing ? (
          <div className="settings-limits-form">
            <Toggle checked={scheduleEnabled} onChange={setScheduleEnabled} label="Включить расписание" />
            {scheduleEnabled && (
              <div className="settings-limits-schedule-grid">
                {WEEKDAYS.map((d) => (
                  <div key={d.value} className="settings-limits-day-row">
                    <span className="settings-limits-day-label">{d.label}</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={weeklySchedule[String(d.value)] ?? ''}
                      onChange={(e) => setWeeklySchedule((prev) => ({ ...prev, [String(d.value)]: e.target.value }))}
                      placeholder="—"
                      className="form-input settings-limits-input-sm"
                    />
                  </div>
                ))}
              </div>
            )}
            <div className="settings-limits-actions">
              <button className="btn btn-primary" onClick={handleSaveSchedule} disabled={scheduleSaving}>
                {scheduleSaving ? 'Сохранение...' : 'Сохранить расписание'}
              </button>
              <button className="btn btn-ghost" onClick={cancelScheduleEdit}>Отмена</button>
            </div>
          </div>
        ) : (
          <div className="settings-limits-view">
            <DataRow label="Статус" value={hasSchedule ? 'Включено' : 'Отключено'} />
            {hasSchedule && WEEKDAYS.map((d) => {
              const val = me.weekly_schedule?.[String(d.value)];
              return val ? <DataRow key={d.value} label={d.label} value={`${val} заказов`} /> : null;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
