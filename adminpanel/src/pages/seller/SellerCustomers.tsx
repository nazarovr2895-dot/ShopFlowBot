import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import {
  getLoyaltySettings,
  updateLoyaltySettings,
  getAllCustomers,
  getCustomerTags,
  createCustomer,
  getCustomer,
  recordSale,
  getCustomerOrders,
  deductPoints,
  updateCustomer,
  exportCustomersCSV,
  createCustomerEvent,
  updateCustomerEvent,
  deleteCustomerEvent,
} from '../../api/sellerClient';
import type { UnifiedCustomerBrief, SellerCustomerDetail, SellerOrder, CustomerEvent, LoyaltyTier } from '../../api/sellerClient';
import './SellerCustomers.css';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

/** Строгий формат: "+7 000 000 00 00". При вводе оставляем только цифры, форматируем. */
function formatPhoneInput(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 0) return '';
  let num = digits;
  if (num.startsWith('8')) num = '7' + num.slice(1);
  else if (!num.startsWith('7')) num = '7' + num;
  num = num.slice(0, 11);
  if (num.length <= 1) return '+7';
  if (num.length <= 4) return `+7 ${num.slice(1)}`;
  if (num.length <= 7) return `+7 ${num.slice(1, 4)} ${num.slice(4)}`;
  if (num.length <= 9) return `+7 ${num.slice(1, 4)} ${num.slice(4, 7)} ${num.slice(7)}`;
  return `+7 ${num.slice(1, 4)} ${num.slice(4, 7)} ${num.slice(7, 9)} ${num.slice(9, 11)}`;
}

/** Из отображаемого значения в цифры для API (7 + 10 цифр). */
function phoneToDigits(display: string): string {
  const digits = display.replace(/\D/g, '');
  if (digits.startsWith('8')) return '7' + digits.slice(1, 11);
  if (digits.startsWith('7')) return digits.slice(0, 11);
  return ('7' + digits).slice(0, 11);
}

const SEGMENT_COLORS: Record<string, { bg: string; color: string }> = {
  'VIP': { bg: '#fff3cd', color: '#856404' },
  'Постоянный': { bg: '#d4edda', color: '#155724' },
  'Новый': { bg: '#cce5ff', color: '#004085' },
  'Уходящий': { bg: '#f8d7da', color: '#721c24' },
  'Потерянный': { bg: '#e2e3e5', color: '#383d41' },
  'Случайный': { bg: '#e8e8e8', color: '#555' },
};

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'Ожидает',
  accepted: 'Принят',
  assembling: 'Собирается',
  in_transit: 'В пути',
  done: 'Выполнен',
  completed: 'Завершён',
  rejected: 'Отклонён',
};

export function SellerCustomers() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<UnifiedCustomerBrief[]>([]);
  const [detail, setDetail] = useState<SellerCustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [pointsPercent, setPointsPercent] = useState<string>('');
  const [maxPointsDiscount, setMaxPointsDiscount] = useState<string>('100');
  const [pointsToRubleRate, setPointsToRubleRate] = useState<string>('1');
  const [pointsSaving, setPointsSaving] = useState(false);
  const [addForm, setAddForm] = useState({ phone: '', first_name: '', last_name: '', birthday: '' });
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [saleAmount, setSaleAmount] = useState('');
  const [saleSubmitting, setSaleSubmitting] = useState(false);
  const [deductPointsAmount, setDeductPointsAmount] = useState('');
  const [deductSubmitting, setDeductSubmitting] = useState(false);
  const [customerOrders, setCustomerOrders] = useState<SellerOrder[]>([]);
  const [search, setSearch] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');
  const [customerTags, setCustomerTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [customerBirthday, setCustomerBirthday] = useState('');
  const [allTags, setAllTags] = useState<string[]>([]);
  const [tagFilter, setTagFilter] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const [events, setEvents] = useState<CustomerEvent[]>([]);
  const [eventForm, setEventForm] = useState({ title: '', event_date: '', remind_days_before: '3', notes: '' });
  const [eventSubmitting, setEventSubmitting] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CustomerEvent | null>(null);
  const [tiersConfig, setTiersConfig] = useState<LoyaltyTier[]>([]);
  const [pointsExpireDays, setPointsExpireDays] = useState<string>('');
  const [segmentCounts, setSegmentCounts] = useState<Record<string, number>>({});
  const [segmentMap, setSegmentMap] = useState<Record<number, string>>({});
  const [segmentFilter, setSegmentFilter] = useState('');

  const loadList = useCallback(async () => {
    try {
      const [list, settings, tags] = await Promise.all([
        getAllCustomers(),
        getLoyaltySettings(),
        getCustomerTags(),
      ]);
      setCustomers(list || []);
      setPointsPercent(String(settings.points_percent ?? ''));
      setMaxPointsDiscount(String(settings.max_points_discount_percent ?? 100));
      setPointsToRubleRate(String(settings.points_to_ruble_rate ?? 1));
      setTiersConfig(settings.tiers_config || []);
      setPointsExpireDays(settings.points_expire_days ? String(settings.points_expire_days) : '');
      setAllTags(tags || []);
      // Build segment counts and map from unified list
      const counts: Record<string, number> = {};
      const sMap: Record<number, string> = {};
      (list || []).forEach((c) => {
        if (c.segment) {
          counts[c.segment] = (counts[c.segment] || 0) + 1;
          if (c.loyalty_customer_id) sMap[c.loyalty_customer_id] = c.segment;
        }
      });
      setSegmentCounts(counts);
      setSegmentMap(sMap);
    } catch {
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (customerId: number) => {
    setLoading(true);
    try {
      const [data, orders] = await Promise.all([
        getCustomer(customerId),
        getCustomerOrders(customerId),
      ]);
      setDetail(data);
      setCustomerOrders(orders || []);
      setCustomerNotes(data.notes || '');
      setCustomerTags(Array.isArray(data.tags) ? data.tags : []);
      setNewTagInput('');
      setCustomerBirthday(data.birthday || '');
      setEvents(data.events || []);
    } catch {
      setDetail(null);
      setCustomerOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (id) {
      const numId = parseInt(id, 10);
      if (!isNaN(numId)) loadDetail(numId);
      else setLoading(false);
    } else {
      loadList();
    }
  }, [id, loadList, loadDetail]);

  const handleSaveLoyaltySettings = async () => {
    const num = parseFloat(pointsPercent.replace(',', '.'));
    if (isNaN(num) || num < 0 || num > 100) {
      alert('Процент начисления: число от 0 до 100');
      return;
    }
    const maxDisc = parseInt(maxPointsDiscount, 10);
    if (isNaN(maxDisc) || maxDisc < 0 || maxDisc > 100) {
      alert('Макс. % оплаты баллами: число от 0 до 100');
      return;
    }
    const rate = parseFloat(pointsToRubleRate.replace(',', '.'));
    if (isNaN(rate) || rate <= 0) {
      alert('Курс баллов: число больше 0');
      return;
    }
    setPointsSaving(true);
    try {
      const expDays = pointsExpireDays ? parseInt(pointsExpireDays, 10) : 0;
      const result = await updateLoyaltySettings({
        points_percent: num,
        max_points_discount_percent: maxDisc,
        points_to_ruble_rate: rate,
        tiers_config: tiersConfig.length > 0 ? tiersConfig : null,
        points_expire_days: expDays > 0 ? expDays : null,
      });
      setPointsPercent(String(result.points_percent));
      setMaxPointsDiscount(String(result.max_points_discount_percent));
      setPointsToRubleRate(String(result.points_to_ruble_rate));
      setTiersConfig(result.tiers_config || []);
      setPointsExpireDays(result.points_expire_days ? String(result.points_expire_days) : '');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setPointsSaving(false);
    }
  };

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    const { phone, first_name, last_name } = addForm;
    const digits = phoneToDigits(phone);
    if (digits.length < 11) {
      alert('Введите номер в формате +7 000 000 00 00');
      return;
    }
    setAddSubmitting(true);
    try {
      await createCustomer({ phone: digits, first_name: first_name.trim(), last_name: last_name.trim(), birthday: addForm.birthday || null });
      setAddForm({ phone: '', first_name: '', last_name: '', birthday: '' });
      loadList();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Ошибка';
      if (typeof msg === 'string' && (msg.includes('уже есть') || msg.includes('409'))) {
        alert('Клиент с таким номером телефона уже есть. Проверьте список или поиск по телефону.');
      } else {
        alert(msg);
      }
    } finally {
      setAddSubmitting(false);
    }
  };

  const handleRecordSale = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(saleAmount.replace(',', '.'));
    if (isNaN(amount) || amount <= 0 || !detail) {
      alert('Введите сумму больше 0');
      return;
    }
    setSaleSubmitting(true);
    try {
      const result = await recordSale(detail.id, amount);
      setSaleAmount('');
      setDetail((d) => (d ? { ...d, points_balance: result.new_balance, transactions: [{ id: 0, amount: result.amount, points_accrued: result.points_accrued, order_id: null, created_at: new Date().toISOString() }, ...d.transactions] } : null));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setSaleSubmitting(false);
    }
  };

  const handleDeductPoints = async (e: React.FormEvent) => {
    e.preventDefault();
    const points = parseFloat(deductPointsAmount.replace(',', '.'));
    if (isNaN(points) || points <= 0 || !detail) {
      alert('Введите положительное количество баллов');
      return;
    }
    setDeductSubmitting(true);
    try {
      const result = await deductPoints(detail.id, points);
      setDeductPointsAmount('');
      setDetail((d) => (d ? { ...d, points_balance: result.new_balance, transactions: [{ id: 0, amount: 0, points_accrued: -result.points_deducted, order_id: null, created_at: new Date().toISOString() }, ...d.transactions] } : null));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setDeductSubmitting(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!detail) return;
    setNotesSaving(true);
    try {
      const result = await updateCustomer(detail.id, { notes: customerNotes, tags: customerTags, birthday: customerBirthday || null });
      setDetail((d) => (d ? { ...d, notes: result.notes, tags: Array.isArray(result.tags) ? result.tags : [], birthday: result.birthday } : null));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setNotesSaving(false);
    }
  };

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail || !eventForm.title.trim() || !eventForm.event_date) {
      alert('Заполните название и дату');
      return;
    }
    setEventSubmitting(true);
    try {
      const ev = await createCustomerEvent(detail.id, {
        title: eventForm.title.trim(),
        event_date: eventForm.event_date,
        remind_days_before: parseInt(eventForm.remind_days_before) || 3,
        notes: eventForm.notes.trim() || null,
      });
      setEvents((prev) => [...prev, ev]);
      setEventForm({ title: '', event_date: '', remind_days_before: '3', notes: '' });
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setEventSubmitting(false);
    }
  };

  const handleUpdateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail || !editingEvent) return;
    setEventSubmitting(true);
    try {
      const ev = await updateCustomerEvent(detail.id, editingEvent.id, {
        title: eventForm.title.trim() || undefined,
        event_date: eventForm.event_date || undefined,
        remind_days_before: parseInt(eventForm.remind_days_before) || undefined,
        notes: eventForm.notes.trim() || null,
      });
      setEvents((prev) => prev.map((x) => (x.id === ev.id ? ev : x)));
      setEditingEvent(null);
      setEventForm({ title: '', event_date: '', remind_days_before: '3', notes: '' });
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setEventSubmitting(false);
    }
  };

  const handleDeleteEvent = async (eventId: number) => {
    if (!detail || !confirm('Удалить это событие?')) return;
    try {
      await deleteCustomerEvent(detail.id, eventId);
      setEvents((prev) => prev.filter((x) => x.id !== eventId));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  const startEditEvent = (ev: CustomerEvent) => {
    setEditingEvent(ev);
    setEventForm({
      title: ev.title,
      event_date: ev.event_date || '',
      remind_days_before: String(ev.remind_days_before),
      notes: ev.notes || '',
    });
  };

  const filteredCustomers = customers.filter((c) => {
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const match =
        (c.fio && c.fio.toLowerCase().includes(q)) ||
        (c.username && c.username.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(search.trim())) ||
        (c.first_name && c.first_name.toLowerCase().includes(q)) ||
        (c.last_name && c.last_name.toLowerCase().includes(q)) ||
        (c.loyalty_card_number && c.loyalty_card_number.toLowerCase().includes(q));
      if (!match) return false;
    }
    if (tagFilter && !(c.tags || []).includes(tagFilter)) return false;
    if (segmentFilter && c.segment !== segmentFilter) return false;
    return true;
  });

  const handleExportCustomers = async () => {
    try {
      const blob = await exportCustomersCSV();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `customers_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Ошибка экспорта');
    }
  };

  if (id) {
    if (loading) {
      return (
        <div className="customers-page customers-detail">
          <div className="customers-loading">Загрузка...</div>
        </div>
      );
    }
    if (!detail) {
      return (
        <div className="customers-page customers-detail">
          <button type="button" className="back" onClick={() => navigate('/customers')}>
            ← К списку клиентов
          </button>
          <p>Клиент не найден.</p>
        </div>
      );
    }
    return (
      <div className="customers-page customers-detail">
        <button type="button" className="back" onClick={() => navigate('/customers')}>
          ← К списку клиентов
        </button>
        <div className="customer-card">
          <div className="card-number">{detail.card_number}</div>
          <div className="name">
            {detail.last_name} {detail.first_name}
          </div>
          <div className="row">Телефон: {detail.phone}</div>
          <div className="balance">Баланс: {detail.points_balance} баллов</div>
          {detail.tier?.name && (
            <div className="row" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{
                display: 'inline-block', background: '#fff3cd', color: '#856404',
                padding: '0.15rem 0.6rem', borderRadius: '0.8rem', fontSize: '0.85rem', fontWeight: 600,
              }}>{detail.tier.name}</span>
              <span style={{ fontSize: '0.85rem', color: '#666' }}>
                ({detail.tier.points_percent}% баллов)
              </span>
              {detail.tier.next_tier && detail.tier.amount_to_next != null && (
                <span style={{ fontSize: '0.8rem', color: '#999' }}>
                  до «{detail.tier.next_tier}» — {detail.tier.amount_to_next.toLocaleString('ru-RU')} ₽
                </span>
              )}
            </div>
          )}
          {detail.birthday && (
            <div className="row customer-analytics">
              День рождения: <strong>{new Date(detail.birthday + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</strong>
            </div>
          )}
          {(detail.total_purchases != null && detail.total_purchases > 0) && (
            <div className="row customer-analytics">
              Сумма покупок: <strong>{detail.total_purchases.toLocaleString('ru')} ₽</strong>
            </div>
          )}
          {detail.last_order_at && (
            <div className="row customer-analytics">
              Последний заказ: <strong>{formatDate(detail.last_order_at)}</strong>
            </div>
          )}
          {(detail.completed_orders_count != null && detail.completed_orders_count > 0) && (
            <div className="row customer-analytics">
              Выполнено заказов: <strong>{detail.completed_orders_count}</strong>
            </div>
          )}
        </div>
        <div className="customer-notes-section" style={{ marginBottom: '1rem' }}>
          <h3>Заметки и теги</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem' }}>Заметка</label>
              <textarea
                value={customerNotes}
                onChange={(e) => setCustomerNotes(e.target.value)}
                placeholder="Примечания о клиенте (VIP, постоянный и т.д.)"
                rows={3}
                style={{ width: '100%', padding: '0.5rem', fontSize: '0.95rem' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem' }}>Теги</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginBottom: '0.4rem' }}>
                {customerTags.map((tag, i) => (
                  <span key={i} style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
                    background: '#e8f0fe', color: '#1a73e8', padding: '0.2rem 0.6rem',
                    borderRadius: '1rem', fontSize: '0.85rem',
                  }}>
                    {tag}
                    <button type="button" onClick={() => setCustomerTags(customerTags.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', fontSize: '1rem', padding: 0, lineHeight: 1 }}>
                      x
                    </button>
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '0.3rem' }}>
                <input
                  type="text"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newTagInput.trim()) {
                      e.preventDefault();
                      const tag = newTagInput.trim();
                      if (!customerTags.includes(tag)) setCustomerTags([...customerTags, tag]);
                      setNewTagInput('');
                    }
                  }}
                  placeholder="Введите тег и Enter"
                  list="tag-suggestions"
                  style={{ flex: 1, padding: '0.4rem', fontSize: '0.9rem' }}
                />
                <datalist id="tag-suggestions">
                  {allTags.filter((t) => !customerTags.includes(t)).map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
                <button type="button" onClick={() => {
                  const tag = newTagInput.trim();
                  if (tag && !customerTags.includes(tag)) setCustomerTags([...customerTags, tag]);
                  setNewTagInput('');
                }} style={{ padding: '0.4rem 0.8rem', fontSize: '0.9rem' }}>+</button>
              </div>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem' }}>День рождения</label>
              <input
                type="date"
                value={customerBirthday}
                onChange={(e) => setCustomerBirthday(e.target.value)}
                style={{ padding: '0.5rem', fontSize: '0.95rem' }}
              />
            </div>
            <button
              type="button"
              onClick={handleSaveNotes}
              disabled={notesSaving}
              style={{ alignSelf: 'flex-start', padding: '0.5rem 1rem' }}
            >
              {notesSaving ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </div>
        <div className="customer-events-section" style={{ marginBottom: '1rem' }}>
          <h3>Значимые даты</h3>
          {events.length > 0 && (
            <div style={{ marginBottom: '0.75rem' }}>
              {events.map((ev) => (
                <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0', borderBottom: '1px solid var(--border-color, #eee)' }}>
                  <span style={{ flex: 1 }}>
                    <strong>{ev.title}</strong>
                    {ev.event_date && (
                      <> — {new Date(ev.event_date + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</>
                    )}
                    {ev.notes && <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}> ({ev.notes})</span>}
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}> · напоминание за {ev.remind_days_before} дн.</span>
                  </span>
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => startEditEvent(ev)}>Ред.</button>
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => handleDeleteEvent(ev.id)} style={{ color: 'var(--danger, red)' }}>✕</button>
                </div>
              ))}
            </div>
          )}
          <form onSubmit={editingEvent ? handleUpdateEvent : handleAddEvent} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Название (ДР жены, годовщина...)"
                value={eventForm.title}
                onChange={(e) => setEventForm((f) => ({ ...f, title: e.target.value }))}
                style={{ flex: 1, minWidth: '150px', padding: '0.4rem' }}
              />
              <input
                type="date"
                value={eventForm.event_date}
                onChange={(e) => setEventForm((f) => ({ ...f, event_date: e.target.value }))}
                style={{ padding: '0.4rem' }}
              />
              <input
                type="number"
                min="0"
                max="90"
                placeholder="Дни"
                title="За сколько дней напоминать"
                value={eventForm.remind_days_before}
                onChange={(e) => setEventForm((f) => ({ ...f, remind_days_before: e.target.value }))}
                style={{ width: '60px', padding: '0.4rem' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                placeholder="Заметка (необязательно)"
                value={eventForm.notes}
                onChange={(e) => setEventForm((f) => ({ ...f, notes: e.target.value }))}
                style={{ flex: 1, padding: '0.4rem' }}
              />
              <button type="submit" disabled={eventSubmitting} style={{ padding: '0.4rem 0.75rem' }}>
                {eventSubmitting ? '…' : editingEvent ? 'Обновить' : 'Добавить'}
              </button>
              {editingEvent && (
                <button type="button" onClick={() => { setEditingEvent(null); setEventForm({ title: '', event_date: '', remind_days_before: '3', notes: '' }); }} style={{ padding: '0.4rem 0.75rem' }}>
                  Отмена
                </button>
              )}
            </div>
          </form>
        </div>
        <div className="record-sale">
          <h3>Внести продажу</h3>
          <form onSubmit={handleRecordSale}>
            <input
              type="text"
              inputMode="decimal"
              placeholder="Сумма, ₽"
              value={saleAmount}
              onChange={(e) => setSaleAmount(e.target.value)}
            />
            <button type="submit" disabled={saleSubmitting}>
              {saleSubmitting ? '…' : 'Начислить баллы'}
            </button>
          </form>
        </div>
        <div className="deduct-points">
          <h3>Списать баллы</h3>
          <form onSubmit={handleDeductPoints}>
            <input
              type="text"
              inputMode="decimal"
              placeholder="Баллы"
              value={deductPointsAmount}
              onChange={(e) => setDeductPointsAmount(e.target.value)}
            />
            <button type="submit" disabled={deductSubmitting}>
              {deductSubmitting ? '…' : 'Списать'}
            </button>
          </form>
        </div>
        {customerOrders.length > 0 && (
          <div className="customer-orders-list">
            <h3>Заказы</h3>
            <ul>
              {customerOrders.map((o) => (
                <li key={o.id}>
                  <Link to={`/orders/${o.id}`}>
                    Заказ #{o.id} — {o.total_price} ₽ — {ORDER_STATUS_LABELS[o.status] || o.status} — {formatDate(o.created_at ?? null)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="transactions-list">
          <h3>История покупок</h3>
          {detail.transactions.length === 0 ? (
            <p className="meta">Пока нет записей.</p>
          ) : (
            detail.transactions.map((t) => (
              <div key={t.id} className="transaction-item">
                <span className="date">{formatDate(t.created_at)}</span>
                <span className="amount">{t.amount > 0 ? `${t.amount} ₽` : ''}</span>
                <span className="points">
                  {t.points_accrued >= 0 ? `+${t.points_accrued}` : t.points_accrued} баллов
                  {t.order_id != null && (
                    <> — <Link to={`/orders/${t.order_id}`}>Заказ #{t.order_id}</Link></>
                  )}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="customers-page">
      <h1>База клиентов</h1>
      <div className="customers-settings">
        <h2>Настройки лояльности</h2>
        <div className="field">
          <label>Начисление баллов (% от суммы заказа)</label>
          <input
            type="text"
            inputMode="decimal"
            value={pointsPercent}
            onChange={(e) => setPointsPercent(e.target.value)}
            placeholder="0"
          />
        </div>
        <div className="field">
          <label>Макс. % заказа, оплачиваемый баллами</label>
          <input
            type="text"
            inputMode="numeric"
            value={maxPointsDiscount}
            onChange={(e) => setMaxPointsDiscount(e.target.value)}
            placeholder="100"
          />
        </div>
        <div className="field">
          <label>Курс: 1 балл = X рублей</label>
          <input
            type="text"
            inputMode="decimal"
            value={pointsToRubleRate}
            onChange={(e) => setPointsToRubleRate(e.target.value)}
            placeholder="1"
          />
        </div>
        <div className="field">
          <label>Срок действия баллов (дней, 0 = бессрочно)</label>
          <input
            type="text"
            inputMode="numeric"
            value={pointsExpireDays}
            onChange={(e) => setPointsExpireDays(e.target.value)}
            placeholder="0 (бессрочно)"
          />
        </div>
        <div style={{ marginTop: '1rem' }}>
          <h3 style={{ margin: '0 0 0.5rem' }}>Уровни лояльности</h3>
          <p style={{ fontSize: '0.85rem', color: '#666', margin: '0 0 0.5rem' }}>
            Настройте уровни для автоматического изменения % начисления баллов в зависимости от суммы покупок клиента.
          </p>
          {tiersConfig.map((tier, i) => (
            <div key={i} style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.3rem', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Название"
                value={tier.name}
                onChange={(e) => {
                  const next = [...tiersConfig];
                  next[i] = { ...next[i], name: e.target.value };
                  setTiersConfig(next);
                }}
                style={{ flex: 2, padding: '0.3rem', fontSize: '0.9rem' }}
              />
              <input
                type="text"
                inputMode="numeric"
                placeholder="От суммы ₽"
                value={tier.min_total}
                onChange={(e) => {
                  const next = [...tiersConfig];
                  next[i] = { ...next[i], min_total: Number(e.target.value) || 0 };
                  setTiersConfig(next);
                }}
                style={{ flex: 1, padding: '0.3rem', fontSize: '0.9rem' }}
              />
              <input
                type="text"
                inputMode="decimal"
                placeholder="% баллов"
                value={tier.points_percent}
                onChange={(e) => {
                  const next = [...tiersConfig];
                  next[i] = { ...next[i], points_percent: Number(e.target.value) || 0 };
                  setTiersConfig(next);
                }}
                style={{ flex: 1, padding: '0.3rem', fontSize: '0.9rem' }}
              />
              <button type="button" onClick={() => setTiersConfig(tiersConfig.filter((_, j) => j !== i))}
                style={{ padding: '0.3rem 0.5rem', fontSize: '0.9rem', background: '#f8d7da', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                x
              </button>
            </div>
          ))}
          <button type="button" onClick={() => setTiersConfig([...tiersConfig, { name: '', min_total: 0, points_percent: 0 }])}
            style={{ padding: '0.3rem 0.8rem', fontSize: '0.85rem', marginTop: '0.3rem' }}>
            + Добавить уровень
          </button>
        </div>
        <button type="button" onClick={handleSaveLoyaltySettings} disabled={pointsSaving} style={{ marginTop: '1rem' }}>
          {pointsSaving ? 'Сохранение…' : 'Сохранить настройки'}
        </button>
      </div>
      <div className="customers-add">
        <h2>Добавить клиента</h2>
        <form onSubmit={handleAddCustomer}>
          <div className="field">
            <label>Телефон</label>
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              value={addForm.phone}
              onChange={(e) => setAddForm((f) => ({ ...f, phone: formatPhoneInput(e.target.value) }))}
              placeholder="+7 000 000 00 00"
              maxLength={16}
            />
          </div>
          <div className="field">
            <label>Имя</label>
            <input
              type="text"
              value={addForm.first_name}
              onChange={(e) => setAddForm((f) => ({ ...f, first_name: e.target.value }))}
              placeholder="Имя"
            />
          </div>
          <div className="field">
            <label>Фамилия</label>
            <input
              type="text"
              value={addForm.last_name}
              onChange={(e) => setAddForm((f) => ({ ...f, last_name: e.target.value }))}
              placeholder="Фамилия"
            />
          </div>
          <div className="field">
            <label>День рождения</label>
            <input
              type="date"
              value={addForm.birthday}
              onChange={(e) => setAddForm((f) => ({ ...f, birthday: e.target.value }))}
            />
          </div>
          <button type="submit" disabled={addSubmitting}>
            {addSubmitting ? '…' : 'Добавить'}
          </button>
        </form>
      </div>
      {/* Stats */}
      <div className="subscribers-stats" style={{ display: 'flex', gap: '0.5rem', margin: '0.5rem 0' }}>
        <div className="stat-card" style={{ flex: 1, textAlign: 'center', padding: '0.5rem', background: '#f8f9fa', borderRadius: '8px' }}>
          <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{customers.length}</div>
          <div style={{ fontSize: '0.8rem', color: '#666' }}>Всего</div>
        </div>
        <div className="stat-card" style={{ flex: 1, textAlign: 'center', padding: '0.5rem', background: '#f8f9fa', borderRadius: '8px' }}>
          <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{customers.filter(c => c.has_loyalty).length}</div>
          <div style={{ fontSize: '0.8rem', color: '#666' }}>С картой</div>
        </div>
        <div className="stat-card" style={{ flex: 1, textAlign: 'center', padding: '0.5rem', background: '#f8f9fa', borderRadius: '8px' }}>
          <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{customers.filter(c => !c.has_loyalty).length}</div>
          <div style={{ fontSize: '0.8rem', color: '#666' }}>Без карты</div>
        </div>
      </div>
      <div className="customers-search-and-export">
        <input
          type="search"
          placeholder="Поиск по имени, @username или телефону"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {allTags.length > 0 && (
          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            style={{ padding: '0.4rem', fontSize: '0.9rem' }}
          >
            <option value="">Все теги</option>
            {allTags.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}
        <select
          value={segmentFilter}
          onChange={(e) => setSegmentFilter(e.target.value)}
          style={{ padding: '0.4rem', fontSize: '0.9rem' }}
        >
          <option value="">Все сегменты</option>
          {Object.keys(segmentCounts).map((s) => (
            <option key={s} value={s}>{s} ({segmentCounts[s]})</option>
          ))}
        </select>
        <button type="button" className="btn btn-secondary" onClick={handleExportCustomers}>
          Экспорт CSV
        </button>
      </div>
      {Object.keys(segmentCounts).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', margin: '0.5rem 0' }}>
          {Object.entries(segmentCounts).map(([seg, count]) => {
            const colors = SEGMENT_COLORS[seg] || { bg: '#eee', color: '#333' };
            return (
              <button key={seg} type="button"
                onClick={() => setSegmentFilter(segmentFilter === seg ? '' : seg)}
                style={{
                  background: segmentFilter === seg ? colors.color : colors.bg,
                  color: segmentFilter === seg ? '#fff' : colors.color,
                  border: 'none', padding: '0.25rem 0.7rem', borderRadius: '1rem',
                  fontSize: '0.8rem', cursor: 'pointer', fontWeight: 500,
                }}>
                {seg}: {count}
              </button>
            );
          })}
        </div>
      )}
      {loading ? (
        <div className="customers-loading">Загрузка...</div>
      ) : (
        <div className="customers-list">
          {filteredCustomers.length === 0 ? (
            <p className="meta">
              {customers.length === 0
                ? 'У вас пока нет клиентов. Покупатели могут подписаться на ваш магазин через каталог.'
                : 'Ничего не найдено'}
            </p>
          ) : (
            filteredCustomers.map((c, idx) => {
              const displayName = c.fio
                || (c.first_name || c.last_name ? `${c.last_name || ''} ${c.first_name || ''}`.trim() : null)
                || (c.username ? `@${c.username}` : null)
                || (c.buyer_id ? `ID ${c.buyer_id}` : `Клиент #${idx + 1}`);
              const hasCard = c.has_loyalty && c.loyalty_customer_id;
              return (
                <div
                  key={c.buyer_id || `sc-${c.loyalty_customer_id || idx}`}
                  className="customer-row"
                  style={{ cursor: hasCard ? 'pointer' : 'default' }}
                  onClick={() => hasCard && navigate(`/customers/${c.loyalty_customer_id}`)}
                >
                  <div style={{ flex: 1 }}>
                    <div className="name">
                      {displayName}
                      {c.username && c.fio && (
                        <span style={{ fontSize: '0.8rem', color: '#888', marginLeft: '0.3rem' }}>@{c.username}</span>
                      )}
                      {c.segment && (() => {
                        const colors = SEGMENT_COLORS[c.segment] || { bg: '#eee', color: '#333' };
                        return (
                          <span style={{
                            display: 'inline-block', background: colors.bg, color: colors.color,
                            padding: '0.1rem 0.4rem', borderRadius: '0.8rem', fontSize: '0.7rem',
                            marginLeft: '0.3rem', fontWeight: 500,
                          }}>{c.segment}</span>
                        );
                      })()}
                      {Array.isArray(c.tags) && c.tags.length > 0 && (
                        <span style={{ marginLeft: '0.4rem' }}>
                          {c.tags.map((tag, i) => (
                            <span key={i} style={{
                              display: 'inline-block', background: '#e8f0fe', color: '#1a73e8',
                              padding: '0.1rem 0.4rem', borderRadius: '0.8rem', fontSize: '0.75rem', marginRight: '0.2rem',
                            }}>{tag}</span>
                          ))}
                        </span>
                      )}
                    </div>
                    <div className="meta">
                      {c.phone || '—'}
                      {c.loyalty_card_number && <> · {c.loyalty_card_number}</>}
                      {c.subscribed_at && <> · {formatDate(c.subscribed_at)}</>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {c.has_loyalty ? (
                      <>
                        <div className="points">{c.loyalty_points} б.</div>
                        {hasCard && (
                          <Link to={`/customers/${c.loyalty_customer_id}`} className="loyalty-link"
                            style={{ fontSize: '0.75rem' }}
                            onClick={(e) => e.stopPropagation()}>
                            Карточка
                          </Link>
                        )}
                      </>
                    ) : (
                      <span style={{ fontSize: '0.8rem', color: '#999' }}>Нет карты</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
