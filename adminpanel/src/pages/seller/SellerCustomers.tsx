import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import {
  getLoyaltySettings,
  updateLoyaltySettings,
  getCustomers,
  createCustomer,
  getCustomer,
  recordSale,
  getCustomerOrders,
  deductPoints,
  updateCustomer,
  exportCustomersCSV,
} from '../../api/sellerClient';
import type { SellerCustomerBrief, SellerCustomerDetail, SellerOrder } from '../../api/sellerClient';
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
  const [customers, setCustomers] = useState<SellerCustomerBrief[]>([]);
  const [detail, setDetail] = useState<SellerCustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [pointsPercent, setPointsPercent] = useState<string>('');
  const [pointsSaving, setPointsSaving] = useState(false);
  const [addForm, setAddForm] = useState({ phone: '', first_name: '', last_name: '' });
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [saleAmount, setSaleAmount] = useState('');
  const [saleSubmitting, setSaleSubmitting] = useState(false);
  const [deductPointsAmount, setDeductPointsAmount] = useState('');
  const [deductSubmitting, setDeductSubmitting] = useState(false);
  const [customerOrders, setCustomerOrders] = useState<SellerOrder[]>([]);
  const [search, setSearch] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');
  const [customerTags, setCustomerTags] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);

  const loadList = useCallback(async () => {
    try {
      const [list, settings] = await Promise.all([getCustomers(), getLoyaltySettings()]);
      setCustomers(list || []);
      setPointsPercent(String(settings.points_percent ?? ''));
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
      setCustomerTags(data.tags || '');
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

  const handleSavePointsPercent = async () => {
    const num = parseFloat(pointsPercent.replace(',', '.'));
    if (isNaN(num) || num < 0 || num > 100) {
      alert('Введите число от 0 до 100');
      return;
    }
    setPointsSaving(true);
    try {
      await updateLoyaltySettings(num);
      setPointsPercent(String(num));
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
      await createCustomer({ phone: digits, first_name: first_name.trim(), last_name: last_name.trim() });
      setAddForm({ phone: '', first_name: '', last_name: '' });
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
      const result = await updateCustomer(detail.id, { notes: customerNotes, tags: customerTags });
      setDetail((d) => (d ? { ...d, notes: result.notes, tags: result.tags } : null));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setNotesSaving(false);
    }
  };

  const filteredCustomers = search.trim()
    ? customers.filter(
        (c) =>
          c.phone.includes(search) ||
          `${c.first_name} ${c.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
          c.card_number.toLowerCase().includes(search.toLowerCase())
      )
    : customers;

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
              <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem' }}>Теги (через запятую)</label>
              <input
                type="text"
                value={customerTags}
                onChange={(e) => setCustomerTags(e.target.value)}
                placeholder="vip, частый, новый"
                style={{ width: '100%', padding: '0.5rem', fontSize: '0.95rem' }}
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
        <label>Процент начисления баллов (%)</label>
        <div className="row">
          <input
            type="text"
            inputMode="decimal"
            value={pointsPercent}
            onChange={(e) => setPointsPercent(e.target.value)}
            placeholder="0"
          />
          <button type="button" onClick={handleSavePointsPercent} disabled={pointsSaving}>
            {pointsSaving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
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
          <button type="submit" disabled={addSubmitting}>
            {addSubmitting ? '…' : 'Добавить'}
          </button>
        </form>
      </div>
      <div className="customers-search-and-export">
        <input
          type="search"
          placeholder="Поиск по имени, телефону или номеру карты"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="button" className="btn btn-secondary" onClick={handleExportCustomers}>
          Экспорт CSV
        </button>
      </div>
      {loading ? (
        <div className="customers-loading">Загрузка...</div>
      ) : (
        <div className="customers-list">
          {filteredCustomers.length === 0 ? (
            <p className="meta">Нет клиентов. Добавьте первого.</p>
          ) : (
            filteredCustomers.map((c) => (
              <button
                key={c.id}
                type="button"
                className="customer-row"
                onClick={() => navigate(`/customers/${c.id}`)}
              >
                <div>
                  <div className="name">
                    {c.last_name} {c.first_name}
                  </div>
                  <div className="meta">
                    {c.phone} · {c.card_number} · добавлен {formatDate(c.created_at)}
                  </div>
                </div>
                <div className="points">{c.points_balance} баллов</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
