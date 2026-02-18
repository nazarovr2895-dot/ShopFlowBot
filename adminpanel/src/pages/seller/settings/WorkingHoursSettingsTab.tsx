import { useState } from 'react';
import { updateWorkingHours } from '../../../api/sellerClient';
import { DataRow, Toggle, useToast } from '../../../components/ui';
import { Clock, Pencil } from 'lucide-react';
import type { SettingsTabProps } from './types';
import './WorkingHoursSettingsTab.css';

const WEEKDAYS = [
  { value: 0, label: 'Понедельник', short: 'Пн' },
  { value: 1, label: 'Вторник', short: 'Вт' },
  { value: 2, label: 'Среда', short: 'Ср' },
  { value: 3, label: 'Четверг', short: 'Чт' },
  { value: 4, label: 'Пятница', short: 'Пт' },
  { value: 5, label: 'Суббота', short: 'Сб' },
  { value: 6, label: 'Воскресенье', short: 'Вс' },
];

type DayConfig = { open: string; close: string } | null;

function initSchedule(
  wh: Record<string, DayConfig> | null | undefined
): Record<string, { open: string; close: string; isWorking: boolean }> {
  const result: Record<string, { open: string; close: string; isWorking: boolean }> = {};
  for (const d of WEEKDAYS) {
    const key = String(d.value);
    const existing = wh?.[key];
    if (existing === null) {
      result[key] = { open: '09:00', close: '18:00', isWorking: false };
    } else if (existing && typeof existing === 'object') {
      result[key] = { open: existing.open, close: existing.close, isWorking: true };
    } else {
      // Not configured — default to working 09:00-18:00
      result[key] = { open: '09:00', close: '18:00', isWorking: true };
    }
  }
  return result;
}

export function WorkingHoursSettingsTab({ me, reload }: SettingsTabProps) {
  const toast = useToast();

  const [editing, setEditing] = useState(false);
  const [enabled, setEnabled] = useState(
    !!(me.working_hours && Object.keys(me.working_hours).length > 0)
  );
  const [schedule, setSchedule] = useState(() => initSchedule(me.working_hours));
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    const wh = me.working_hours;
    const hasHours = wh && typeof wh === 'object' && Object.keys(wh).length > 0;
    setEnabled(!!hasHours);
    setSchedule(initSchedule(wh));
    setEditing(true);
  };

  const cancelEdit = () => setEditing(false);

  const handleSave = async () => {
    if (!enabled) {
      setSaving(true);
      try {
        await updateWorkingHours(null);
        await reload();
        setEditing(false);
        toast.success('Время работы отключено');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Ошибка');
      } finally {
        setSaving(false);
      }
      return;
    }

    // Build the working_hours object
    const wh: Record<string, DayConfig> = {};
    for (const d of WEEKDAYS) {
      const key = String(d.value);
      const day = schedule[key];
      if (!day.isWorking) {
        wh[key] = null;
      } else {
        if (day.open >= day.close) {
          toast.warning(`${d.label}: время открытия должно быть раньше закрытия`);
          return;
        }
        wh[key] = { open: day.open, close: day.close };
      }
    }

    setSaving(true);
    try {
      await updateWorkingHours(wh);
      await reload();
      setEditing(false);
      toast.success('Время работы сохранено');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  const updateDay = (key: string, field: string, value: string | boolean) => {
    setSchedule((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  };

  const hasHours = me.working_hours && typeof me.working_hours === 'object' && Object.keys(me.working_hours).length > 0;

  return (
    <div className="settings-hours">
      <div className="card settings-hours-section">
        <div className="settings-hours-header">
          <div className="settings-hours-header-left">
            <Clock size={20} className="settings-hours-icon" />
            <h3>Время работы магазина</h3>
          </div>
          {!editing && (
            <button className="btn btn-ghost btn-sm" onClick={startEdit}>
              <Pencil size={14} />
              Изменить
            </button>
          )}
        </div>
        <p className="settings-hours-hint">
          Задайте часы работы для каждого дня недели. В нерабочее время и выходные магазин не отображается в каталоге.
        </p>

        {editing ? (
          <div className="settings-hours-form">
            <Toggle checked={enabled} onChange={setEnabled} label="Включить расписание работы" />
            {enabled && (
              <div className="settings-hours-schedule-grid">
                {WEEKDAYS.map((d) => {
                  const key = String(d.value);
                  const day = schedule[key];
                  return (
                    <div key={d.value} className="settings-hours-day-row">
                      <span className="settings-hours-day-label">{d.label}</span>
                      <div className="settings-hours-day-toggle">
                        <Toggle
                          checked={day.isWorking}
                          onChange={(v) => updateDay(key, 'isWorking', v)}
                          label=""
                        />
                      </div>
                      {day.isWorking ? (
                        <div className="settings-hours-time-inputs">
                          <input
                            type="time"
                            value={day.open}
                            onChange={(e) => updateDay(key, 'open', e.target.value)}
                          />
                          <span className="settings-hours-time-sep">&mdash;</span>
                          <input
                            type="time"
                            value={day.close}
                            onChange={(e) => updateDay(key, 'close', e.target.value)}
                          />
                        </div>
                      ) : (
                        <span className="settings-hours-day-off-label">Выходной</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="settings-hours-actions">
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
              <button className="btn btn-ghost" onClick={cancelEdit}>Отмена</button>
            </div>
          </div>
        ) : (
          <div className="settings-hours-view">
            <DataRow label="Статус" value={hasHours ? 'Включено' : 'Отключено'} />
            {hasHours && WEEKDAYS.map((d) => {
              const val = me.working_hours?.[String(d.value)];
              if (val === undefined) return null;
              if (val === null) {
                return <DataRow key={d.value} label={d.label} value="Выходной" />;
              }
              return <DataRow key={d.value} label={d.label} value={`${val.open} — ${val.close}`} />;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
