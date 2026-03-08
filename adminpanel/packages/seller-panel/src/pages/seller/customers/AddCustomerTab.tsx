import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createCustomer, createCustomerEvent } from '../../../api/sellerClient';
import { useToast, FormField, EmptyState } from '@shared/components/ui';
import { formatPhoneInput, phoneToDigits } from '@shared/utils/phone';
import { UserPlus, CalendarHeart, CalendarPlus, Plus, X } from 'lucide-react';
import './shared.css';
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

  const [phone, setPhone] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthday, setBirthday] = useState('');

  const [events, setEvents] = useState<EventDraft[]>([]);
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
        `Клиент создан, но ${failedCount} из ${filledEvents.length} дат не были добавлены.`,
      );
    } else if (addedCount > 0) {
      toast.success(`Клиент создан и ${pluralDates(addedCount)} добавлено`);
    } else {
      toast.success('Клиент создан');
    }

    navigate(`/customers/${customerId}`);
  };

  return (
    <div className="add-cust">
      <form onSubmit={handleSubmit}>
        {/* ═══ Customer Info ═══ */}
        <div className="crm-card">
          <div className="crm-card__header">
            <div className="crm-card__header-left">
              <div className="crm-card__icon-badge crm-card__icon-badge--green">
                <UserPlus size={18} />
              </div>
              <div>
                <h3 className="crm-card__title">Информация о клиенте</h3>
                <p className="crm-card__subtitle">Обязательные и дополнительные поля</p>
              </div>
            </div>
          </div>

          <div className="crm-form">
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
            <div className="crm-form__row-2col">
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
            </div>
            <div className="crm-form__row-2col">
              <FormField label="День рождения" hint="Сохраняется в карточке клиента">
                <input
                  type="date"
                  value={birthday}
                  onChange={(e) => setBirthday(e.target.value)}
                />
              </FormField>
            </div>
          </div>
        </div>

        {/* ═══ Significant Dates ═══ */}
        <div className="crm-card">
          <div className="crm-card__header">
            <div className="crm-card__header-left">
              <div className="crm-card__icon-badge crm-card__icon-badge--pink">
                <CalendarHeart size={18} />
              </div>
              <div>
                <h3 className="crm-card__title">Значимые даты</h3>
                <p className="crm-card__subtitle">Добавьте памятные даты клиента — мы напомним заранее</p>
              </div>
            </div>
          </div>

          {events.length > 0 ? (
            <div className="add-cust__events">
              {events.map((ev) => (
                <div key={ev.key} className="add-cust__event-card">
                  <button
                    type="button"
                    className="add-cust__event-remove"
                    onClick={() => removeEvent(ev.key)}
                    title="Удалить дату"
                  >
                    <X size={14} />
                  </button>
                  <div className="crm-form__row-2col">
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
                  </div>
                  <div className="crm-form__row-2col">
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
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<CalendarPlus size={36} />}
              title="Нет добавленных дат"
              message="Нажмите кнопку ниже или выберите шаблон"
            />
          )}

          <div className="add-cust__events-toolbar">
            <button type="button" className="add-cust__add-btn" onClick={() => addEvent()}>
              <Plus size={14} /> Добавить дату
            </button>
            <div className="add-cust__presets">
              {EVENT_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className="add-cust__preset"
                  onClick={() => addEvent(preset)}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ═══ Submit ═══ */}
        <button type="submit" className="add-cust__submit" disabled={submitting}>
          <UserPlus size={16} />
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
