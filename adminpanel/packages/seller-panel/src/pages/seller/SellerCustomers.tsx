import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import {
  getAllCustomers,
  getCustomerTags,
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
import type { UnifiedCustomerBrief, SellerCustomerDetail, SellerOrder, CustomerEvent } from '../../api/sellerClient';
import {
  useToast,
  useConfirm,
  PageHeader,
  StatCard,
  StatusBadge,
  DataRow,
  EmptyState,
  FormField,
  Card,
  SearchInput,
} from '@shared/components/ui';
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

const SEGMENT_BADGE_VARIANT: Record<string, 'success' | 'danger' | 'warning' | 'info' | 'neutral'> = {
  'VIP': 'warning',
  'Постоянный': 'success',
  'Новый': 'info',
  'Уходящий': 'danger',
  'Потерянный': 'neutral',
  'Случайный': 'neutral',
};

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

export function SellerCustomers() {
  const toast = useToast();
  const confirm = useConfirm();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<UnifiedCustomerBrief[]>([]);
  const [detail, setDetail] = useState<SellerCustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
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
  const [segmentCounts, setSegmentCounts] = useState<Record<string, number>>({});
  const [segmentFilter, setSegmentFilter] = useState('');

  const loadList = useCallback(async () => {
    try {
      const [list, tags] = await Promise.all([
        getAllCustomers(),
        getCustomerTags(),
      ]);
      setCustomers(list || []);
      setAllTags(tags || []);
      const counts: Record<string, number> = {};
      (list || []).forEach((c) => {
        if (c.segment) {
          counts[c.segment] = (counts[c.segment] || 0) + 1;
        }
      });
      setSegmentCounts(counts);
    } catch {
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, []);

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
    } else {
      loadList();
    }
  }, [id, loadList, loadDetail]);

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
      setDetail((d) => (d ? { ...d, points_balance: result.new_balance, transactions: [{ id: -Date.now(), amount: result.amount, points_accrued: result.points_accrued, order_id: null, created_at: new Date().toISOString() }, ...d.transactions] } : null));
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
      setDetail((d) => (d ? { ...d, points_balance: result.new_balance, transactions: [{ id: -Date.now(), amount: 0, points_accrued: -result.points_deducted, order_id: null, created_at: new Date().toISOString() }, ...d.transactions] } : null));
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
      const result = await updateCustomer(detail.id, { notes: customerNotes, tags: customerTags, birthday: customerBirthday || null });
      setDetail((d) => (d ? { ...d, notes: result.notes, tags: Array.isArray(result.tags) ? result.tags : [], birthday: result.birthday } : null));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setNotesSaving(false);
    }
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
      toast.error(e instanceof Error ? e.message : 'Ошибка экспорта');
    }
  };

  /* ─────── Detail view ─────── */
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
    return (
      <div className="customers-page customers-detail">
        <PageHeader
          title={`${detail.last_name || ''} ${detail.first_name || ''}`.trim() || 'Клиент'}
          subtitle={detail.card_number}
          breadcrumbs={[
            { label: 'Клиенты', to: '/customers' },
            { label: detail.card_number || `#${detail.id}` },
          ]}
        />

        {/* Customer info card */}
        <Card>
          <DataRow label="Телефон" value={detail.phone} />
          <DataRow label="Баланс" value={`${detail.points_balance} баллов`} accent />
          {detail.tier?.name && (
            <div className="customer-tier-row">
              <StatusBadge variant="warning">{detail.tier.name}</StatusBadge>
              <span className="customer-tier-percent">
                ({detail.tier.points_percent}% баллов)
              </span>
              {detail.tier.next_tier && detail.tier.amount_to_next != null && (
                <span className="customer-tier-next">
                  до «{detail.tier.next_tier}» — {detail.tier.amount_to_next.toLocaleString('ru-RU')} ₽
                </span>
              )}
            </div>
          )}
          {detail.birthday && (
            <DataRow
              label="День рождения"
              value={new Date(detail.birthday + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
            />
          )}
          {(detail.total_purchases != null && detail.total_purchases > 0) && (
            <DataRow label="Сумма покупок" value={`${detail.total_purchases.toLocaleString('ru')} ₽`} />
          )}
          {detail.last_order_at && (
            <DataRow label="Последний заказ" value={formatDate(detail.last_order_at)} />
          )}
          {(detail.completed_orders_count != null && detail.completed_orders_count > 0) && (
            <DataRow label="Выполнено заказов" value={detail.completed_orders_count} />
          )}
        </Card>

        {/* Notes & tags */}
        <Card className="customer-detail-section">
          <h3>Заметки и теги</h3>
          <div className="customer-notes-form">
            <FormField label="Заметка">
              <textarea
                value={customerNotes}
                onChange={(e) => setCustomerNotes(e.target.value)}
                placeholder="Примечания о клиенте (VIP, постоянный и т.д.)"
                rows={3}
              />
            </FormField>
            <FormField label="Теги">
              <div className="customer-tags-list">
                {customerTags.map((tag, i) => (
                  <span key={i} className="customer-tag">
                    {tag}
                    <button
                      type="button"
                      className="customer-tag-remove"
                      onClick={() => setCustomerTags(customerTags.filter((_, j) => j !== i))}
                    >
                      x
                    </button>
                  </span>
                ))}
              </div>
              <div className="customer-tag-input-row">
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
                  className="customer-tag-add-btn"
                  onClick={() => {
                    const tag = newTagInput.trim();
                    if (tag && !customerTags.includes(tag)) setCustomerTags([...customerTags, tag]);
                    setNewTagInput('');
                  }}
                >
                  +
                </button>
              </div>
            </FormField>
            <FormField label="День рождения" className="customer-birthday-input">
              <input
                type="date"
                value={customerBirthday}
                onChange={(e) => setCustomerBirthday(e.target.value)}
              />
            </FormField>
            <button
              type="button"
              className="customer-notes-save"
              onClick={handleSaveNotes}
              disabled={notesSaving}
            >
              {notesSaving ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </Card>

        {/* Events */}
        <Card className="customer-detail-section">
          <h3>Значимые даты</h3>
          {events.length > 0 && (
            <div className="customer-events-list">
              {events.map((ev) => (
                <div key={ev.id} className="customer-event-item">
                  <div className="customer-event-info">
                    <strong>{ev.title}</strong>
                    {ev.event_date && (
                      <> — {new Date(ev.event_date + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</>
                    )}
                    {ev.notes && <span className="customer-event-notes"> ({ev.notes})</span>}
                    <span className="customer-event-remind"> · напоминание за {ev.remind_days_before} дн.</span>
                  </div>
                  <div className="customer-event-actions">
                    <button type="button" className="customer-event-btn" onClick={() => startEditEvent(ev)}>Ред.</button>
                    <button type="button" className="customer-event-btn customer-event-btn--danger" onClick={() => handleDeleteEvent(ev.id)}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <form onSubmit={editingEvent ? handleUpdateEvent : handleAddEvent} className="customer-event-form">
            <div className="customer-event-form-row">
              <input
                type="text"
                placeholder="Название (ДР жены, годовщина...)"
                value={eventForm.title}
                onChange={(e) => setEventForm((f) => ({ ...f, title: e.target.value }))}
              />
              <input
                type="date"
                value={eventForm.event_date}
                onChange={(e) => setEventForm((f) => ({ ...f, event_date: e.target.value }))}
              />
              <input
                type="number"
                min="0"
                max="90"
                placeholder="Дни"
                title="За сколько дней напоминать"
                value={eventForm.remind_days_before}
                onChange={(e) => setEventForm((f) => ({ ...f, remind_days_before: e.target.value }))}
              />
            </div>
            <div className="customer-event-form-row">
              <input
                type="text"
                placeholder="Заметка (необязательно)"
                value={eventForm.notes}
                onChange={(e) => setEventForm((f) => ({ ...f, notes: e.target.value }))}
              />
              <button type="submit" className="customer-event-submit" disabled={eventSubmitting}>
                {eventSubmitting ? '...' : editingEvent ? 'Обновить' : 'Добавить'}
              </button>
              {editingEvent && (
                <button
                  type="button"
                  className="customer-event-cancel"
                  onClick={() => { setEditingEvent(null); setEventForm({ title: '', event_date: '', remind_days_before: '3', notes: '' }); }}
                >
                  Отмена
                </button>
              )}
            </div>
          </form>
        </Card>

        {/* Record sale */}
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
              {saleSubmitting ? '...' : 'Начислить баллы'}
            </button>
          </form>
        </div>

        {/* Deduct points */}
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
              {deductSubmitting ? '...' : 'Списать'}
            </button>
          </form>
        </div>

        {/* Orders */}
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

        {/* Transactions */}
        <div className="transactions-list">
          <h3>История покупок</h3>
          {detail.transactions.length === 0 ? (
            <EmptyState title="Пока нет записей" message="История покупок появится после первой транзакции" />
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

  /* ─────── List view ─────── */
  return (
    <div className="customers-page">
      {/* Stats */}
      <div className="customers-stats-grid">
        <StatCard label="Всего" value={customers.length} />
        <StatCard label="С картой" value={customers.filter(c => c.has_loyalty).length} />
        <StatCard label="Без карты" value={customers.filter(c => !c.has_loyalty).length} />
      </div>

      {/* Search + filters */}
      <div className="customers-search-and-export">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Поиск по имени, @username или телефону"
        />
        {allTags.length > 0 && (
          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
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
        >
          <option value="">Все сегменты</option>
          {Object.keys(segmentCounts).map((s) => (
            <option key={s} value={s}>{s} ({segmentCounts[s]})</option>
          ))}
        </select>
        <button type="button" className="customers-export-btn" onClick={handleExportCustomers}>
          Экспорт CSV
        </button>
      </div>

      {/* Segment filter buttons */}
      {Object.keys(segmentCounts).length > 0 && (
        <div className="segment-filter-row">
          {Object.entries(segmentCounts).map(([seg, count]) => (
            <button
              key={seg}
              type="button"
              className={`segment-filter-btn ${segmentFilter === seg ? 'segment-filter-btn--active' : ''}`}
              onClick={() => setSegmentFilter(segmentFilter === seg ? '' : seg)}
            >
              {seg}: {count}
            </button>
          ))}
        </div>
      )}

      {/* Customer list */}
      {loading ? (
        <div className="customers-loading">Загрузка...</div>
      ) : (
        <div className="customers-list">
          {filteredCustomers.length === 0 ? (
            <EmptyState
              title={customers.length === 0 ? 'Нет клиентов' : 'Ничего не найдено'}
              message={
                customers.length === 0
                  ? 'У вас пока нет клиентов. Покупатели могут подписаться на ваш магазин через каталог.'
                  : 'Попробуйте изменить параметры поиска'
              }
            />
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
                  className={`customer-row ${hasCard ? 'customer-row--clickable' : ''}`}
                  onClick={() => hasCard && navigate(`/customers/${c.loyalty_customer_id}`)}
                >
                  <div className="customer-row-main">
                    <div className="name">
                      {displayName}
                      {c.username && c.fio && (
                        <span className="customer-username">@{c.username}</span>
                      )}
                      {c.segment && (
                        <StatusBadge variant={SEGMENT_BADGE_VARIANT[c.segment] || 'neutral'} size="sm">
                          {c.segment}
                        </StatusBadge>
                      )}
                      {Array.isArray(c.tags) && c.tags.length > 0 && c.tags.map((tag, i) => (
                        <span key={i} className="customer-list-tag">{tag}</span>
                      ))}
                    </div>
                    <div className="meta">
                      {c.phone || '—'}
                      {c.loyalty_card_number && <> · {c.loyalty_card_number}</>}
                      {c.subscribed_at && <> · {formatDate(c.subscribed_at)}</>}
                    </div>
                  </div>
                  <div className="customer-row-right">
                    {c.has_loyalty ? (
                      <>
                        <div className="points">{c.loyalty_points} б.</div>
                        {hasCard && (
                          <Link
                            to={`/customers/${c.loyalty_customer_id}`}
                            className="loyalty-link"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Карточка
                          </Link>
                        )}
                      </>
                    ) : (
                      <span className="customer-no-card">Нет карты</span>
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
