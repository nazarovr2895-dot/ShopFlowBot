import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getLoyaltySettings,
  updateLoyaltySettings,
  getCustomers,
  createCustomer,
  getCustomer,
  recordSale,
} from '../../api/sellerClient';
import type { SellerCustomerBrief, SellerCustomerDetail } from '../../api/sellerClient';
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
  const [search, setSearch] = useState('');

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
      const data = await getCustomer(customerId);
      setDetail(data);
    } catch {
      setDetail(null);
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
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Ошибка');
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

  const filteredCustomers = search.trim()
    ? customers.filter(
        (c) =>
          c.phone.includes(search) ||
          `${c.first_name} ${c.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
          c.card_number.toLowerCase().includes(search.toLowerCase())
      )
    : customers;

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
        <div className="transactions-list">
          <h3>История покупок</h3>
          {detail.transactions.length === 0 ? (
            <p className="meta">Пока нет записей.</p>
          ) : (
            detail.transactions.map((t) => (
              <div key={t.id} className="transaction-item">
                <span className="date">{formatDate(t.created_at)}</span>
                <span className="amount">{t.amount} ₽</span>
                <span className="points">+{t.points_accrued} баллов</span>
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
      <div className="customers-search">
        <input
          type="search"
          placeholder="Поиск по имени, телефону или номеру карты"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
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
