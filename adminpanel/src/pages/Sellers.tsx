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
  getSellerWebCredentials,
  setSellerWebCredentials,
  getOrgData,
  getCities,
  getDistricts,
  type InnData,
} from '../api/adminClient';
import type { Seller, MetroStation, City, District } from '../types';
import { OrgDataDisplay } from '../components/OrgDataDisplay';
import { MetroSearchField } from '../components/MetroSearchField';
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

/** Форматирование телефона: "+7 000 000 00 00" */
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

/** Из отображаемого значения в цифры для API (7 + 10 цифр) */
function phoneToDigits(display: string): string {
  const digits = display.replace(/\D/g, '');
  if (digits.startsWith('8')) return '7' + digits.slice(1, 11);
  if (digits.startsWith('7')) return digits.slice(0, 11);
  return ('7' + digits).slice(0, 11);
}

/** Форматирование даты: "ДД.ММ.ГГГГ" */
function formatDateInput(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 0) return '';
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4, 8)}`;
}

export function Sellers() {
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [showInnVerification, setShowInnVerification] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedSeller, setSelectedSeller] = useState<Seller | null>(null);
  const [innData, setInnData] = useState<{ data: InnData } | null>(null);

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
        <button className="btn btn-primary" onClick={() => setShowInnVerification(true)}>
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

      {showInnVerification && (
        <InnVerificationModal
          onClose={() => {
            setShowInnVerification(false);
            setInnData(null);
          }}
          onNext={(_identifier, data) => {
            setInnData({ data });
            setShowInnVerification(false);
            setShowAdd(true);
          }}
        />
      )}
      {showAdd && (
        <AddSellerModal
          onClose={() => {
            setShowAdd(false);
            setInnData(null);
          }}
          onSuccess={() => {
            setShowAdd(false);
            setInnData(null);
            loadSellers();
          }}
          initialInnData={innData?.data}
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

function InnVerificationModal({
  onClose,
  onNext,
}: {
  onClose: () => void;
  onNext: (identifier: string, innData: InnData) => void;
}) {
  const [identifier, setIdentifier] = useState('');
  const [identifierError, setIdentifierError] = useState('');
  const [loading, setLoading] = useState(false);
  const [orgData, setOrgData] = useState<InnData | null>(null);
  const [error, setError] = useState('');

  const validateIdentifier = (value: string): string => {
    if (!value.trim()) return '';
    const clean = value.trim().replace(/\s/g, '');
    if (!/^\d+$/.test(clean)) {
      return 'Должен содержать только цифры';
    }
    if (![10, 12, 13, 15].includes(clean.length)) {
      return 'ИНН (10/12 цифр) или ОГРН (13/15 цифр)';
    }
    return '';
  };

  const handleIdentifierChange = (value: string) => {
    setIdentifier(value);
    setIdentifierError(validateIdentifier(value));
    setOrgData(null);
    setError('');
  };

  const handleGetData = async () => {
    setError('');
    const validationError = validateIdentifier(identifier);
    if (validationError) {
      setIdentifierError(validationError);
      return;
    }
    setIdentifierError('');
    setLoading(true);
    try {
      const clean = identifier.trim().replace(/\s/g, '');
      const data = await getOrgData(clean);
      setOrgData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка при получении данных');
      setOrgData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (!orgData) {
      setError('Сначала получите данные по ИНН/ОГРН');
      return;
    }
    onNext(identifier.trim().replace(/\s/g, ''), orgData);
  };

  return (
    <Modal title="Проверка ИНН / ОГРН" onClose={onClose}>
      <div>
        <div className="form-group">
          <label className="form-label">ИНН или ОГРН *</label>
          <input
            type="text"
            className={`form-input ${identifierError ? 'error' : ''}`}
            value={identifier}
            onChange={(e) => handleIdentifierChange(e.target.value)}
            placeholder="ИНН (10/12 цифр) или ОГРН (13/15 цифр)"
            maxLength={15}
            onKeyDown={(e) => e.key === 'Enter' && !loading && handleGetData()}
          />
          {identifierError && <div className="form-error">{identifierError}</div>}
          <small className="form-hint">Введите ИНН (10/12 цифр) или ОГРН/ОГРНИП (13/15 цифр)</small>
        </div>

        <div className="modal-actions" style={{ marginTop: '1rem' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleGetData}
            disabled={loading || !!identifierError || !identifier.trim()}
          >
            {loading ? 'Загрузка...' : 'Получить данные'}
          </button>
        </div>

        {error && <div className="modal-error" style={{ marginTop: '1rem' }}>{error}</div>}

        {orgData && (
          <div style={{ marginTop: '1.5rem' }}>
            <OrgDataDisplay data={orgData} showFullOkvedDescriptions={true} />
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleNext}
            disabled={!orgData}
          >
            Далее
          </button>
        </div>
      </div>
    </Modal>
  );
}

function AddSellerModal({
  onClose,
  onSuccess,
  initialInnData,
}: {
  onClose: () => void;
  onSuccess: () => void;
  initialInnData?: InnData;
}) {
  const [tgId, setTgId] = useState('');
  const [fio, setFio] = useState('');
  const [phoneDisplay, setPhoneDisplay] = useState('');
  const [shopName, setShopName] = useState('');
  const [description, setDescription] = useState('');
  const [cityId, setCityId] = useState(1);
  const [cities, setCities] = useState<City[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [districtId, setDistrictId] = useState(1);
  const [metroId, setMetroId] = useState<number | null>(null);
  const [metroWalkMinutes, setMetroWalkMinutes] = useState<number | null>(null);
  const [addressLink, setAddressLink] = useState('');
  const [deliveryType, setDeliveryType] = useState('both');
  const [deliveryPrice, setDeliveryPrice] = useState('0');
  const [expiryDateDisplay, setExpiryDateDisplay] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [credentials, setCredentials] = useState<{ web_login: string; web_password: string } | null>(null);

  useEffect(() => {
    if (initialInnData) {
      if (initialInnData.name && !shopName) {
        setShopName(initialInnData.short_name || initialInnData.name);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialInnData]);

  // Load cities on mount
  useEffect(() => {
    getCities().then((list) => {
      if (list.length > 0) setCities(list);
      else setCities([{ id: 1, name: 'Москва' }]);
    }).catch(() => setCities([{ id: 1, name: 'Москва' }]));
  }, []);

  // Load districts when city changes
  useEffect(() => {
    getDistricts(cityId).then((list) => {
      setDistricts(list);
      if (list.length > 0 && !list.find(d => d.id === districtId)) {
        setDistrictId(list[0].id);
      }
    }).catch(() => setDistricts([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityId]);

  const handlePhoneChange = (value: string) => {
    const formatted = formatPhoneInput(value);
    setPhoneDisplay(formatted);
  };

  const handleDateChange = (value: string) => {
    const formatted = formatDateInput(value);
    setExpiryDateDisplay(formatted);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate phone
    const phoneDigits = phoneToDigits(phoneDisplay);
    if (phoneDigits.length !== 11) {
      setError('Введите номер телефона в формате +7 000 000 00 00');
      return;
    }

    // Validate date format if provided
    if (expiryDateDisplay && expiryDateDisplay.length !== 10) {
      setError('Введите дату в формате ДД.ММ.ГГГГ');
      return;
    }
    
    // Validate tg_id if provided
    if (tgId.trim()) {
      const parsedTgId = parseInt(tgId.trim(), 10);
      if (isNaN(parsedTgId) || parsedTgId <= 0) {
        setError('Telegram ID должен быть положительным числом');
        return;
      }
    }

    setSubmitting(true);
    setCredentials(null);
    try {
      const payload: Record<string, unknown> = {
        fio,
        phone: phoneDigits,
        shop_name: shopName,
        description: description || undefined,
        city_id: cityId,
        district_id: districtId,
        metro_id: metroId || undefined,
        metro_walk_minutes: metroWalkMinutes || undefined,
        map_url: addressLink || undefined,
        delivery_type: deliveryType,
        delivery_price: parseFloat(deliveryPrice) || 0,
      };
      if (tgId.trim()) {
        payload.tg_id = parseInt(tgId.trim(), 10);
      }
      if (initialInnData?.inn) {
        payload.inn = initialInnData.inn;
      }
      if (initialInnData?.ogrn) {
        payload.ogrn = initialInnData.ogrn;
      }
      if (expiryDateDisplay) {
        const [d, m, y] = expiryDateDisplay.split('.');
        if (d && m && y) payload.placement_expired_at = `${y}-${m}-${d}`;
      }
      const res = await createSeller(payload) as { status?: string; web_login?: string; web_password?: string };
      if (res?.status === 'ok' || res?.status === undefined) {
        if (res.web_login && res.web_password) {
          setCredentials({ web_login: res.web_login, web_password: res.web_password });
        } else {
          onSuccess();
          onClose();
        }
      } else if (res?.status === 'exists') {
        setError('Продавец уже существует.');
      } else {
        setError('Ошибка создания. Проверьте данные.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseCredentials = () => {
    setCredentials(null);
    onSuccess();
    onClose();
  };

  return (
    <Modal title={credentials ? 'Данные для входа' : 'Добавить продавца'} onClose={credentials ? handleCloseCredentials : onClose}>
      {credentials ? (
        <div className="credentials-block">
          <p className="credentials-hint">Данные для входа созданы автоматически. Передайте их продавцу для входа в веб-панель.</p>
          <div className="form-group">
            <label className="form-label">Логин</label>
            <div className="credentials-value">
              <code>{credentials.web_login}</code>
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => navigator.clipboard.writeText(credentials.web_login)}>Копировать</button>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Пароль</label>
            <div className="credentials-value">
              <code>{credentials.web_password}</code>
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => navigator.clipboard.writeText(credentials.web_password)}>Копировать</button>
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-primary" onClick={handleCloseCredentials}>Готово</button>
          </div>
        </div>
      ) : (
      <form onSubmit={handleSubmit}>
        {initialInnData?.ogrn && (
          <div className="form-group">
            <label className="form-label">ОГРН</label>
            <input
              type="text"
              className="form-input"
              value={initialInnData.ogrn}
              disabled
            />
          </div>
        )}
        {initialInnData?.inn && (
          <div className="form-group">
            <label className="form-label">ИНН</label>
            <input
              type="text"
              className="form-input"
              value={initialInnData.inn}
              disabled
            />
            <small className="form-hint">Данные получены из DaData</small>
          </div>
        )}
        <div className="form-group">
          <label className="form-label">Telegram ID</label>
          <input
            type="text"
            className="form-input"
            value={tgId}
            onChange={(e) => setTgId(e.target.value.replace(/\D/g, ''))}
            placeholder="Необязательно. Если пусто — сгенерируется автоматически"
          />
          <small className="form-hint">Telegram ID пользователя (числовой). Оставьте пустым для автогенерации.</small>
        </div>
        <FormRow label="ФИО" value={fio} onChange={setFio} required />
        <div className="form-group">
          <label className="form-label">Телефон *</label>
          <input
            type="tel"
            className="form-input"
            value={phoneDisplay}
            onChange={(e) => handlePhoneChange(e.target.value)}
            placeholder="+7 000 000 00 00"
            maxLength={17}
            required
          />
          <small className="form-hint">Формат: +7 000 000 00 00</small>
        </div>
        <FormRow label="Название магазина" value={shopName} onChange={setShopName} required />
        <FormRow label="Описание" value={description} onChange={setDescription} textarea />
        <FormRow label="Город" render={
          <select className="form-input" value={cityId} onChange={(e) => setCityId(parseInt(e.target.value, 10))}>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        } />
        <FormRow label="Округ" render={
          <select className="form-input" value={districtId} onChange={(e) => setDistrictId(parseInt(e.target.value, 10))}>
            {(districts.length > 0 ? districts : DISTRICTS_MSK).map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        } />
        <MetroSearchField
          metroId={metroId}
          metroWalkMinutes={metroWalkMinutes}
          onMetroChange={(mId, walkMin) => {
            setMetroId(mId);
            setMetroWalkMinutes(walkMin);
          }}
        />
        <FormRow label="Ссылка на адрес (Яндекс.Карты)" value={addressLink} onChange={setAddressLink} />
        <FormRow label="Тип доставки" render={
          <select className="form-input" value={deliveryType} onChange={(e) => setDeliveryType(e.target.value)}>
            {DELIVERY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        } />
        <FormRow label="Стоимость доставки (₽)" value={deliveryPrice} onChange={setDeliveryPrice} type="number" />
        <div className="form-group">
          <label className="form-label">Дата окончания размещения</label>
          <input
            type="text"
            className="form-input"
            value={expiryDateDisplay}
            onChange={(e) => handleDateChange(e.target.value)}
            placeholder="ДД.ММ.ГГГГ"
            maxLength={10}
          />
          <small className="form-hint">Формат: ДД.ММ.ГГГГ или выберите дату</small>
          <input
            type="date"
            className="form-input"
            style={{ marginTop: '0.5rem' }}
            onChange={(e) => {
              if (e.target.value) {
                const date = new Date(e.target.value);
                const day = String(date.getDate()).padStart(2, '0');
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const year = date.getFullYear();
                setExpiryDateDisplay(`${day}.${month}.${year}`);
              }
            }}
          />
        </div>
        {error && <div className="modal-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Отмена</button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Создание...' : 'Создать'}
          </button>
        </div>
      </form>
      )}
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
  const [activeTab, setActiveTab] = useState<'info' | 'manage'>('info');
  const [limit, setLimit] = useState(String(seller.max_orders ?? ''));
  const [manageExpiryDate, setManageExpiryDate] = useState(formatPlacementExpired(seller.placement_expired_at));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState<'error' | 'success'>('error');
  const [webCredentials, setWebCredentials] = useState<{ web_login: string; web_password: string } | null>(null);
  const [currentCredentials, setCurrentCredentials] = useState<{ web_login: string | null; web_password: string | null } | null>(null);
  const [credentialsLoading, setCredentialsLoading] = useState(false);

  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedFields, setEditedFields] = useState<Record<string, string>>({});
  
  // INN data state
  const [innData, setInnData] = useState<InnData | null>(null);
  const [loadingInnData, setLoadingInnData] = useState(false);

  // Metro search state (for edit mode)
  const [metroQuery, setMetroQuery] = useState('');
  const [metroResults, setMetroResults] = useState<MetroStation[]>([]);
  const [metroSearching, setMetroSearching] = useState(false);
  const [metroDropdownOpen, setMetroDropdownOpen] = useState(false);

  // Load org data when modal opens (by INN or OGRN)
  useEffect(() => {
    const identifier = seller.inn || seller.ogrn;
    if (identifier) {
      setLoadingInnData(true);
      getOrgData(identifier)
        .then((data) => {
          setInnData(data);
        })
        .catch((err) => {
          console.error('Failed to load org data:', err);
          setInnData(null);
        })
        .finally(() => {
          setLoadingInnData(false);
        });
    } else {
      setInnData(null);
    }
  }, [seller.inn, seller.ogrn]);

  // Metro search for edit mode
  useEffect(() => {
    if (!isEditMode || metroQuery.trim().length < 2) {
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
  }, [isEditMode, metroQuery]);

  useEffect(() => {
    setManageExpiryDate(formatPlacementExpired(seller.placement_expired_at));
  }, [seller.placement_expired_at]);

  useEffect(() => {
    if (activeTab === 'manage') {
      getSellerWebCredentials(seller.tg_id)
        .then((r) => setCurrentCredentials(r))
        .catch(() => setCurrentCredentials(null));
    }
  }, [activeTab, seller.tg_id]);

  // Initialize editedFields when entering edit mode
  useEffect(() => {
    if (isEditMode) {
      const initialFields: Record<string, string> = {
        fio: seller.fio || '',
        phone: seller.phone || '',
        shop_name: seller.shop_name || '',
        description: seller.description || '',
        district_id: seller.district_id ? String(seller.district_id) : '1',
        map_url: seller.map_url || '',
        metro_id: seller.metro_id ? String(seller.metro_id) : '',
        metro_walk_minutes: seller.metro_walk_minutes ? String(seller.metro_walk_minutes) : '',
        delivery_type: seller.delivery_type || 'both',
        delivery_price: seller.delivery_price ? String(seller.delivery_price) : '0',
        placement_expired_at: formatPlacementExpired(seller.placement_expired_at),
      };
      setEditedFields(initialFields);
      setMetroQuery(''); // Reset metro query when entering edit mode
    } else {
      setEditedFields({});
      setMetroQuery('');
      setMetroDropdownOpen(false);
    }
  }, [isEditMode, seller]);

  const showMessage = (text: string, type: 'error' | 'success' = 'error') => {
    setMsg(text);
    setMsgType(type);
    if (type === 'success') {
      setTimeout(() => setMsg(''), 3000);
    }
  };

  const handleFieldChange = (field: string, value: string) => {
    setEditedFields(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveAll = async () => {
    setLoading(true);
    setMsg('');
    try {
      const updates: Promise<{ status?: string }>[] = [];
      
      for (const [field, value] of Object.entries(editedFields)) {
        const originalValue = 
          field === 'fio' ? seller.fio
          : field === 'phone' ? seller.phone
          : field === 'shop_name' ? seller.shop_name
          : field === 'description' ? seller.description
          : field === 'district_id' ? seller.district_id
          : field === 'map_url' ? seller.map_url
          : field === 'metro_id' ? seller.metro_id
          : field === 'metro_walk_minutes' ? seller.metro_walk_minutes
          : field === 'delivery_type' ? seller.delivery_type
          : field === 'delivery_price' ? seller.delivery_price
          : field === 'placement_expired_at' ? formatPlacementExpired(seller.placement_expired_at)
          : undefined;
        
        const stringOriginal = originalValue !== undefined && originalValue !== null ? String(originalValue) : '';
        const stringValue = value || '';
        
        // Normalize phone for comparison
        if (field === 'phone') {
          const originalDigits = phoneToDigits(stringOriginal);
          const newDigits = phoneToDigits(stringValue);
          if (originalDigits !== newDigits) {
            updates.push(updateSellerField(seller.tg_id, field, newDigits));
          }
        } else if (stringValue !== stringOriginal) {
          updates.push(updateSellerField(seller.tg_id, field, stringValue));
        }
      }

      if (updates.length === 0) {
        setIsEditMode(false);
        return;
      }

      const results = await Promise.all(updates);
      const hasErrors = results.some(r => r?.status !== 'ok' && r?.status !== undefined);
      
      if (hasErrors) {
        showMessage('Некоторые поля не удалось сохранить');
      } else {
        showMessage('Изменения сохранены', 'success');
      }
      
      setIsEditMode(false);
      onSuccess();
      
      // Reload seller data
      const updatedSeller = { ...seller };
      Object.entries(editedFields).forEach(([field, value]) => {
        if (field === 'district_id' || field === 'metro_id' || field === 'metro_walk_minutes') {
          (updatedSeller as any)[field] = value ? parseInt(value, 10) : undefined;
        } else if (field === 'delivery_price') {
          (updatedSeller as any)[field] = value ? parseFloat(value) : 0;
        } else if (field === 'placement_expired_at') {
          (updatedSeller as any)[field] = value ? placementExpiredToISO(value) : undefined;
        } else if (field === 'phone') {
          (updatedSeller as any)[field] = phoneToDigits(value);
        } else {
          (updatedSeller as any)[field] = value;
        }
      });
      onUpdate(updatedSeller);
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
    setEditedFields({});
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

  const handleSetWebCredentials = async () => {
    setCredentialsLoading(true);
    setWebCredentials(null);
    setMsg('');
    try {
      const res = await setSellerWebCredentials(seller.tg_id);
      setWebCredentials({ web_login: res.web_login, web_password: res.web_password });
      setCurrentCredentials({ web_login: res.web_login, web_password: res.web_password });
      showMessage('Логин и пароль установлены.', 'success');
    } catch (e) {
      showMessage(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setCredentialsLoading(false);
    }
  };

  const handleSetLimit = async () => {
    const num = limit.trim() === '' ? 0 : parseInt(limit, 10);
    if (isNaN(num) || num < 0) {
      showMessage('Введите неотрицательное число (0 = сбросить лимит на сегодня)');
      return;
    }
    setLoading(true);
    setMsg('');
    try {
      const res = await setSellerLimit(seller.tg_id, num);
      if (res?.status === 'ok') {
        showMessage('Лимит обновлён', 'success');
        onUpdate({ ...seller, max_orders: num });
        onSuccess();
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
            onClick={() => {
              setActiveTab('info');
              setIsEditMode(false);
            }}
          >
            Информация
          </button>
          <button
            className={`modal-tab ${activeTab === 'manage' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('manage');
              setIsEditMode(false);
            }}
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
            <div>
              {/* Основная информация */}
              <div className="info-section">
                <h3 className="info-section-title">Основная информация</h3>
                <div className="seller-info-grid">
                  <div className="info-row">
                    <span className="info-label">
                      {isEditMode && <span className="edit-icon">✏️</span>}
                      Telegram ID
                    </span>
                    <span className="info-value"><code>{seller.tg_id}</code></span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">
                      {isEditMode && <span className="edit-icon">✏️</span>}
                      ФИО
                    </span>
                    <span className="info-value">
                      {isEditMode ? (
                        <input
                          type="text"
                          className="form-input"
                          value={editedFields.fio || ''}
                          onChange={(e) => handleFieldChange('fio', e.target.value)}
                        />
                      ) : (
                        seller.fio || '—'
                      )}
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">
                      {isEditMode && <span className="edit-icon">✏️</span>}
                      Телефон
                    </span>
                    <span className="info-value">
                      {isEditMode ? (
                        <input
                          type="tel"
                          className="form-input"
                          value={editedFields.phone || ''}
                          onChange={(e) => handleFieldChange('phone', formatPhoneInput(e.target.value))}
                          placeholder="+7 000 000 00 00"
                          maxLength={17}
                        />
                      ) : (
                        seller.phone || '—'
                      )}
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">
                      {isEditMode && <span className="edit-icon">✏️</span>}
                      Магазин
                    </span>
                    <span className="info-value">
                      {isEditMode ? (
                        <input
                          type="text"
                          className="form-input"
                          value={editedFields.shop_name || ''}
                          onChange={(e) => handleFieldChange('shop_name', e.target.value)}
                        />
                      ) : (
                        seller.shop_name || '—'
                      )}
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">
                      {isEditMode && <span className="edit-icon">✏️</span>}
                      Описание
                    </span>
                    <span className="info-value">
                      {isEditMode ? (
                        <textarea
                          className="form-input"
                          rows={3}
                          value={editedFields.description || ''}
                          onChange={(e) => handleFieldChange('description', e.target.value)}
                        />
                      ) : (
                        seller.description || '—'
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Адресная информация */}
              <div className="info-section">
                <h3 className="info-section-title">Адресная информация</h3>
                <div className="seller-info-grid">
                  <div className="info-row">
                    <span className="info-label">
                      {isEditMode && <span className="edit-icon">✏️</span>}
                      Округ
                    </span>
                    <span className="info-value">
                      {isEditMode ? (
                        <select
                          className="form-input"
                          value={editedFields.district_id || '1'}
                          onChange={(e) => handleFieldChange('district_id', e.target.value)}
                        >
                          {DISTRICTS_MSK.map((d) => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                      ) : (
                        getDistrictName(seller.district_id)
                      )}
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">
                      {isEditMode && <span className="edit-icon">✏️</span>}
                      Ссылка на адрес
                    </span>
                    <span className="info-value">
                      {isEditMode ? (
                        <input
                          type="url"
                          className="form-input"
                          value={editedFields.map_url || ''}
                          onChange={(e) => handleFieldChange('map_url', e.target.value)}
                          placeholder="https://..."
                        />
                      ) : (
                        seller.map_url ? (
                          <a href={seller.map_url} target="_blank" rel="noopener noreferrer">
                            Открыть карту
                          </a>
                        ) : '—'
                      )}
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">
                      {isEditMode && <span className="edit-icon">✏️</span>}
                      Станция метро
                    </span>
                    <span className="info-value">
                      {isEditMode ? (
                        <div className="edit-metro-wrap">
                          <input
                            type="text"
                            className="form-input"
                            placeholder="Поиск станции (минимум 2 символа)..."
                            value={metroQuery}
                            onChange={(e) => {
                              setMetroQuery(e.target.value);
                            }}
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
                                      handleFieldChange('metro_id', String(m.id));
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
                      ) : (
                        seller.metro_id ? `ID: ${seller.metro_id}` : '—'
                      )}
                    </span>
                  </div>
                  {isEditMode && editedFields.metro_id && (
                    <div className="info-row">
                      <span className="info-label">
                        {isEditMode && <span className="edit-icon">✏️</span>}
                        Время до метро (мин)
                      </span>
                      <span className="info-value">
                        <input
                          type="number"
                          className="form-input"
                          value={editedFields.metro_walk_minutes || ''}
                          onChange={(e) => handleFieldChange('metro_walk_minutes', e.target.value)}
                          min="1"
                        />
                      </span>
                    </div>
                  )}
                  {!isEditMode && seller.metro_walk_minutes && (
                    <div className="info-row">
                      <span className="info-label">Время до метро</span>
                      <span className="info-value">{seller.metro_walk_minutes} мин</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Доставка */}
              <div className="info-section">
                <h3 className="info-section-title">Доставка</h3>
                <div className="seller-info-grid">
                  <div className="info-row">
                    <span className="info-label">
                      {isEditMode && <span className="edit-icon">✏️</span>}
                      Тип доставки
                    </span>
                    <span className="info-value">
                      {isEditMode ? (
                        <select
                          className="form-input"
                          value={editedFields.delivery_type || 'both'}
                          onChange={(e) => handleFieldChange('delivery_type', e.target.value)}
                        >
                          {DELIVERY_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                      ) : (
                        getDeliveryTypeLabel(seller.delivery_type)
                      )}
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">
                      {isEditMode && <span className="edit-icon">✏️</span>}
                      Стоимость доставки
                    </span>
                    <span className="info-value">
                      {isEditMode ? (
                        <input
                          type="number"
                          className="form-input"
                          value={editedFields.delivery_price || '0'}
                          onChange={(e) => handleFieldChange('delivery_price', e.target.value)}
                          min="0"
                          step="0.01"
                        />
                      ) : (
                        `${seller.delivery_price ?? 0} ₽`
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Данные организации */}
              {(seller.inn || seller.ogrn) && (
                <div className="info-section">
                  <h3 className="info-section-title">Данные организации</h3>
                  {loadingInnData ? (
                    <div className="loading-row"><div className="loader" /></div>
                  ) : innData ? (
                    <OrgDataDisplay data={innData} showFullOkvedDescriptions={false} />
                  ) : (
                    <p className="text-muted">Не удалось загрузить данные организации</p>
                  )}
                </div>
              )}

              {/* Системная информация */}
              <div className="info-section">
                <h3 className="info-section-title">Системная информация</h3>
                <div className="seller-info-grid">
                  <div className="info-row">
                    <span className="info-label">
                      {isEditMode && <span className="edit-icon">✏️</span>}
                      Дата окончания размещения
                    </span>
                    <span className="info-value">
                      {isEditMode ? (
                        <div>
                          <input
                            type="text"
                            className="form-input"
                            value={editedFields.placement_expired_at || ''}
                            onChange={(e) => handleFieldChange('placement_expired_at', formatDateInput(e.target.value))}
                            placeholder="ДД.ММ.ГГГГ"
                            maxLength={10}
                          />
                          <input
                            type="date"
                            className="form-input"
                            style={{ marginTop: '0.5rem' }}
                            onChange={(e) => {
                              if (e.target.value) {
                                const date = new Date(e.target.value);
                                const day = String(date.getDate()).padStart(2, '0');
                                const month = String(date.getMonth() + 1).padStart(2, '0');
                                const year = date.getFullYear();
                                handleFieldChange('placement_expired_at', `${day}.${month}.${year}`);
                              }
                            }}
                          />
                        </div>
                      ) : (
                        formatPlacementExpired(seller.placement_expired_at)
                      )}
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Лимит заказов</span>
                    <span className="info-value">
                      {seller.max_orders != null && seller.max_orders > 0 ? seller.max_orders : 'Не задан'}
                    </span>
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
              </div>

              {/* Кнопки действий */}
              <div className="modal-actions" style={{ marginTop: '2rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                {isEditMode ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleCancelEdit}
                      disabled={loading}
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleSaveAll}
                      disabled={loading}
                    >
                      {loading ? 'Сохранение...' : 'Сохранить'}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setIsEditMode(true)}
                  >
                    Изменить
                  </button>
                )}
              </div>
            </div>
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
                <h4>Веб-панель для продавца</h4>
                <p className="text-muted">{`Стандартные данные: логин Seller${seller.tg_id}, пароль — ${seller.tg_id}. Сменить можно во вкладке «Безопасность» веб-панели.`}</p>
                {currentCredentials?.web_login && (
                  <div className="credentials-block" style={{ marginBottom: '1rem' }}>
                    <h5 style={{ marginBottom: '0.5rem', fontSize: '0.95rem' }}>Текущие данные для входа</h5>
                    <div className="credentials-value">
                      <strong>Логин:</strong> <code>{currentCredentials.web_login}</code>
                      <button type="button" className="btn btn-sm btn-secondary" onClick={() => navigator.clipboard.writeText(currentCredentials.web_login!)}>Копировать</button>
                    </div>
                    {currentCredentials.web_password != null ? (
                      <div className="credentials-value">
                        <strong>Пароль:</strong> <code>{currentCredentials.web_password}</code>
                        <button type="button" className="btn btn-sm btn-secondary" onClick={() => navigator.clipboard.writeText(currentCredentials.web_password!)}>Копировать</button>
                      </div>
                    ) : (
                      <p className="form-hint">Пароль изменён продавцом. Узнать нельзя. Сбросить — кнопка ниже.</p>
                    )}
                  </div>
                )}
                {webCredentials ? (
                  <div className="credentials-block">
                    <div className="credentials-value">
                      <strong>Логин:</strong> <code>{webCredentials.web_login}</code>
                      <button type="button" className="btn btn-sm btn-secondary" onClick={() => navigator.clipboard.writeText(webCredentials.web_login)}>Копировать</button>
                    </div>
                    <div className="credentials-value">
                      <strong>Пароль:</strong> <code>{webCredentials.web_password}</code>
                      <button type="button" className="btn btn-sm btn-secondary" onClick={() => navigator.clipboard.writeText(webCredentials.web_password)}>Копировать</button>
                    </div>
                    <p className="form-hint">Передайте эти данные продавцу.</p>
                    <button type="button" className="btn btn-secondary" onClick={() => setWebCredentials(null)}>Скрыть</button>
                  </div>
                ) : (
                  <button
                    className="btn btn-secondary"
                    onClick={handleSetWebCredentials}
                    disabled={credentialsLoading}
                  >
                    {credentialsLoading ? 'Создание...' : 'Создать логин и пароль'}
                  </button>
                )}
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
