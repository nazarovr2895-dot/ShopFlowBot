import { useEffect, useState } from 'react';
import {
  searchSellers,
  getAllSellers,
  createSeller,
  updateSellerField,
  blockSeller,
  deleteSeller,
  setSellerLimit,
  searchMetro,
} from '../api/adminClient';
import type { Seller, MetroStation } from '../types';
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

function formatPlacementExpired(iso: string | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
  } catch {
    return iso;
  }
}

function isPlacementExpired(iso: string | undefined): boolean {
  if (!iso) return false;
  try {
    const d = new Date(iso);
    return !Number.isNaN(d.getTime()) && d.getTime() < Date.now();
  } catch {
    return false;
  }
}

function placementExpiredToISO(value: string): string | undefined {
  const s = (value || '').trim();
  if (!s) return undefined;
  const parts = s.split('.');
  if (parts.length !== 3) return undefined;
  const d = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const y = parseInt(parts[2], 10);
  if (Number.isNaN(d) || Number.isNaN(m) || Number.isNaN(y)) return undefined;
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
}

export function Sellers() {
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedSeller, setSelectedSeller] = useState<Seller | null>(null);

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
                <th>Дата окончания</th>
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
                  <td>{formatPlacementExpired(s.placement_expired_at)}</td>
                  <td>
                    {s.is_deleted ? (
                      <span className="badge badge-warning">Удалён</span>
                    ) : s.is_blocked ? (
                      <span className="badge badge-danger">Заблокирован</span>
                    ) : isPlacementExpired(s.placement_expired_at) ? (
                      <span className="badge badge-warning">Срок истёк</span>
                    ) : (
                      <span className="badge badge-success">Активен</span>
                    )}
                  </td>
                  <td>
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => setSelectedSeller(s)}
                    >
                      Управление
                    </button>
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
      {selectedSeller && (
        <SellerDetailsModal
          seller={selectedSeller}
          onClose={() => setSelectedSeller(null)}
          onSuccess={() => {
            loadSellers();
          }}
          onUpdate={(updated) => setSelectedSeller(updated)}
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

function SellerDetailsModal({
  seller,
  onClose,
  onSuccess,
  onUpdate,
}: {
  seller: Seller;
  onClose: () => void;
  onSuccess: () => void;
  onUpdate: (seller: Seller) => void;
}) {
  const [activeTab, setActiveTab] = useState<'info' | 'edit' | 'manage'>('info');
  const [limit, setLimit] = useState(String(seller.max_orders ?? 10));
  const [manageExpiryDate, setManageExpiryDate] = useState(formatPlacementExpired(seller.placement_expired_at));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState<'error' | 'success'>('error');

  // Edit state
  const [editField, setEditField] = useState('');
  const [editValue, setEditValue] = useState('');
  const [metroQuery, setMetroQuery] = useState('');
  const [metroResults, setMetroResults] = useState<MetroStation[]>([]);
  const [metroSearching, setMetroSearching] = useState(false);
  const [metroDropdownOpen, setMetroDropdownOpen] = useState(false);

  const fields = [
    { id: 'fio', label: 'ФИО' },
    { id: 'phone', label: 'Телефон' },
    { id: 'shop_name', label: 'Название магазина' },
    { id: 'description', label: 'Описание' },
    { id: 'map_url', label: 'Адрес' },
    { id: 'metro_id', label: 'Станция метро' },
    { id: 'metro_walk_minutes', label: 'Время до метро (мин)' },
    { id: 'delivery_type', label: 'Тип доставки' },
    { id: 'delivery_price', label: 'Стоимость доставки' },
    { id: 'placement_expired_at', label: 'Дата окончания размещения (ДД.ММ.ГГГГ)' },
  ];

  useEffect(() => {
    if (editField !== 'metro_id' || metroQuery.trim().length < 2) {
      setMetroResults([]);
      return;
    }
    let cancelled = false;
    setMetroSearching(true);
    searchMetro(metroQuery.trim()).then((list) => {
      if (!cancelled) {
        setMetroResults(list || []);
        setMetroDropdownOpen(true);
      }
    }).finally(() => { if (!cancelled) setMetroSearching(false); });
    return () => { cancelled = true; };
  }, [editField, metroQuery]);

  useEffect(() => {
    setManageExpiryDate(formatPlacementExpired(seller.placement_expired_at));
  }, [seller.placement_expired_at]);

  useEffect(() => {
    if (!editField) return;
    const raw =
      editField === 'metro_id' ? seller.metro_id
      : editField === 'metro_walk_minutes' ? seller.metro_walk_minutes
      : editField === 'fio' ? seller.fio
      : editField === 'phone' ? seller.phone
      : editField === 'shop_name' ? seller.shop_name
      : editField === 'description' ? seller.description
      : editField === 'map_url' ? seller.map_url
      : editField === 'delivery_type' ? seller.delivery_type
      : editField === 'delivery_price' ? seller.delivery_price
      : editField === 'placement_expired_at' ? formatPlacementExpired(seller.placement_expired_at)
      : undefined;
    setEditValue(raw !== undefined && raw !== null ? String(raw) : '');
  }, [editField, seller]);

  const showMessage = (text: string, type: 'error' | 'success' = 'error') => {
    setMsg(text);
    setMsgType(type);
    if (type === 'success') {
      setTimeout(() => setMsg(''), 3000);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editField) return;
    setLoading(true);
    setMsg('');
    try {
      const res = await updateSellerField(seller.tg_id, editField, editValue);
      if (res?.status === 'ok') {
        showMessage('Поле обновлено', 'success');
        const newValue = editField === 'placement_expired_at'
          ? (editValue?.trim() ? placementExpiredToISO(editValue) : undefined)
          : editValue;
        const updatedSeller = { ...seller, [editField]: newValue };
        onUpdate(updatedSeller);
        onSuccess();
        setEditField('');
        setEditValue('');
      } else {
        showMessage('Ошибка обновления');
      }
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  const handleBlock = async () => {
    setLoading(true);
    setMsg('');
    try {
      const res = await blockSeller(seller.tg_id, !seller.is_blocked);
      if (res?.status === 'ok') {
        const updatedSeller = { ...seller, is_blocked: !seller.is_blocked };
        onUpdate(updatedSeller);
        onSuccess();
        showMessage(seller.is_blocked ? 'Продавец разблокирован' : 'Продавец заблокирован', 'success');
      } else {
        showMessage('Ошибка');
      }
    } catch (e) {
      showMessage(e instanceof Error ? e.message : 'Ошибка');
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
        showMessage('Лимит обновлён', 'success');
      } else {
        showMessage((res as { message?: string })?.message || 'Ошибка');
      }
    } catch (e) {
      showMessage(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveExpiryDate = async () => {
    setLoading(true);
    setMsg('');
    try {
      const valueToSend = manageExpiryDate.trim() || '';
      const res = await updateSellerField(seller.tg_id, 'placement_expired_at', valueToSend);
      if (res?.status === 'ok') {
        showMessage('Дата окончания обновлена', 'success');
        const newISO = valueToSend ? placementExpiredToISO(manageExpiryDate) : undefined;
        onUpdate({ ...seller, placement_expired_at: newISO });
        onSuccess();
      } else {
        showMessage('Ошибка обновления даты');
      }
    } catch (e) {
      showMessage(e instanceof Error ? e.message : 'Ошибка');
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
      if (res?.status === 'ok') {
        onSuccess();
        onClose();
      } else {
        showMessage('Ошибка удаления');
      }
    } catch (e) {
      showMessage(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  const getDeliveryTypeLabel = (type: string | undefined) => {
    const found = DELIVERY_TYPES.find(t => t.value === type);
    return found?.label || type || '—';
  };

  const getDistrictName = (id: number | undefined) => {
    const found = DISTRICTS_MSK.find(d => d.id === id);
    return found?.name || '—';
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-square" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{seller.fio}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-tabs">
          <button
            className={`modal-tab ${activeTab === 'info' ? 'active' : ''}`}
            onClick={() => setActiveTab('info')}
          >
            Информация
          </button>
          <button
            className={`modal-tab ${activeTab === 'edit' ? 'active' : ''}`}
            onClick={() => setActiveTab('edit')}
          >
            Изменить
          </button>
          <button
            className={`modal-tab ${activeTab === 'manage' ? 'active' : ''}`}
            onClick={() => setActiveTab('manage')}
          >
            Управление
          </button>
        </div>

        <div className="modal-body">
          {msg && (
            <div className={`modal-message ${msgType === 'success' ? 'modal-success' : 'modal-error'}`}>
              {msg}
            </div>
          )}

          {activeTab === 'info' && (
            <div className="seller-info-grid">
              <div className="info-row">
                <span className="info-label">Telegram ID</span>
                <span className="info-value"><code>{seller.tg_id}</code></span>
              </div>
              <div className="info-row">
                <span className="info-label">ФИО</span>
                <span className="info-value">{seller.fio || '—'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Телефон</span>
                <span className="info-value">{seller.phone || '—'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Магазин</span>
                <span className="info-value">{seller.shop_name || '—'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Описание</span>
                <span className="info-value">{seller.description || '—'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Округ</span>
                <span className="info-value">{getDistrictName(seller.district_id)}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Адрес</span>
                <span className="info-value">
                  {seller.map_url ? (
                    <a href={seller.map_url} target="_blank" rel="noopener noreferrer">
                      Открыть карту
                    </a>
                  ) : '—'}
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">Тип доставки</span>
                <span className="info-value">{getDeliveryTypeLabel(seller.delivery_type)}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Стоимость доставки</span>
                <span className="info-value">{seller.delivery_price ?? 0} ₽</span>
              </div>
              <div className="info-row">
                <span className="info-label">Лимит заказов</span>
                <span className="info-value">{seller.max_orders ?? 10}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Дата окончания размещения</span>
                <span className="info-value">{formatPlacementExpired(seller.placement_expired_at)}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Статус</span>
                <span className="info-value">
                  {seller.is_deleted ? (
                    <span className="badge badge-warning">Удалён</span>
                  ) : seller.is_blocked ? (
                    <span className="badge badge-danger">Заблокирован</span>
                  ) : isPlacementExpired(seller.placement_expired_at) ? (
                    <span className="badge badge-warning">Срок истёк</span>
                  ) : (
                    <span className="badge badge-success">Активен</span>
                  )}
                </span>
              </div>
            </div>
          )}

          {activeTab === 'edit' && (
            <form onSubmit={handleEditSubmit}>
              <FormRow label="Поле для изменения" render={
                <select className="form-input" value={editField} onChange={(e) => setEditField(e.target.value)}>
                  <option value="">Выберите поле...</option>
                  {fields.map((f) => (
                    <option key={f.id} value={f.id}>{f.label}</option>
                  ))}
                </select>
              } />
              {editField && (
                <>
                  {editField === 'delivery_type' ? (
                    <FormRow label="Новое значение" render={
                      <select className="form-input" value={editValue} onChange={(e) => setEditValue(e.target.value)}>
                        {DELIVERY_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    } />
                  ) : editField === 'metro_id' ? (
                    <div className="form-group">
                      <label className="form-label">Станция метро</label>
                      <div className="edit-metro-wrap">
                        <input
                          type="text"
                          className="form-input"
                          placeholder="Поиск станции (минимум 2 символа)..."
                          value={metroQuery}
                          onChange={(e) => setMetroQuery(e.target.value)}
                          onFocus={() => metroResults.length > 0 && setMetroDropdownOpen(true)}
                        />
                        {metroDropdownOpen && (
                          <div className="edit-metro-dropdown">
                            {metroQuery.trim().length < 2 ? (
                              <div className="edit-metro-hint">Введите минимум 2 символа</div>
                            ) : metroSearching ? (
                              <div className="edit-metro-hint">Поиск...</div>
                            ) : metroResults.length === 0 ? (
                              <div className="edit-metro-hint">Станции не найдены</div>
                            ) : (
                              metroResults.map((m) => (
                                <button
                                  type="button"
                                  key={m.id}
                                  className="edit-metro-option"
                                  onClick={() => {
                                    setEditValue(String(m.id));
                                    setMetroQuery(m.name);
                                    setMetroDropdownOpen(false);
                                  }}
                                >
                                  {m.line_color && (
                                    <span
                                      className="edit-metro-line"
                                      style={{ backgroundColor: m.line_color || '#999' }}
                                    />
                                  )}
                                  {m.name}
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                      {editValue && <p className="form-hint">Выбрано: ID {editValue}</p>}
                    </div>
                  ) : editField === 'metro_walk_minutes' || editField === 'delivery_price' ? (
                    <FormRow label="Новое значение" value={editValue} onChange={setEditValue} type="number" />
                  ) : editField === 'placement_expired_at' ? (
                    <FormRow label="Новое значение (ДД.ММ.ГГГГ или пусто)" value={editValue} onChange={setEditValue} />
                  ) : editField === 'description' ? (
                    <FormRow label="Новое значение" value={editValue} onChange={setEditValue} textarea />
                  ) : (
                    <FormRow label="Новое значение" value={editValue} onChange={setEditValue} />
                  )}
                  <div className="modal-actions">
                    <button type="submit" className="btn btn-primary" disabled={loading}>
                      {loading ? 'Сохранение...' : 'Сохранить'}
                    </button>
                  </div>
                </>
              )}
            </form>
          )}

          {activeTab === 'manage' && (
            <div className="manage-seller">
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

              <div className="manage-section">
                <h4>Дата окончания размещения</h4>
                <p className="text-muted">ДД.ММ.ГГГГ или пусто — без срока</p>
                <div className="input-row">
                  <input
                    type="text"
                    className="form-input"
                    placeholder="ДД.ММ.ГГГГ"
                    value={manageExpiryDate === '—' ? '' : manageExpiryDate}
                    onChange={(e) => setManageExpiryDate(e.target.value)}
                  />
                  <button className="btn btn-primary" onClick={handleSaveExpiryDate} disabled={loading}>
                    Сохранить дату
                  </button>
                </div>
              </div>

              <div className="manage-section">
                <h4>Статус продавца</h4>
                <button
                  className={`btn ${seller.is_blocked ? 'btn-success' : 'btn-warning'}`}
                  onClick={handleBlock}
                  disabled={loading}
                >
                  {seller.is_blocked ? 'Разблокировать' : 'Заблокировать'}
                </button>
              </div>

              <div className="manage-section manage-danger">
                <h4>Удаление</h4>
                <p className="text-muted">Это действие необратимо. Продавец будет полностью удалён из системы.</p>
                <button
                  className="btn btn-danger"
                  onClick={handleDelete}
                  disabled={loading}
                >
                  {confirmDelete ? 'Нажмите ещё раз для подтверждения' : 'Удалить продавца'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
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
