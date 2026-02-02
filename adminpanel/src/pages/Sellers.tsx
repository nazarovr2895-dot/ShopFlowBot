import { useEffect, useState } from 'react';
import {
  searchSellers,
  getAllSellers,
  createSeller,
  updateSellerField,
  blockSeller,
  deleteSeller,
  setSellerLimit,
} from '../api/adminClient';
import type { Seller } from '../types';
import './Sellers.css';

const DELIVERY_TYPES = [
  { value: 'pickup', label: 'Самовывоз' },
  { value: 'delivery', label: 'Доставка' },
  { value: 'both', label: 'Оба' },
];

const DISTRICTS_MSK = [
  { id: 1, name: 'ЦАО' }, { id: 2, name: 'САО' }, { id: 3, name: 'СВАО' },
  { id: 4, name: 'ВАО' }, { id: 5, name: 'ЮВАО' }, { id: 6, name: 'ЮАО' },
  { id: 7, name: 'ЮЗАО' }, { id: 8, name: 'ЗАО' }, { id: 9, name: 'СЗАО' },
  { id: 10, name: 'Зеленоградский' }, { id: 11, name: 'Новомосковский' }, { id: 12, name: 'Троицкий' },
];

export function Sellers() {
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Seller | null>(null);
  const [managing, setManaging] = useState<Seller | null>(null);

  const loadSellers = async () => {
    setLoading(true);
    try {
      const list = query.trim()
        ? await searchSellers(query.trim())
        : await getAllSellers(true);
      setSellers(list || []);
    } catch {
      setSellers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSellers();
  }, []);

  const handleSearch = () => loadSellers();

  return (
    <div className="sellers-page">
      <div className="page-header">
        <h1 className="page-title">Продавцы</h1>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          ➕ Добавить продавца
        </button>
      </div>

      <div className="search-bar card">
        <input
          type="text"
          className="form-input"
          placeholder="Поиск по ФИО..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <button className="btn btn-secondary" onClick={handleSearch}>Поиск</button>
      </div>

      {loading ? (
        <div className="loading-row"><div className="loader" /></div>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ФИО</th>
                <th>Магазин</th>
                <th>ID</th>
                <th>Статус</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sellers.map((s) => (
                <tr key={s.tg_id}>
                  <td>{s.fio}</td>
                  <td>{s.shop_name}</td>
                  <td><code>{s.tg_id}</code></td>
                  <td>
                    {s.is_deleted ? (
                      <span className="badge badge-warning">Удалён</span>
                    ) : s.is_blocked ? (
                      <span className="badge badge-danger">Заблокирован</span>
                    ) : (
                      <span className="badge badge-success">Активен</span>
                    )}
                  </td>
                  <td>
                    <div className="btn-group">
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => setEditing(s)}
                      >
                        Изменить
                      </button>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => setManaging(s)}
                      >
                        Управление
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {sellers.length === 0 && (
            <p className="empty-text">Продавцы не найдены</p>
          )}
        </div>
      )}

      {showAdd && (
        <AddSellerModal
          onClose={() => setShowAdd(false)}
          onSuccess={() => {
            setShowAdd(false);
            loadSellers();
          }}
        />
      )}
      {editing && (
        <EditSellerModal
          seller={editing}
          onClose={() => setEditing(null)}
          onSuccess={() => {
            setEditing(null);
            loadSellers();
          }}
        />
      )}
      {managing && (
        <ManageSellerModal
          seller={managing}
          onClose={() => setManaging(null)}
          onSuccess={() => {
            setManaging(null);
            loadSellers();
          }}
        />
      )}
    </div>
  );
}

function AddSellerModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [fio, setFio] = useState('');
  const [tgId, setTgId] = useState('');
  const [phone, setPhone] = useState('');
  const [shopName, setShopName] = useState('');
  const [description, setDescription] = useState('');
  const [districtId, setDistrictId] = useState(1);
  const [mapUrl, setMapUrl] = useState('');
  const [deliveryType, setDeliveryType] = useState('both');
  const [deliveryPrice, setDeliveryPrice] = useState('0');
  const [expiryDate, setExpiryDate] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        tg_id: parseInt(tgId, 10),
        fio,
        phone,
        shop_name: shopName,
        description: description || undefined,
        city_id: 1,
        district_id: districtId,
        map_url: mapUrl || undefined,
        delivery_type: deliveryType,
        delivery_price: parseFloat(deliveryPrice) || 0,
      };
      if (expiryDate) {
        const [d, m, y] = expiryDate.split('.');
        if (d && m && y) payload.placement_expired_at = `${y}-${m}-${d}`;
      }
      const res = await createSeller(payload);
      if (res?.status === 'ok' || res?.status === undefined) {
        onSuccess();
      } else {
        setError('Ошибка создания. Проверьте Telegram ID — возможно, продавец уже существует.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Добавить продавца" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <FormRow label="ФИО" value={fio} onChange={setFio} required />
        <FormRow label="Telegram ID" value={tgId} onChange={setTgId} required type="number" />
        <FormRow label="Телефон" value={phone} onChange={setPhone} required />
        <FormRow label="Название магазина" value={shopName} onChange={setShopName} required />
        <FormRow label="Описание" value={description} onChange={setDescription} textarea />
        <FormRow label="Округ" render={
          <select className="form-input" value={districtId} onChange={(e) => setDistrictId(parseInt(e.target.value, 10))}>
            {DISTRICTS_MSK.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        } />
        <FormRow label="Адрес (Яндекс.Карты)" value={mapUrl} onChange={setMapUrl} />
        <FormRow label="Тип доставки" render={
          <select className="form-input" value={deliveryType} onChange={(e) => setDeliveryType(e.target.value)}>
            {DELIVERY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        } />
        <FormRow label="Стоимость доставки (₽)" value={deliveryPrice} onChange={setDeliveryPrice} type="number" />
        <FormRow label="Дата окончания размещения (ДД.ММ.ГГГГ)" value={expiryDate} onChange={setExpiryDate} />
        {error && <div className="modal-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Отмена</button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Создание...' : 'Создать'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditSellerModal({
  seller,
  onClose,
  onSuccess,
}: {
  seller: Seller;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [field, setField] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fields = [
    { id: 'fio', label: 'ФИО' },
    { id: 'phone', label: 'Телефон' },
    { id: 'shop_name', label: 'Название магазина' },
    { id: 'description', label: 'Описание' },
    { id: 'map_url', label: 'Адрес' },
    { id: 'delivery_type', label: 'Тип доставки' },
    { id: 'delivery_price', label: 'Стоимость доставки' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!field) return;
    setError('');
    setSubmitting(true);
    try {
      const res = await updateSellerField(seller.tg_id, field, value);
      if (res?.status === 'ok') {
        onSuccess();
      } else {
        setError('Ошибка обновления');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={`Изменить: ${seller.fio}`} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <FormRow label="Поле" render={
          <select className="form-input" value={field} onChange={(e) => setField(e.target.value)}>
            <option value="">Выберите...</option>
            {fields.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
        } />
        {field === 'delivery_type' ? (
          <FormRow label="Значение" render={
            <select className="form-input" value={value} onChange={(e) => setValue(e.target.value)}>
              {DELIVERY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          } />
        ) : (
          <FormRow label="Новое значение" value={value} onChange={setValue} required />
        )}
        {error && <div className="modal-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Отмена</button>
          <button type="submit" className="btn btn-primary" disabled={submitting || !field}>
            Сохранить
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ManageSellerModal({
  seller,
  onClose,
  onSuccess,
}: {
  seller: Seller;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [limit, setLimit] = useState(String(seller.max_orders ?? 10));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const handleBlock = async () => {
    setLoading(true);
    setMsg('');
    try {
      const res = await blockSeller(seller.tg_id, !seller.is_blocked);
      if (res?.status === 'ok') onSuccess();
      else setMsg('Ошибка');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  const handleSetLimit = async () => {
    setLoading(true);
    setMsg('');
    try {
      const res = await setSellerLimit(seller.tg_id, parseInt(limit, 10));
      if (res?.status === 'ok') {
        setMsg('Лимит обновлён');
      } else {
        setMsg((res as { message?: string })?.message || 'Ошибка');
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setLoading(true);
    setMsg('');
    try {
      const res = await deleteSeller(seller.tg_id);
      if (res?.status === 'ok') onSuccess();
      else setMsg('Ошибка удаления');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title={`Управление: ${seller.fio}`} onClose={onClose}>
      <div className="manage-seller">
        <p><strong>Магазин:</strong> {seller.shop_name}</p>
        <p><strong>Статус:</strong> {seller.is_blocked ? 'Заблокирован' : 'Активен'}</p>

        <div className="form-group">
          <label className="form-label">Лимит заказов</label>
          <div className="input-row">
            <input
              type="number"
              className="form-input"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
            <button className="btn btn-primary" onClick={handleSetLimit} disabled={loading}>
              Установить
            </button>
          </div>
        </div>

        <div className="manage-actions">
          <button
            className={`btn ${seller.is_blocked ? 'btn-secondary' : 'btn-danger'}`}
            onClick={handleBlock}
            disabled={loading}
          >
            {seller.is_blocked ? 'Разблокировать' : 'Заблокировать'}
          </button>
          <button
            className="btn btn-danger"
            onClick={handleDelete}
            disabled={loading}
          >
            {confirmDelete ? 'Подтвердить удаление' : 'Удалить (Hard)'}
          </button>
        </div>

        {msg && <div className="modal-error">{msg}</div>}
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </Modal>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

function FormRow({
  label,
  value,
  onChange,
  required,
  type = 'text',
  textarea,
  render,
}: {
  label: string;
  value?: string;
  onChange?: (v: string) => void;
  required?: boolean;
  type?: string;
  textarea?: boolean;
  render?: React.ReactNode;
}) {
  return (
    <div className="form-group">
      <label className="form-label">{label}{required && ' *'}</label>
      {render ?? (
        textarea ? (
          <textarea
            className="form-input"
            value={value || ''}
            onChange={(e) => onChange?.(e.target.value)}
            rows={3}
          />
        ) : (
          <input
            type={type}
            className="form-input"
            value={value || ''}
            onChange={(e) => onChange?.(e.target.value)}
            required={required}
          />
        )
      )}
    </div>
  );
}
