import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createCustomer, createCustomerEvent } from '../../api/sellerClient';
import { useToast, FormField, Card } from '../../components/ui';
import { formatPhoneInput, phoneToDigits } from '../../utils/phone';
import './AddCustomerTab.css';

interface EventDraft {
  key: number;
  title: string;
  event_date: string;
  remind_days_before: string;
  notes: string;
}

const EVENT_PRESETS = [
  'ДР жены',
  'ДР мамы',
  'Годовщина свадьбы',
  'ДР ребёнка',
];

let nextKey = 1;

function makeEvent(title = ''): EventDraft {
  return { key: nextKey++, title, event_date: '', remind_days_before: '3', notes: '' };
}

export function AddCustomerTab() {
  const toast = useToast();
  const navigate = useNavigate();

  // Customer fields
  const [phone, setPhone] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthday, setBirthday] = useState('');

  // Events
  const [events, setEvents] = useState<EventDraft[]>([]);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [statusText, setStatusText] = useState('');

  const updateEvent = (key: number, patch: Partial<EventDraft>) => {
    setEvents((prev) => prev.map((ev) => (ev.key === key ? { ...ev, ...patch } : ev)));
  };

  const removeEvent = (key: number) => {
    setEvents((prev) => prev.filter((ev) => ev.key !== key));
  };

  const addEvent = (title = '') => {
    setEvents((prev) => [...prev, makeEvent(title)]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const digits = phoneToDigits(phone);
    if (digits.length < 11) {
      toast.warning('Введите номер в формате +7 000 000 00 00');
      return;
    }

    // Filter out completely empty event rows, validate partially filled ones
    const filledEvents = events.filter((ev) => ev.title.trim() || ev.event_date);
    for (const ev of filledEvents) {
      if (!ev.title.trim()) {
        toast.warning('Заполните название для каждой даты');
        return;
      }
      if (!ev.event_date) {
        toast.warning(`Укажите дату для «${ev.title.trim()}»`);
        return;
      }
    }

    setSubmitting(true);
    setStatusText('Создание клиента…');

    let customerId: number | null = null;

    try {
      const customer = await createCustomer({
        phone: digits,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        birthday: birthday || null,
      });
      customerId = customer.id;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка';
      if (typeof msg === 'string' && (msg.includes('уже есть') || msg.includes('409'))) {
        toast.warning('Клиент с таким номером телефона уже есть.');
      } else {
        toast.error(msg);
      }
      setSubmitting(false);
      setStatusText('');
      return;
    }

    // Create events sequentially
    let failedCount = 0;
    if (filledEvents.length > 0) {
      for (let i = 0; i < filledEvents.length; i++) {
        const ev = filledEvents[i];
        setStatusText(`Добавление дат (${i + 1}/${filledEvents.length})…`);
        try {
          await createCustomerEvent(customerId, {
            title: ev.title.trim(),
            event_date: ev.event_date,
            remind_days_before: parseInt(ev.remind_days_before) || 3,
            notes: ev.notes.trim() || null,
          });
        } catch {
          failedCount++;
        }
      }
    }

    setSubmitting(false);
    setStatusText('');

    const addedCount = filledEvents.length - failedCount;
    if (failedCount > 0) {
      toast.warning(
        `Клиент создан, но ${failedCount} из ${filledEvents.length} дат не были добавлены. Вы можете добавить их в карточке клиента.`,
      );
    } else if (addedCount > 0) {
      toast.success(`Клиент создан и ${pluralDates(addedCount)} добавлено`);
    } else {
      toast.success('Клиент создан');
    }

    navigate(`/customers/${customerId}`);
  };

  return (
    <div className="add-customer-tab">
      <form onSubmit={handleSubmit}>
        {/* ── Customer Info ──────────────────── */}
        <Card>
          <h2 className="add-customer-section-title">Информация о клиенте</h2>
          <div className="add-customer-fields-grid">
            <FormField label="Телефон *">
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
                placeholder="+7 000 000 00 00"
                maxLength={16}
              />
            </FormField>
            <FormField label="Имя">
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Имя"
              />
            </FormField>
            <FormField label="Фамилия">
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Фамилия"
              />
            </FormField>
            <FormField label="День рождения">
              <input
                type="date"
                value={birthday}
                onChange={(e) => setBirthday(e.target.value)}
              />
              <span className="add-customer-hint">Сохраняется в карточке клиента</span>
            </FormField>
          </div>
        </Card>

        {/* ── Significant Dates ────────────── */}
        <Card>
          <h2 className="add-customer-section-title">Значимые даты</h2>
          <p className="add-customer-hint" style={{ marginBottom: 'var(--space-4)' }}>
            Добавьте памятные даты клиента — мы напомним о них заранее
          </p>

          {events.length > 0 ? (
            <div className="add-customer-events-list">
              {events.map((ev) => (
                <div key={ev.key} className="add-customer-event-row">
                  <div className="add-customer-event-row-fields">
                    <FormField label="Название">
                      <input
                        type="text"
                        placeholder="ДР жены, годовщина..."
                        value={ev.title}
                        onChange={(e) => updateEvent(ev.key, { title: e.target.value })}
                      />
                    </FormField>
                    <FormField label="Дата">
                      <input
                        type="date"
                        value={ev.event_date}
                        onChange={(e) => updateEvent(ev.key, { event_date: e.target.value })}
                      />
                    </FormField>
                    <FormField label="Напомнить за (дн.)">
                      <input
                        type="number"
                        min={0}
                        max={90}
                        value={ev.remind_days_before}
                        onChange={(e) => updateEvent(ev.key, { remind_days_before: e.target.value })}
                      />
                    </FormField>
                    <FormField label="Заметка">
                      <input
                        type="text"
                        placeholder="Необязательно"
                        value={ev.notes}
                        onChange={(e) => updateEvent(ev.key, { notes: e.target.value })}
                      />
                    </FormField>
                  </div>
                  <button
                    type="button"
                    className="add-customer-event-remove"
                    onClick={() => removeEvent(ev.key)}
                    title="Удалить дату"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="add-customer-events-empty">
              Нет добавленных дат. Нажмите кнопку ниже или выберите шаблон.
            </div>
          )}

          <div className="add-customer-events-actions">
            <button type="button" className="add-customer-event-add-btn" onClick={() => addEvent()}>
              + Добавить дату
            </button>

            <div className="add-customer-presets">
              {EVENT_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className="add-customer-preset-chip"
                  onClick={() => addEvent(preset)}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* ── Submit ────────────────────────── */}
        <button type="submit" className="add-customer-submit" disabled={submitting}>
          {submitting ? statusText || 'Создание…' : 'Создать клиента'}
        </button>
      </form>
    </div>
  );
}

function pluralDates(n: number): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return `${n} дат`;
  if (last > 1 && last < 5) return `${n} даты`;
  if (last === 1) return `${n} дата`;
  return `${n} дат`;
}
