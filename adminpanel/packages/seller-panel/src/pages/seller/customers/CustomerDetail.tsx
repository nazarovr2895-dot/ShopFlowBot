import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  getCustomer,
  getCustomerTags,
  getCustomerOrders,
  recordSale,
  deductPoints,
  updateCustomer,
  createCustomerEvent,
  updateCustomerEvent,
  deleteCustomerEvent,
} from '../../../api/sellerClient';
import type { SellerCustomerDetail as CustomerDetailType, SellerOrder, CustomerEvent } from '../../../api/sellerClient';
import {
  useToast,
  useConfirm,
  PageHeader,
  StatusBadge,
  EmptyState,
  FormField,
  Skeleton,
} from '@shared/components/ui';
import {
  User,
  Zap,
  Plus,
  Minus,
  StickyNote,
  Pencil,
  CalendarHeart,
  CalendarPlus,
  ShoppingBag,
  History,
  Receipt,
  X,
  Check,
} from 'lucide-react';
import './shared.css';
import './CustomerDetail.css';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function formatDateShort(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  } catch {
    return iso;
  }
}

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'Ожидает',
  accepted: 'Принят',
  assembling: 'Собирается',
  in_transit: 'В пути',
  ready_for_pickup: 'Готов к выдаче',
  done: 'Выполнен',
  completed: 'Завершён',
  rejected: 'Отклонён',
};

const ORDER_STATUS_VARIANT: Record<string, 'success' | 'danger' | 'warning' | 'info' | 'neutral'> = {
  pending: 'warning',
  accepted: 'info',
  assembling: 'info',
  in_transit: 'info',
  ready_for_pickup: 'warning',
  done: 'success',
  completed: 'success',
  rejected: 'danger',
};

function getInitials(firstName?: string | null, lastName?: string | null): string {
  if (firstName && lastName) return (firstName[0] + lastName[0]).toUpperCase();
  if (firstName) return firstName.slice(0, 2).toUpperCase();
  if (lastName) return lastName.slice(0, 2).toUpperCase();
  return '';
}

export function CustomerDetail() {
  const toast = useToast();
  const confirm = useConfirm();
  const { id } = useParams<{ id: string }>();

  const [detail, setDetail] = useState<CustomerDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [customerOrders, setCustomerOrders] = useState<SellerOrder[]>([]);

  // Sale & deduct
  const [saleAmount, setSaleAmount] = useState('');
  const [saleSubmitting, setSaleSubmitting] = useState(false);
  const [deductPointsAmount, setDeductPointsAmount] = useState('');
  const [deductSubmitting, setDeductSubmitting] = useState(false);

  // Notes & tags
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [customerNotes, setCustomerNotes] = useState('');
  const [customerTags, setCustomerTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [customerBirthday, setCustomerBirthday] = useState('');
  const [allTags, setAllTags] = useState<string[]>([]);
  const [notesSaving, setNotesSaving] = useState(false);

  // Events
  const [events, setEvents] = useState<CustomerEvent[]>([]);
  const [showEventForm, setShowEventForm] = useState(false);
  const [eventForm, setEventForm] = useState({ title: '', event_date: '', remind_days_before: '3', notes: '' });
  const [eventSubmitting, setEventSubmitting] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CustomerEvent | null>(null);

  const loadDetail = useCallback(async (customerId: number) => {
    setLoading(true);
    try {
      const [data, orders, tags] = await Promise.all([
        getCustomer(customerId),
        getCustomerOrders(customerId),
        getCustomerTags(),
      ]);
      setDetail(data);
      setCustomerOrders(orders || []);
      setAllTags(tags || []);
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
    }
  }, [id, loadDetail]);

  /* ── Handlers ───────────────────────────── */

  const handleRecordSale = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(saleAmount.replace(',', '.'));
    if (isNaN(amount) || amount <= 0 || !detail) {
      toast.warning('Введите сумму больше 0');
      return;
    }
    setSaleSubmitting(true);
    try {
      const result = await recordSale(detail.id, amount);
      setSaleAmount('');
      setDetail((d) => d ? {
        ...d,
        points_balance: result.new_balance,
        transactions: [{ id: -Date.now(), amount: result.amount, points_accrued: result.points_accrued, order_id: null, created_at: new Date().toISOString() }, ...d.transactions],
      } : null);
      toast.success(`+${result.points_accrued} баллов начислено`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setSaleSubmitting(false);
    }
  };

  const handleDeductPoints = async (e: React.FormEvent) => {
    e.preventDefault();
    const points = parseFloat(deductPointsAmount.replace(',', '.'));
    if (isNaN(points) || points <= 0 || !detail) {
      toast.warning('Введите положительное количество баллов');
      return;
    }
    setDeductSubmitting(true);
    try {
      const result = await deductPoints(detail.id, points);
      setDeductPointsAmount('');
      setDetail((d) => d ? {
        ...d,
        points_balance: result.new_balance,
        transactions: [{ id: -Date.now(), amount: 0, points_accrued: -result.points_deducted, order_id: null, created_at: new Date().toISOString() }, ...d.transactions],
      } : null);
      toast.success(`${result.points_deducted} баллов списано`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setDeductSubmitting(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!detail) return;
    setNotesSaving(true);
    try {
      const result = await updateCustomer(detail.id, {
        notes: customerNotes,
        tags: customerTags,
        birthday: customerBirthday || null,
      });
      setDetail((d) => d ? { ...d, notes: result.notes, tags: Array.isArray(result.tags) ? result.tags : [], birthday: result.birthday } : null);
      setIsEditingNotes(false);
      toast.success('Сохранено');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setNotesSaving(false);
    }
  };

  const handleCancelEditNotes = () => {
    if (detail) {
      setCustomerNotes(detail.notes || '');
      setCustomerTags(Array.isArray(detail.tags) ? detail.tags : []);
      setCustomerBirthday(detail.birthday || '');
    }
    setIsEditingNotes(false);
  };

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail || !eventForm.title.trim() || !eventForm.event_date) {
      toast.warning('Заполните название и дату');
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
      setShowEventForm(false);
      toast.success('Дата добавлена');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
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
        remind_days_before: eventForm.remind_days_before !== '' ? parseInt(eventForm.remind_days_before) : undefined,
        notes: eventForm.notes.trim() || null,
      });
      setEvents((prev) => prev.map((x) => (x.id === ev.id ? ev : x)));
      setEditingEvent(null);
      setEventForm({ title: '', event_date: '', remind_days_before: '3', notes: '' });
      setShowEventForm(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setEventSubmitting(false);
    }
  };

  const handleDeleteEvent = async (eventId: number) => {
    if (!detail || !await confirm({ message: 'Удалить это событие?' })) return;
    try {
      await deleteCustomerEvent(detail.id, eventId);
      setEvents((prev) => prev.filter((x) => x.id !== eventId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
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
    setShowEventForm(true);
  };

  /* ── Loading ────────────────────────────── */
  if (loading) {
    return (
      <div className="cdetail">
        <Skeleton width="200px" height="32px" className="cdetail-skeleton-mb" />
        <Skeleton height="200px" borderRadius="var(--radius-lg)" className="cdetail-skeleton-mb" />
        <Skeleton height="120px" borderRadius="var(--radius-lg)" className="cdetail-skeleton-mb" />
        <Skeleton height="160px" borderRadius="var(--radius-lg)" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="cdetail">
        <PageHeader
          title="Клиент не найден"
          breadcrumbs={[
            { label: 'Клиенты', to: '/customers' },
            { label: 'Не найден' },
          ]}
        />
        <EmptyState title="Клиент не найден" message="Вернитесь к списку клиентов" />
      </div>
    );
  }

  const fullName = `${detail.last_name || ''} ${detail.first_name || ''}`.trim() || 'Клиент';
  const initials = getInitials(detail.first_name, detail.last_name);

  return (
    <div className="cdetail">
      {/* Header */}
      <PageHeader
        title={fullName}
        subtitle={detail.card_number}
        breadcrumbs={[
          { label: 'Клиенты', to: '/customers' },
          { label: detail.card_number || `#${detail.id}` },
        ]}
      />

      {/* ═══ Section 1: Customer Info ═══ */}
      <div className="crm-card">
        <div className="crm-card__header">
          <div className="crm-card__header-left">
            <div className="crm-card__icon-badge">
              <User size={18} />
            </div>
            <div>
              <h3 className="crm-card__title">Информация о клиенте</h3>
              <p className="crm-card__subtitle">{detail.card_number}</p>
            </div>
          </div>
          <div className="crm-avatar--lg crm-avatar">
            {initials || <User size={22} />}
          </div>
        </div>

        <div className="crm-view__grid">
          <div className="crm-view__item crm-view__item--wide">
            <span className="crm-view__label">Имя</span>
            <span className="crm-view__value crm-view__value--primary">{fullName}</span>
          </div>
          <div className="crm-view__item">
            <span className="crm-view__label">Телефон</span>
            <span className="crm-view__value">{detail.phone}</span>
          </div>
          <div className="crm-view__item">
            <span className="crm-view__label">Баланс баллов</span>
            <span className="crm-view__value crm-view__value--accent">{detail.points_balance} баллов</span>
          </div>
          {detail.tier?.name && (
            <div className="crm-view__item">
              <span className="crm-view__label">Уровень</span>
              <span className="crm-view__value">
                <StatusBadge variant="warning">{detail.tier.name}</StatusBadge>
                <span className="cdetail-tier-hint"> {detail.tier.points_percent}% баллов</span>
                {detail.tier.next_tier && detail.tier.amount_to_next != null && (
                  <span className="cdetail-tier-next">
                    до «{detail.tier.next_tier}» — {detail.tier.amount_to_next.toLocaleString('ru-RU')} ₽
                  </span>
                )}
              </span>
            </div>
          )}
          {detail.birthday && (
            <div className="crm-view__item">
              <span className="crm-view__label">День рождения</span>
              <span className="crm-view__value">{formatDateShort(detail.birthday)}</span>
            </div>
          )}
          {detail.total_purchases != null && detail.total_purchases > 0 && (
            <div className="crm-view__item">
              <span className="crm-view__label">Сумма покупок</span>
              <span className="crm-view__value">{detail.total_purchases.toLocaleString('ru')} ₽</span>
            </div>
          )}
          {detail.completed_orders_count != null && detail.completed_orders_count > 0 && (
            <div className="crm-view__item">
              <span className="crm-view__label">Выполнено заказов</span>
              <span className="crm-view__value">{detail.completed_orders_count}</span>
            </div>
          )}
          {detail.last_order_at && (
            <div className="crm-view__item">
              <span className="crm-view__label">Последний заказ</span>
              <span className="crm-view__value">{formatDate(detail.last_order_at)}</span>
            </div>
          )}
        </div>
      </div>

      {/* ═══ Section 2: Quick Actions ═══ */}
      <div className="crm-card">
        <div className="crm-card__header">
          <div className="crm-card__header-left">
            <div className="crm-card__icon-badge crm-card__icon-badge--amber">
              <Zap size={18} />
            </div>
            <div>
              <h3 className="crm-card__title">Быстрые действия</h3>
              <p className="crm-card__subtitle">Внести продажу или списать баллы</p>
            </div>
          </div>
        </div>

        <div className="cdetail-actions-grid">
          {/* Record sale */}
          <form onSubmit={handleRecordSale} className="cdetail-action-form">
            <FormField label="Внести продажу">
              <input
                type="text"
                inputMode="decimal"
                placeholder="Сумма, ₽"
                value={saleAmount}
                onChange={(e) => setSaleAmount(e.target.value)}
              />
            </FormField>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saleSubmitting}>
              <Plus size={14} />
              {saleSubmitting ? '...' : 'Начислить баллы'}
            </button>
          </form>

          {/* Deduct points */}
          <form onSubmit={handleDeductPoints} className="cdetail-action-form">
            <FormField label="Списать баллы">
              <input
                type="text"
                inputMode="decimal"
                placeholder="Кол-во баллов"
                value={deductPointsAmount}
                onChange={(e) => setDeductPointsAmount(e.target.value)}
              />
            </FormField>
            <button type="submit" className="btn btn-sm cdetail-btn-deduct" disabled={deductSubmitting}>
              <Minus size={14} />
              {deductSubmitting ? '...' : 'Списать'}
            </button>
          </form>
        </div>
      </div>

      {/* ═══ Section 3: Notes & Tags ═══ */}
      <div className="crm-card">
        <div className="crm-card__header">
          <div className="crm-card__header-left">
            <div className="crm-card__icon-badge crm-card__icon-badge--teal">
              <StickyNote size={18} />
            </div>
            <div>
              <h3 className="crm-card__title">Заметки и теги</h3>
              <p className="crm-card__subtitle">Внутренняя информация о клиенте</p>
            </div>
          </div>
          {!isEditingNotes ? (
            <button className="crm-card__edit-btn" onClick={() => setIsEditingNotes(true)}>
              <Pencil size={14} /> Изменить
            </button>
          ) : (
            <div className="cdetail-notes-actions">
              <button className="btn btn-primary btn-sm" onClick={handleSaveNotes} disabled={notesSaving}>
                <Check size={14} /> {notesSaving ? '...' : 'Сохранить'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={handleCancelEditNotes}>
                Отмена
              </button>
            </div>
          )}
        </div>

        {!isEditingNotes ? (
          /* View mode */
          <div className="cdetail-notes-view">
            {detail.notes ? (
              <p className="cdetail-notes-text">{detail.notes}</p>
            ) : (
              <p className="cdetail-notes-empty">Нет заметок</p>
            )}
            {customerTags.length > 0 && (
              <div className="cdetail-tags-row">
                {customerTags.map((tag, i) => (
                  <span key={i} className="cdetail-tag">{tag}</span>
                ))}
              </div>
            )}
            {detail.birthday && (
              <div className="cdetail-notes-birthday">
                День рождения: {formatDateShort(detail.birthday)}
              </div>
            )}
          </div>
        ) : (
          /* Edit mode */
          <div className="crm-form">
            <FormField label="Заметка">
              <textarea
                value={customerNotes}
                onChange={(e) => setCustomerNotes(e.target.value)}
                placeholder="Примечания о клиенте"
                rows={3}
              />
            </FormField>

            <FormField label="Теги">
              <div className="cdetail-tags-row" style={{ marginBottom: 'var(--space-2)' }}>
                {customerTags.map((tag, i) => (
                  <span key={i} className="cdetail-tag cdetail-tag--editable">
                    {tag}
                    <button
                      type="button"
                      className="cdetail-tag__remove"
                      onClick={() => setCustomerTags(customerTags.filter((_, j) => j !== i))}
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="cdetail-tag-input">
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
                />
                <datalist id="tag-suggestions">
                  {allTags.filter((t) => !customerTags.includes(t)).map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
                <button
                  type="button"
                  className="cdetail-tag-add"
                  onClick={() => {
                    const tag = newTagInput.trim();
                    if (tag && !customerTags.includes(tag)) setCustomerTags([...customerTags, tag]);
                    setNewTagInput('');
                  }}
                >
                  <Plus size={14} />
                </button>
              </div>
            </FormField>

            <FormField label="День рождения">
              <input
                type="date"
                value={customerBirthday}
                onChange={(e) => setCustomerBirthday(e.target.value)}
              />
            </FormField>
          </div>
        )}
      </div>

      {/* ═══ Section 4: Significant Dates ═══ */}
      <div className="crm-card">
        <div className="crm-card__header">
          <div className="crm-card__header-left">
            <div className="crm-card__icon-badge crm-card__icon-badge--pink">
              <CalendarHeart size={18} />
            </div>
            <div>
              <h3 className="crm-card__title">Значимые даты</h3>
              <p className="crm-card__subtitle">Памятные события клиента</p>
            </div>
          </div>
          {!showEventForm && (
            <button
              className="crm-card__edit-btn"
              onClick={() => { setEditingEvent(null); setEventForm({ title: '', event_date: '', remind_days_before: '3', notes: '' }); setShowEventForm(true); }}
            >
              <Plus size={14} /> Добавить
            </button>
          )}
        </div>

        {events.length > 0 ? (
          <div className="cdetail-events-list">
            {events.map((ev) => (
              <div key={ev.id} className="cdetail-event">
                <div className="cdetail-event__info">
                  <span className="cdetail-event__title">{ev.title}</span>
                  {ev.event_date && (
                    <span className="cdetail-event__date">{formatDateShort(ev.event_date)}</span>
                  )}
                  {ev.notes && <span className="cdetail-event__notes">{ev.notes}</span>}
                  <span className="cdetail-event__remind">за {ev.remind_days_before} дн.</span>
                </div>
                <div className="cdetail-event__actions">
                  <button type="button" className="cdetail-event__btn" onClick={() => startEditEvent(ev)}>
                    <Pencil size={12} />
                  </button>
                  <button type="button" className="cdetail-event__btn cdetail-event__btn--danger" onClick={() => handleDeleteEvent(ev.id)}>
                    <X size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : !showEventForm ? (
          <EmptyState
            icon={<CalendarPlus size={36} />}
            title="Нет значимых дат"
            message="Добавьте памятные даты клиента — мы напомним заранее"
            action={
              <button
                className="btn btn-primary btn-sm"
                onClick={() => { setEditingEvent(null); setEventForm({ title: '', event_date: '', remind_days_before: '3', notes: '' }); setShowEventForm(true); }}
              >
                <Plus size={14} /> Добавить дату
              </button>
            }
          />
        ) : null}

        {/* Event form */}
        {showEventForm && (
          <form onSubmit={editingEvent ? handleUpdateEvent : handleAddEvent} className="cdetail-event-form">
            <div className="crm-form__row-2col">
              <FormField label="Название">
                <input
                  type="text"
                  placeholder="ДР жены, годовщина..."
                  value={eventForm.title}
                  onChange={(e) => setEventForm((f) => ({ ...f, title: e.target.value }))}
                />
              </FormField>
              <FormField label="Дата">
                <input
                  type="date"
                  value={eventForm.event_date}
                  onChange={(e) => setEventForm((f) => ({ ...f, event_date: e.target.value }))}
                />
              </FormField>
            </div>
            <div className="crm-form__row-2col">
              <FormField label="Напомнить за (дн.)">
                <input
                  type="number"
                  min={0}
                  max={90}
                  value={eventForm.remind_days_before}
                  onChange={(e) => setEventForm((f) => ({ ...f, remind_days_before: e.target.value }))}
                />
              </FormField>
              <FormField label="Заметка">
                <input
                  type="text"
                  placeholder="Необязательно"
                  value={eventForm.notes}
                  onChange={(e) => setEventForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </FormField>
            </div>
            <div className="crm-form__actions">
              <button type="submit" className="btn btn-primary btn-sm" disabled={eventSubmitting}>
                {eventSubmitting ? '...' : editingEvent ? 'Обновить' : 'Добавить'}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => { setEditingEvent(null); setShowEventForm(false); setEventForm({ title: '', event_date: '', remind_days_before: '3', notes: '' }); }}
              >
                Отмена
              </button>
            </div>
          </form>
        )}
      </div>

      {/* ═══ Section 5: Orders ═══ */}
      {customerOrders.length > 0 && (
        <div className="crm-card">
          <div className="crm-card__header">
            <div className="crm-card__header-left">
              <div className="crm-card__icon-badge crm-card__icon-badge--green">
                <ShoppingBag size={18} />
              </div>
              <div>
                <h3 className="crm-card__title">Заказы</h3>
                <p className="crm-card__subtitle">{customerOrders.length} заказов</p>
              </div>
            </div>
          </div>

          <div className="cdetail-orders">
            {customerOrders.map((o) => (
              <Link key={o.id} to={`/orders/${o.id}`} className="cdetail-order">
                <span className="cdetail-order__id">#{o.id}</span>
                <span className="cdetail-order__price">{o.total_price} ₽</span>
                <StatusBadge variant={ORDER_STATUS_VARIANT[o.status] || 'neutral'} size="sm">
                  {ORDER_STATUS_LABELS[o.status] || o.status}
                </StatusBadge>
                <span className="cdetail-order__date">{formatDate(o.created_at ?? null)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ═══ Section 6: Transaction History ═══ */}
      <div className="crm-card">
        <div className="crm-card__header">
          <div className="crm-card__header-left">
            <div className="crm-card__icon-badge">
              <History size={18} />
            </div>
            <div>
              <h3 className="crm-card__title">История операций</h3>
              <p className="crm-card__subtitle">Начисления и списания баллов</p>
            </div>
          </div>
        </div>

        {detail.transactions.length === 0 ? (
          <EmptyState
            icon={<Receipt size={36} />}
            title="Пока нет записей"
            message="История появится после первой транзакции"
          />
        ) : (
          <div className="cdetail-transactions">
            {detail.transactions.map((t) => (
              <div key={t.id} className="cdetail-tx">
                <span className="cdetail-tx__date">{formatDate(t.created_at)}</span>
                {t.amount > 0 && <span className="cdetail-tx__amount">{t.amount} ₽</span>}
                <span className={`cdetail-tx__points ${t.points_accrued >= 0 ? 'cdetail-tx__points--plus' : 'cdetail-tx__points--minus'}`}>
                  {t.points_accrued >= 0 ? `+${t.points_accrued}` : t.points_accrued} б.
                </span>
                {t.order_id != null && (
                  <Link to={`/orders/${t.order_id}`} className="cdetail-tx__order">
                    Заказ #{t.order_id}
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
