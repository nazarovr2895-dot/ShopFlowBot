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

function parseScheduleDay(val: unknown): { delivery: string; pickup: string } {
  if (val && typeof val === 'object' && 'delivery' in val && 'pickup' in val) {
    const obj = val as { delivery: number; pickup: number };
    return { delivery: String(obj.delivery), pickup: String(obj.pickup) };
  }
  return { delivery: '', pickup: '' };
}

export function LimitsSettingsTab({ me, reload }: SettingsTabProps) {
  const toast = useToast();
  const confirm = useConfirm();

  // Limits edit mode
  const [limitsEditing, setLimitsEditing] = useState(false);
  const [deliveryLimit, setDeliveryLimit] = useState(String(me.max_delivery_orders ?? 10));
  const [pickupLimit, setPickupLimit] = useState(String(me.max_pickup_orders ?? 20));
  const [limitSaving, setLimitSaving] = useState(false);
  const [defaultDeliveryLimit, setDefaultDeliveryLimit] = useState(String(me.max_delivery_orders ?? 10));
  const [defaultPickupLimit, setDefaultPickupLimit] = useState(String(me.max_pickup_orders ?? 20));
  const [defaultLimitSaving, setDefaultLimitSaving] = useState(false);
  const [closingForToday, setClosingForToday] = useState(false);

  // Schedule edit mode
  const [scheduleEditing, setScheduleEditing] = useState(false);
  const [scheduleEnabled, setScheduleEnabled] = useState(
    !!(me.weekly_schedule && Object.keys(me.weekly_schedule).length > 0)
  );
  const [weeklySchedule, setWeeklySchedule] = useState<Record<string, { delivery: string; pickup: string }>>(() => {
    const ws = me.weekly_schedule;
    if (ws && typeof ws === 'object') {
      const mapped: Record<string, { delivery: string; pickup: string }> = {};
      for (const [k, v] of Object.entries(ws)) mapped[k] = parseScheduleDay(v);
      return mapped;
    }
    return {};
  });
  const [scheduleSaving, setScheduleSaving] = useState(false);

  const startLimitsEdit = () => {
    setDeliveryLimit(String(me.max_delivery_orders ?? 10));
    setPickupLimit(String(me.max_pickup_orders ?? 20));
    setDefaultDeliveryLimit(String(me.max_delivery_orders ?? 10));
    setDefaultPickupLimit(String(me.max_pickup_orders ?? 20));
    setLimitsEditing(true);
  };

  const cancelLimitsEdit = () => setLimitsEditing(false);

  const startScheduleEdit = () => {
    const ws = me.weekly_schedule;
    const hasSchedule = ws && typeof ws === 'object' && Object.keys(ws).length > 0;
    setScheduleEnabled(!!hasSchedule);
    if (hasSchedule) {
      const mapped: Record<string, { delivery: string; pickup: string }> = {};
      for (const [k, v] of Object.entries(ws)) mapped[k] = parseScheduleDay(v);
      setWeeklySchedule(mapped);
    } else {
      setWeeklySchedule({});
    }
    setScheduleEditing(true);
  };

  const cancelScheduleEdit = () => setScheduleEditing(false);

  const handleSaveDefaultLimit = async () => {
    const d = parseInt(defaultDeliveryLimit, 10);
    const p = parseInt(defaultPickupLimit, 10);
    if (isNaN(d) || d < 0 || d > 100 || isNaN(p) || p < 0 || p > 100) {
      toast.warning('Введите числа от 0 до 100');
      return;
    }
    setDefaultLimitSaving(true);
    try {
      await updateDefaultLimit({ maxDeliveryOrders: d, maxPickupOrders: p });
      await reload();
      toast.success('Базовые лимиты сохранены');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setDefaultLimitSaving(false);
    }
  };

  const handleSaveLimit = async () => {
    const d = parseInt(deliveryLimit, 10);
    const p = parseInt(pickupLimit, 10);
    if (isNaN(d) || d < 0 || d > 100 || isNaN(p) || p < 0 || p > 100) {
      toast.warning('Введите числа от 0 до 100');
      return;
    }
    setLimitSaving(true);
    try {
      await updateLimits({ maxDeliveryOrders: d, maxPickupOrders: p });
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
    const schedule: Record<string, { delivery: number; pickup: number }> = {};
    for (const [k, v] of Object.entries(weeklySchedule)) {
      const d = parseInt(v.delivery, 10);
      const p = parseInt(v.pickup, 10);
      if ((!isNaN(d) && d > 0) || (!isNaN(p) && p > 0)) {
        schedule[k] = { delivery: isNaN(d) ? 0 : d, pickup: isNaN(p) ? 0 : p };
      }
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

  const dUsed = (me.active_delivery_orders ?? 0) + (me.pending_delivery_requests ?? 0);
  const pUsed = (me.active_pickup_orders ?? 0) + (me.pending_pickup_requests ?? 0);

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
            <FormField label="Базовые лимиты" hint="Применяются каждый день автоматически. 0 = отключить тип.">
              <div className="settings-limits-split-row">
                <div className="settings-limits-split-col">
                  <label className="settings-limits-split-label">Доставка</label>
                  <input
                    type="number" min={0} max={100}
                    value={defaultDeliveryLimit}
                    onChange={(e) => setDefaultDeliveryLimit(e.target.value)}
                    placeholder="10"
                    className="form-input settings-limits-input-sm"
                  />
                </div>
                <div className="settings-limits-split-col">
                  <label className="settings-limits-split-label">Самовывоз</label>
                  <input
                    type="number" min={0} max={100}
                    value={defaultPickupLimit}
                    onChange={(e) => setDefaultPickupLimit(e.target.value)}
                    placeholder="20"
                    className="form-input settings-limits-input-sm"
                  />
                </div>
                <button className="btn btn-primary" onClick={handleSaveDefaultLimit} disabled={defaultLimitSaving}>
                  {defaultLimitSaving ? 'Сохранение...' : 'Сохранить'}
                </button>
              </div>
            </FormField>

            <FormField label="Лимит на сегодня (переопределение)" hint="Только на сегодня. Сбросится в 6:00 (МСК).">
              <div className="settings-limits-split-row">
                <div className="settings-limits-split-col">
                  <label className="settings-limits-split-label">Доставка</label>
                  <input
                    type="number" min={0} max={100}
                    value={deliveryLimit}
                    onChange={(e) => setDeliveryLimit(e.target.value)}
                    className="form-input settings-limits-input-sm"
                  />
                </div>
                <div className="settings-limits-split-col">
                  <label className="settings-limits-split-label">Самовывоз</label>
                  <input
                    type="number" min={0} max={100}
                    value={pickupLimit}
                    onChange={(e) => setPickupLimit(e.target.value)}
                    className="form-input settings-limits-input-sm"
                  />
                </div>
                <button className="btn btn-primary" onClick={handleSaveLimit} disabled={limitSaving}>
                  {limitSaving ? 'Сохранение...' : 'Задать на сегодня'}
                </button>
              </div>
            </FormField>

            {me.limit_set_for_today && (
              <p className="settings-limits-status">
                Доставка: {dUsed} / {me.max_delivery_orders ?? 10} &nbsp;|&nbsp; Самовывоз: {pUsed} / {me.max_pickup_orders ?? 20}
              </p>
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
            <DataRow label="Лимит доставки" value={`${me.max_delivery_orders ?? 10} заказов/день`} />
            <DataRow label="Лимит самовывоза" value={`${me.max_pickup_orders ?? 20} заказов/день`} />
            <DataRow
              label="Сейчас"
              value={me.limit_set_for_today
                ? `Доставка: ${dUsed}/${me.max_delivery_orders ?? 10} | Самовывоз: ${pUsed}/${me.max_pickup_orders ?? 20}`
                : 'Не активен'}
            />
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
          Разный лимит для каждого дня недели. Приоритет: ручная установка &gt; расписание &gt; базовый лимит.
        </p>

        {scheduleEditing ? (
          <div className="settings-limits-form">
            <Toggle checked={scheduleEnabled} onChange={setScheduleEnabled} label="Включить расписание" />
            {scheduleEnabled && (
              <div className="settings-limits-schedule-grid">
                <div className="settings-limits-day-row settings-limits-day-header">
                  <span className="settings-limits-day-label"></span>
                  <span className="settings-limits-col-header">Доставка</span>
                  <span className="settings-limits-col-header">Самовывоз</span>
                </div>
                {WEEKDAYS.map((d) => {
                  const key = String(d.value);
                  const val = weeklySchedule[key] ?? { delivery: '', pickup: '' };
                  return (
                    <div key={d.value} className="settings-limits-day-row">
                      <span className="settings-limits-day-label">{d.label}</span>
                      <input
                        type="number" min={0} max={100}
                        value={val.delivery}
                        onChange={(e) => setWeeklySchedule((prev) => ({
                          ...prev,
                          [key]: { ...prev[key] ?? { delivery: '', pickup: '' }, delivery: e.target.value },
                        }))}
                        placeholder="—"
                        className="form-input settings-limits-input-sm"
                      />
                      <input
                        type="number" min={0} max={100}
                        value={val.pickup}
                        onChange={(e) => setWeeklySchedule((prev) => ({
                          ...prev,
                          [key]: { ...prev[key] ?? { delivery: '', pickup: '' }, pickup: e.target.value },
                        }))}
                        placeholder="—"
                        className="form-input settings-limits-input-sm"
                      />
                    </div>
                  );
                })}
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
              if (!val) return null;
              if (typeof val === 'object' && 'delivery' in val && 'pickup' in val) {
                const obj = val as { delivery: number; pickup: number };
                return <DataRow key={d.value} label={d.label} value={`Дост: ${obj.delivery} | Самов: ${obj.pickup}`} />;
              }
              return <DataRow key={d.value} label={d.label} value={`${val} заказов`} />;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
