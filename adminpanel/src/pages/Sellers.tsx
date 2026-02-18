import { useEffect, useState, useRef, useCallback } from 'react';
import { PageHeader, useToast } from '../components/ui';
import {
  Plus, Store, User, MapPin, Truck, Building2,
  Gauge, Calendar, Globe, Shield, Trash2, X, Edit3, Save,
  Copy, ExternalLink, Eye, EyeOff,
} from 'lucide-react';
import {
  searchSellers,
  getAllSellers,
  createSeller,
  updateSellerField,
  blockSeller,
  deleteSeller,
  setSellerLimit,
  setSellerSubscriptionPlan,
  setSellerDefaultLimit,
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
      <PageHeader
        title="Продавцы"
        actions={
          <button className="btn btn-primary" onClick={() => setShowInnVerification(true)}>
            <Plus size={16} /> Добавить
          </button>
        }
      />

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

        <div className="modal-actions modal-actions--spaced">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleGetData}
            disabled={loading || !!identifierError || !identifier.trim()}
          >
            {loading ? 'Загрузка...' : 'Получить данные'}
          </button>
        </div>

        {error && <div className="modal-error modal-error--spaced">{error}</div>}

        {orgData && (
          <div className="org-data-section">
            <OrgDataDisplay data={orgData} showFullOkvedDescriptions={true} />
          </div>
        )}

        <div className="modal-actions modal-actions--section">
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
  const [expiryDateDisplay, setExpiryDateDisplay] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [credentials, setCredentials] = useState<{ web_login: string; web_password: string } | null>(null);

  useEffect(() => {
    if (initialInnData) {
      if (initialInnData.name && !shopName) {
        setShopName(initialInnData.short_name || initialInnData.name);
      }
      if (initialInnData.management && !fio) {
        setFio(initialInnData.management);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialInnData]);

  // Load cities on mount
  useEffect(() => {
    getCities().then((list) => {
      if (list.length > 0) setCities(list);
      else setCities([{ id: 1, name: 'Москва' }, { id: 2, name: 'Санкт-Петербург' }]);
    }).catch(() => setCities([{ id: 1, name: 'Москва' }, { id: 2, name: 'Санкт-Петербург' }]));
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
            className="form-input form-input--secondary"
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

type SdmSection = 'profile' | 'address' | 'delivery' | 'org' | 'limits' | 'placement' | 'web' | 'status' | 'delete';

const SDM_NAV: { group: string; items: { id: SdmSection; label: string; icon: typeof Store; danger?: boolean }[] }[] = [
  {
    group: 'Информация',
    items: [
      { id: 'profile', label: 'Профиль', icon: User },
      { id: 'address', label: 'Адрес', icon: MapPin },
      { id: 'delivery', label: 'Доставка', icon: Truck },
      { id: 'org', label: 'Организация', icon: Building2 },
    ],
  },
  {
    group: 'Управление',
    items: [
      { id: 'limits', label: 'Лимиты и тариф', icon: Gauge },
      { id: 'placement', label: 'Размещение', icon: Calendar },
      { id: 'web', label: 'Веб-панель', icon: Globe },
    ],
  },
  {
    group: 'Опасная зона',
    items: [
      { id: 'status', label: 'Статус', icon: Shield, danger: true },
      { id: 'delete', label: 'Удаление', icon: Trash2, danger: true },
    ],
  },
];

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
  const toast = useToast();

  // Section navigation
  const [activeSection, setActiveSection] = useState<SdmSection>('profile');
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const contentRef = useRef<HTMLDivElement>(null);

  // Per-section edit state
  const [editingSection, setEditingSection] = useState<SdmSection | null>(null);
  const [editedFields, setEditedFields] = useState<Record<string, string>>({});

  // Limits & plan
  const [limit, setLimit] = useState(String(seller.max_orders ?? ''));
  const [defaultLimit, setDefaultLimit] = useState(String(seller.default_daily_limit ?? ''));
  const [subscriptionPlan, setSubscriptionPlan] = useState(seller.subscription_plan ?? 'free');

  // Placement
  const [manageExpiryDate, setManageExpiryDate] = useState(formatPlacementExpired(seller.placement_expired_at));

  // Credentials
  const [webCredentials, setWebCredentials] = useState<{ web_login: string; web_password: string } | null>(null);
  const [currentCredentials, setCurrentCredentials] = useState<{ web_login: string | null; web_password: string | null } | null>(null);
  const [credentialsLoading, setCredentialsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Delete
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Loading
  const [loading, setLoading] = useState(false);

  // INN data
  const [innData, setInnData] = useState<InnData | null>(null);
  const [loadingInnData, setLoadingInnData] = useState(false);

  // Metro search
  const [metroQuery, setMetroQuery] = useState('');
  const [metroResults, setMetroResults] = useState<MetroStation[]>([]);
  const [metroSearching, setMetroSearching] = useState(false);
  const [metroDropdownOpen, setMetroDropdownOpen] = useState(false);

  // ── Navigation ──
  const scrollToSection = useCallback((id: SdmSection) => {
    setActiveSection(id);
    const el = sectionRefs.current[id];
    if (el && contentRef.current) {
      contentRef.current.scrollTo({ top: el.offsetTop - 16, behavior: 'smooth' });
    }
  }, []);

  // ESC to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Load org data
  useEffect(() => {
    const identifier = seller.inn || seller.ogrn;
    if (identifier) {
      setLoadingInnData(true);
      getOrgData(identifier)
        .then(setInnData)
        .catch(() => setInnData(null))
        .finally(() => setLoadingInnData(false));
    }
  }, [seller.inn, seller.ogrn]);

  // Load web credentials
  useEffect(() => {
    getSellerWebCredentials(seller.tg_id)
      .then(setCurrentCredentials)
      .catch(() => setCurrentCredentials(null));
  }, [seller.tg_id]);

  // Metro search
  useEffect(() => {
    if (editingSection !== 'address' || metroQuery.trim().length < 2) {
      setMetroResults([]);
      return;
    }
    let cancelled = false;
    setMetroSearching(true);
    searchMetro(metroQuery.trim())
      .then((list) => { if (!cancelled) { setMetroResults(list || []); setMetroDropdownOpen(true); } })
      .finally(() => { if (!cancelled) setMetroSearching(false); });
    return () => { cancelled = true; };
  }, [editingSection, metroQuery]);

  useEffect(() => {
    setManageExpiryDate(formatPlacementExpired(seller.placement_expired_at));
  }, [seller.placement_expired_at]);

  // ── Edit helpers ──
  const startEdit = (section: SdmSection) => {
    let fields: Record<string, string> = {};
    if (section === 'profile') {
      fields = {
        fio: seller.fio || '',
        phone: seller.phone || '',
        shop_name: seller.shop_name || '',
        description: seller.description || '',
        hashtags: seller.hashtags || '',
      };
    } else if (section === 'address') {
      fields = {
        district_id: seller.district_id ? String(seller.district_id) : '1',
        address_name: seller.address_name || '',
        map_url: seller.map_url || '',
        metro_id: seller.metro_id ? String(seller.metro_id) : '',
        metro_walk_minutes: seller.metro_walk_minutes ? String(seller.metro_walk_minutes) : '',
      };
      setMetroQuery('');
    } else if (section === 'delivery') {
      fields = {
        delivery_type: seller.delivery_type || 'both',
        delivery_price: seller.delivery_price != null ? String(seller.delivery_price) : '0',
      };
    }
    setEditedFields(fields);
    setEditingSection(section);
  };

  const cancelEdit = () => {
    setEditingSection(null);
    setEditedFields({});
    setMetroQuery('');
    setMetroDropdownOpen(false);
  };

  const handleFieldChange = (field: string, value: string) => {
    setEditedFields(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveSection = async () => {
    setLoading(true);
    try {
      const updates: Promise<{ status?: string }>[] = [];
      for (const [field, value] of Object.entries(editedFields)) {
        const originalValue =
          field === 'fio' ? seller.fio
          : field === 'phone' ? seller.phone
          : field === 'shop_name' ? seller.shop_name
          : field === 'description' ? seller.description
          : field === 'hashtags' ? seller.hashtags
          : field === 'district_id' ? seller.district_id
          : field === 'address_name' ? seller.address_name
          : field === 'map_url' ? seller.map_url
          : field === 'metro_id' ? seller.metro_id
          : field === 'metro_walk_minutes' ? seller.metro_walk_minutes
          : field === 'delivery_type' ? seller.delivery_type
          : field === 'delivery_price' ? seller.delivery_price
          : undefined;

        const strOrig = originalValue != null ? String(originalValue) : '';
        const strVal = value || '';

        if (field === 'phone') {
          if (phoneToDigits(strOrig) !== phoneToDigits(strVal)) {
            updates.push(updateSellerField(seller.tg_id, field, phoneToDigits(strVal)));
          }
        } else if (strVal !== strOrig) {
          updates.push(updateSellerField(seller.tg_id, field, strVal));
        }
      }

      if (updates.length === 0) { cancelEdit(); return; }

      const results = await Promise.all(updates);
      const hasErrors = results.some(r => r?.status !== 'ok' && r?.status !== undefined);

      if (hasErrors) {
        toast.error('Некоторые поля не удалось сохранить');
      } else {
        toast.success('Изменения сохранены');
      }

      // Update local seller
      const upd = { ...seller };
      Object.entries(editedFields).forEach(([field, value]) => {
        if (['district_id', 'metro_id', 'metro_walk_minutes'].includes(field)) {
          (upd as any)[field] = value ? parseInt(value, 10) : undefined;
        } else if (field === 'delivery_price') {
          (upd as any)[field] = value ? parseFloat(value) : 0;
        } else if (field === 'phone') {
          (upd as any)[field] = phoneToDigits(value);
        } else {
          (upd as any)[field] = value;
        }
      });
      onUpdate(upd);
      onSuccess();
      cancelEdit();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setLoading(false);
    }
  };

  // ── Action handlers ──
  const handleBlock = async () => {
    setLoading(true);
    try {
      const res = await blockSeller(seller.tg_id, !seller.is_blocked);
      if (res?.status === 'ok') {
        onUpdate({ ...seller, is_blocked: !seller.is_blocked });
        onSuccess();
        toast.success(seller.is_blocked ? 'Продавец разблокирован' : 'Продавец заблокирован');
      } else {
        toast.error('Ошибка');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  const handleSetWebCredentials = async () => {
    setCredentialsLoading(true);
    setWebCredentials(null);
    try {
      const res = await setSellerWebCredentials(seller.tg_id);
      setWebCredentials({ web_login: res.web_login, web_password: res.web_password });
      setCurrentCredentials({ web_login: res.web_login, web_password: res.web_password });
      toast.success('Логин и пароль установлены');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setCredentialsLoading(false);
    }
  };

  const handleSetLimit = async () => {
    const num = limit.trim() === '' ? 0 : parseInt(limit, 10);
    if (isNaN(num) || num < 0) { toast.error('Введите число >= 0'); return; }
    setLoading(true);
    try {
      const res = await setSellerLimit(seller.tg_id, num);
      if (res?.status === 'ok') {
        toast.success('Лимит на сегодня обновлён');
        onUpdate({ ...seller, max_orders: num });
        onSuccess();
      } else {
        toast.error((res as { message?: string })?.message || 'Ошибка');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDefaultLimit = async () => {
    const num = defaultLimit.trim() === '' ? 0 : parseInt(defaultLimit, 10);
    if (isNaN(num) || num < 0) { toast.error('Введите число >= 0'); return; }
    setLoading(true);
    try {
      const res = await setSellerDefaultLimit(seller.tg_id, num);
      if (res?.status === 'ok') {
        toast.success('Стандартный лимит обновлён');
        onUpdate({ ...seller, default_daily_limit: num || undefined });
        onSuccess();
      } else {
        toast.error((res as { message?: string })?.message || 'Ошибка');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  const handleSavePlan = async () => {
    setLoading(true);
    try {
      const res = await setSellerSubscriptionPlan(seller.tg_id, subscriptionPlan);
      if (res?.status === 'ok') {
        toast.success('Тариф обновлён');
        onUpdate({ ...seller, subscription_plan: subscriptionPlan });
        onSuccess();
      } else {
        toast.error((res as { message?: string })?.message || 'Ошибка');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveExpiryDate = async () => {
    setLoading(true);
    try {
      const valueToSend = manageExpiryDate.trim() || '';
      const res = await updateSellerField(seller.tg_id, 'placement_expired_at', valueToSend);
      if (res?.status === 'ok') {
        toast.success('Дата окончания обновлена');
        const newISO = valueToSend ? placementExpiredToISO(manageExpiryDate) : undefined;
        onUpdate({ ...seller, placement_expired_at: newISO });
        onSuccess();
      } else {
        toast.error('Ошибка обновления даты');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      const res = await deleteSeller(seller.tg_id);
      if (res?.status === 'ok') {
        toast.success('Продавец удалён');
        onSuccess();
        onClose();
      } else {
        toast.error('Ошибка удаления');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Скопировано');
  };

  // ── Helpers ──
  const getDeliveryTypeLabel = (type: string | undefined) => {
    const found = DELIVERY_TYPES.find(t => t.value === type);
    return found?.label || type || '—';
  };

  const getDistrictName = (id: number | undefined) => {
    const found = DISTRICTS_MSK.find(d => d.id === id);
    return found?.name || '—';
  };

  const getPlanLabel = (plan: string) => {
    if (plan === 'pro') return 'Pro';
    if (plan === 'premium') return 'Premium';
    return 'Free';
  };

  const getExpiryStatus = () => {
    if (!seller.placement_expired_at) return { dot: 'ok' as const, text: 'Бессрочно', sub: '' };
    try {
      const d = new Date(seller.placement_expired_at);
      if (Number.isNaN(d.getTime())) return { dot: 'ok' as const, text: '—', sub: '' };
      const now = new Date();
      const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) return { dot: 'expired' as const, text: formatPlacementExpired(seller.placement_expired_at), sub: `Истёк ${Math.abs(diffDays)} дн. назад` };
      if (diffDays <= 7) return { dot: 'warning' as const, text: formatPlacementExpired(seller.placement_expired_at), sub: `Осталось ${diffDays} дн.` };
      return { dot: 'ok' as const, text: formatPlacementExpired(seller.placement_expired_at), sub: `Осталось ${diffDays} дн.` };
    } catch {
      return { dot: 'ok' as const, text: '—', sub: '' };
    }
  };

  const getSellerStatus = () => {
    if (seller.is_deleted) return { indicator: 'deleted' as const, text: 'Удалён', sub: seller.deleted_at ? `с ${formatPlacementExpired(seller.deleted_at)}` : '' };
    if (seller.is_blocked) return { indicator: 'blocked' as const, text: 'Заблокирован', sub: '' };
    if (isPlacementExpired(seller.placement_expired_at)) return { indicator: 'expired' as const, text: 'Срок истёк', sub: '' };
    return { indicator: 'active' as const, text: 'Активен', sub: '' };
  };

  const expiry = getExpiryStatus();
  const status = getSellerStatus();

  return (
    <div className="sdm-overlay" onClick={onClose}>
      <div className="sdm-panel" onClick={(e) => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="sdm-header">
          <div className="sdm-avatar"><Store size={24} /></div>
          <div className="sdm-header-info">
            <div className="sdm-header-top">
              <span className="sdm-shop-name">{seller.shop_name || 'Без названия'}</span>
              <div className="sdm-header-badges">
                <span className={`sdm-plan-badge sdm-plan-badge--${seller.subscription_plan || 'free'}`}>
                  {getPlanLabel(seller.subscription_plan || 'free')}
                </span>
                {seller.is_blocked && <span className="badge badge-danger">Заблокирован</span>}
                {seller.is_deleted && <span className="badge badge-warning">Удалён</span>}
              </div>
            </div>
            <div className="sdm-seller-fio">{seller.fio} <span className="sdm-seller-id">ID: {seller.tg_id}</span></div>
          </div>
          <button className="sdm-close-btn" onClick={onClose}><X size={18} /></button>
        </div>

        {/* ── Body ── */}
        <div className="sdm-body">

          {/* ── Sidebar Nav ── */}
          <nav className="sdm-sidebar">
            {SDM_NAV.map((group) => (
              <div key={group.group} className="sdm-nav-group">
                <div className="sdm-nav-group-label">{group.group}</div>
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    className={`sdm-nav-item ${activeSection === item.id ? 'sdm-nav-item--active' : ''} ${item.danger ? 'sdm-nav-item--danger' : ''}`}
                    onClick={() => scrollToSection(item.id)}
                  >
                    <item.icon size={16} className="sdm-nav-icon" />
                    {item.label}
                  </button>
                ))}
              </div>
            ))}
          </nav>

          {/* ── Content ── */}
          <div className="sdm-content" ref={contentRef}>

            {/* ═══ Profile ═══ */}
            <div ref={(el) => { sectionRefs.current['profile'] = el; }} className="sdm-section">
              <div className="sdm-section-header">
                <h3 className="sdm-section-title"><User size={16} /> Профиль</h3>
                {editingSection !== 'profile' && (
                  <button className="sdm-edit-btn" onClick={() => startEdit('profile')}>
                    <Edit3 size={14} /> Изменить
                  </button>
                )}
              </div>

              {editingSection === 'profile' ? (
                <>
                  <div className="sdm-edit-field">
                    <label className="sdm-edit-label">Название магазина</label>
                    <input className="sdm-edit-input" value={editedFields.shop_name || ''} onChange={(e) => handleFieldChange('shop_name', e.target.value)} />
                  </div>
                  <div className="sdm-edit-field">
                    <label className="sdm-edit-label">ФИО</label>
                    <input className="sdm-edit-input" value={editedFields.fio || ''} onChange={(e) => handleFieldChange('fio', e.target.value)} />
                  </div>
                  <div className="sdm-edit-field">
                    <label className="sdm-edit-label">Телефон</label>
                    <input className="sdm-edit-input" value={editedFields.phone || ''} onChange={(e) => handleFieldChange('phone', formatPhoneInput(e.target.value))} placeholder="+7 000 000 00 00" maxLength={17} />
                  </div>
                  <div className="sdm-edit-field">
                    <label className="sdm-edit-label">Описание</label>
                    <textarea className="sdm-edit-input sdm-edit-input--textarea" value={editedFields.description || ''} onChange={(e) => handleFieldChange('description', e.target.value)} rows={3} />
                  </div>
                  <div className="sdm-edit-field">
                    <label className="sdm-edit-label">Хештеги</label>
                    <input className="sdm-edit-input" value={editedFields.hashtags || ''} onChange={(e) => handleFieldChange('hashtags', e.target.value)} placeholder="#розы #букеты" />
                  </div>
                  <div className="sdm-section-actions">
                    <button className="sdm-btn sdm-btn--secondary" onClick={cancelEdit} disabled={loading}>Отмена</button>
                    <button className="sdm-btn sdm-btn--primary" onClick={handleSaveSection} disabled={loading}>
                      <Save size={14} /> {loading ? 'Сохранение...' : 'Сохранить'}
                    </button>
                  </div>
                </>
              ) : (
                <div className="sdm-field-grid">
                  <div className="sdm-field">
                    <div className="sdm-field-label">Магазин</div>
                    <div className="sdm-field-value">{seller.shop_name || <span className="sdm-field-value--muted">—</span>}</div>
                  </div>
                  <div className="sdm-field">
                    <div className="sdm-field-label">ФИО</div>
                    <div className="sdm-field-value">{seller.fio || <span className="sdm-field-value--muted">—</span>}</div>
                  </div>
                  <div className="sdm-field">
                    <div className="sdm-field-label">Телефон</div>
                    <div className="sdm-field-value">{seller.phone || <span className="sdm-field-value--muted">—</span>}</div>
                  </div>
                  <div className="sdm-field">
                    <div className="sdm-field-label">Telegram ID</div>
                    <div className="sdm-field-value" style={{ fontFamily: 'monospace' }}>{seller.tg_id}</div>
                  </div>
                  <div className="sdm-field sdm-field--full">
                    <div className="sdm-field-label">Описание</div>
                    <div className="sdm-field-value">{seller.description || <span className="sdm-field-value--muted">Нет описания</span>}</div>
                  </div>
                  {seller.hashtags && (
                    <div className="sdm-field sdm-field--full">
                      <div className="sdm-field-label">Хештеги</div>
                      <div className="sdm-field-value">{seller.hashtags}</div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ═══ Address ═══ */}
            <div ref={(el) => { sectionRefs.current['address'] = el; }} className="sdm-section">
              <div className="sdm-section-header">
                <h3 className="sdm-section-title"><MapPin size={16} /> Адрес</h3>
                {editingSection !== 'address' && (
                  <button className="sdm-edit-btn" onClick={() => startEdit('address')}>
                    <Edit3 size={14} /> Изменить
                  </button>
                )}
              </div>

              {editingSection === 'address' ? (
                <>
                  <div className="sdm-edit-field">
                    <label className="sdm-edit-label">Округ</label>
                    <select className="sdm-edit-input sdm-edit-input--select" value={editedFields.district_id || '1'} onChange={(e) => handleFieldChange('district_id', e.target.value)}>
                      {DISTRICTS_MSK.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                  <div className="sdm-edit-field">
                    <label className="sdm-edit-label">Адрес</label>
                    <input className="sdm-edit-input" value={editedFields.address_name || ''} onChange={(e) => handleFieldChange('address_name', e.target.value)} placeholder="ул. Цветочная, д. 1" />
                  </div>
                  <div className="sdm-edit-field">
                    <label className="sdm-edit-label">Ссылка на карту</label>
                    <input className="sdm-edit-input" value={editedFields.map_url || ''} onChange={(e) => handleFieldChange('map_url', e.target.value)} placeholder="https://yandex.ru/maps/..." />
                  </div>
                  <div className="sdm-edit-field">
                    <label className="sdm-edit-label">Станция метро</label>
                    <div className="sdm-metro-wrap">
                      <input className="sdm-edit-input" placeholder="Поиск станции..." value={metroQuery} onChange={(e) => setMetroQuery(e.target.value)} onFocus={() => metroResults.length > 0 && setMetroDropdownOpen(true)} />
                      {metroDropdownOpen && (
                        <div className="sdm-metro-dropdown">
                          {metroQuery.trim().length < 2 ? (
                            <div className="sdm-metro-hint">Введите минимум 2 символа</div>
                          ) : metroSearching ? (
                            <div className="sdm-metro-hint">Поиск...</div>
                          ) : metroResults.length === 0 ? (
                            <div className="sdm-metro-hint">Станции не найдены</div>
                          ) : (
                            metroResults.map((m) => (
                              <button type="button" key={m.id} className="sdm-metro-option" onClick={() => { handleFieldChange('metro_id', String(m.id)); setMetroQuery(m.name); setMetroDropdownOpen(false); }}>
                                {m.line_color && <span className="sdm-metro-line" style={{ backgroundColor: m.line_color }} />}
                                {m.name}
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  {editedFields.metro_id && (
                    <div className="sdm-edit-field">
                      <label className="sdm-edit-label">Пешком до метро (мин)</label>
                      <input className="sdm-edit-input" type="number" min="1" value={editedFields.metro_walk_minutes || ''} onChange={(e) => handleFieldChange('metro_walk_minutes', e.target.value)} />
                    </div>
                  )}
                  <div className="sdm-section-actions">
                    <button className="sdm-btn sdm-btn--secondary" onClick={cancelEdit} disabled={loading}>Отмена</button>
                    <button className="sdm-btn sdm-btn--primary" onClick={handleSaveSection} disabled={loading}>
                      <Save size={14} /> {loading ? 'Сохранение...' : 'Сохранить'}
                    </button>
                  </div>
                </>
              ) : (
                <div className="sdm-field-grid">
                  <div className="sdm-field">
                    <div className="sdm-field-label">Округ</div>
                    <div className="sdm-field-value">{getDistrictName(seller.district_id)}</div>
                  </div>
                  <div className="sdm-field">
                    <div className="sdm-field-label">Адрес</div>
                    <div className="sdm-field-value">{seller.address_name || <span className="sdm-field-value--muted">—</span>}</div>
                  </div>
                  <div className="sdm-field">
                    <div className="sdm-field-label">Карта</div>
                    <div className="sdm-field-value">
                      {seller.map_url ? (
                        <a href={seller.map_url} target="_blank" rel="noopener noreferrer">
                          Открыть карту <ExternalLink size={12} style={{ display: 'inline', verticalAlign: 'middle' }} />
                        </a>
                      ) : <span className="sdm-field-value--muted">—</span>}
                    </div>
                  </div>
                  <div className="sdm-field">
                    <div className="sdm-field-label">Метро</div>
                    <div className="sdm-field-value">
                      {seller.metro_id ? `ID: ${seller.metro_id}` : <span className="sdm-field-value--muted">—</span>}
                      {seller.metro_walk_minutes ? ` (${seller.metro_walk_minutes} мин)` : ''}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ═══ Delivery ═══ */}
            <div ref={(el) => { sectionRefs.current['delivery'] = el; }} className="sdm-section">
              <div className="sdm-section-header">
                <h3 className="sdm-section-title"><Truck size={16} /> Доставка</h3>
                {editingSection !== 'delivery' && (
                  <button className="sdm-edit-btn" onClick={() => startEdit('delivery')}>
                    <Edit3 size={14} /> Изменить
                  </button>
                )}
              </div>

              {editingSection === 'delivery' ? (
                <>
                  <div className="sdm-edit-field">
                    <label className="sdm-edit-label">Тип доставки</label>
                    <select className="sdm-edit-input sdm-edit-input--select" value={editedFields.delivery_type || 'both'} onChange={(e) => handleFieldChange('delivery_type', e.target.value)}>
                      {DELIVERY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div className="sdm-edit-field">
                    <label className="sdm-edit-label">Стоимость доставки (₽)</label>
                    <input className="sdm-edit-input" type="number" min="0" step="1" value={editedFields.delivery_price || '0'} onChange={(e) => handleFieldChange('delivery_price', e.target.value)} />
                  </div>
                  <div className="sdm-section-actions">
                    <button className="sdm-btn sdm-btn--secondary" onClick={cancelEdit} disabled={loading}>Отмена</button>
                    <button className="sdm-btn sdm-btn--primary" onClick={handleSaveSection} disabled={loading}>
                      <Save size={14} /> {loading ? 'Сохранение...' : 'Сохранить'}
                    </button>
                  </div>
                </>
              ) : (
                <div className="sdm-field-grid">
                  <div className="sdm-field">
                    <div className="sdm-field-label">Тип</div>
                    <div className="sdm-field-value">{getDeliveryTypeLabel(seller.delivery_type)}</div>
                  </div>
                  <div className="sdm-field">
                    <div className="sdm-field-label">Стоимость</div>
                    <div className="sdm-field-value">{seller.delivery_price ?? 0} ₽</div>
                  </div>
                </div>
              )}
            </div>

            {/* ═══ Organization ═══ */}
            <div ref={(el) => { sectionRefs.current['org'] = el; }} className="sdm-section">
              <div className="sdm-section-header">
                <h3 className="sdm-section-title"><Building2 size={16} /> Организация</h3>
              </div>
              {seller.inn || seller.ogrn ? (
                <>
                  <div className="sdm-field-grid">
                    {seller.inn && (
                      <div className="sdm-field">
                        <div className="sdm-field-label">ИНН</div>
                        <div className="sdm-field-value" style={{ fontFamily: 'monospace' }}>{seller.inn}</div>
                      </div>
                    )}
                    {seller.ogrn && (
                      <div className="sdm-field">
                        <div className="sdm-field-label">ОГРН</div>
                        <div className="sdm-field-value" style={{ fontFamily: 'monospace' }}>{seller.ogrn}</div>
                      </div>
                    )}
                  </div>
                  <div className="sdm-divider" />
                  {loadingInnData ? (
                    <div className="sdm-loading"><div className="loader" /></div>
                  ) : innData ? (
                    <OrgDataDisplay data={innData} showFullOkvedDescriptions={false} />
                  ) : (
                    <p className="sdm-hint">Не удалось загрузить данные организации</p>
                  )}
                </>
              ) : (
                <p className="sdm-hint">ИНН и ОГРН не указаны</p>
              )}
            </div>

            {/* ═══ Limits ═══ */}
            <div ref={(el) => { sectionRefs.current['limits'] = el; }} className="sdm-section">
              <div className="sdm-section-header">
                <h3 className="sdm-section-title"><Gauge size={16} /> Лимиты и тариф</h3>
              </div>

              {/* Stats */}
              <div className="sdm-stat-row">
                <div className="sdm-stat-item">
                  <span className="sdm-stat-label">Активные заказы</span>
                  <span className="sdm-stat-value">{seller.active_orders ?? 0}</span>
                </div>
                <div className="sdm-stat-item">
                  <span className="sdm-stat-label">В ожидании</span>
                  <span className="sdm-stat-value">{seller.pending_requests ?? 0}</span>
                </div>
                <div className="sdm-stat-item">
                  <span className="sdm-stat-label">Лимит по тарифу</span>
                  <span className="sdm-stat-value">{seller.plan_limit_cap ?? '—'}</span>
                </div>
              </div>

              {/* Subscription Plan */}
              <div className="sdm-edit-field">
                <label className="sdm-edit-label">Тарифный план</label>
                <div className="sdm-inline-row">
                  <select className="sdm-edit-input sdm-edit-input--select" value={subscriptionPlan} onChange={(e) => setSubscriptionPlan(e.target.value)}>
                    <option value="free">Free (до 10 заказов/день)</option>
                    <option value="pro">Pro (до 50 заказов/день)</option>
                    <option value="premium">Premium (до 100 заказов/день)</option>
                  </select>
                  <button className="sdm-btn sdm-btn--primary" onClick={handleSavePlan} disabled={loading}>Сохранить</button>
                </div>
              </div>

              <div className="sdm-divider" />

              {/* Default daily limit */}
              <div className="sdm-edit-field">
                <label className="sdm-edit-label">Стандартный дневной лимит</label>
                <p className="sdm-hint">Авто-применяется каждый день. 0 или пусто = без лимита.</p>
                <div className="sdm-inline-row">
                  <input className="sdm-edit-input" type="number" min={0} value={defaultLimit} onChange={(e) => setDefaultLimit(e.target.value)} placeholder="Не задан" />
                  <button className="sdm-btn sdm-btn--primary" onClick={handleSaveDefaultLimit} disabled={loading}>Сохранить</button>
                </div>
              </div>

              <div className="sdm-divider" />

              {/* Override for today */}
              <div className="sdm-edit-field">
                <label className="sdm-edit-label">Лимит на сегодня (переопределение)</label>
                <p className="sdm-hint">Действует только на текущий день. 0 = сброс.</p>
                <div className="sdm-inline-row">
                  <input className="sdm-edit-input" type="number" min={0} value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="Не задан" />
                  <button className="sdm-btn sdm-btn--primary" onClick={handleSetLimit} disabled={loading}>Установить</button>
                </div>
              </div>
            </div>

            {/* ═══ Placement ═══ */}
            <div ref={(el) => { sectionRefs.current['placement'] = el; }} className="sdm-section">
              <div className="sdm-section-header">
                <h3 className="sdm-section-title"><Calendar size={16} /> Размещение</h3>
              </div>

              <div className="sdm-expiry">
                <span className={`sdm-expiry-dot sdm-expiry-dot--${expiry.dot}`} />
                <span className="sdm-expiry-text">{expiry.text}</span>
                {expiry.sub && <span className="sdm-expiry-sub">{expiry.sub}</span>}
              </div>

              <div className="sdm-divider" />

              <div className="sdm-edit-field">
                <label className="sdm-edit-label">Изменить дату окончания</label>
                <p className="sdm-hint">ДД.ММ.ГГГГ или пусто — бессрочно</p>
                <div className="sdm-inline-row">
                  <input
                    className="sdm-edit-input"
                    placeholder="ДД.ММ.ГГГГ"
                    value={manageExpiryDate === '—' ? '' : manageExpiryDate}
                    onChange={(e) => setManageExpiryDate(e.target.value)}
                  />
                  <input
                    type="date"
                    className="sdm-edit-input"
                    style={{ maxWidth: 180 }}
                    onChange={(e) => {
                      if (e.target.value) {
                        const date = new Date(e.target.value);
                        const day = String(date.getDate()).padStart(2, '0');
                        const month = String(date.getMonth() + 1).padStart(2, '0');
                        const year = date.getFullYear();
                        setManageExpiryDate(`${day}.${month}.${year}`);
                      }
                    }}
                  />
                  <button className="sdm-btn sdm-btn--primary" onClick={handleSaveExpiryDate} disabled={loading}>Сохранить</button>
                </div>
              </div>
            </div>

            {/* ═══ Web Panel ═══ */}
            <div ref={(el) => { sectionRefs.current['web'] = el; }} className="sdm-section">
              <div className="sdm-section-header">
                <h3 className="sdm-section-title"><Globe size={16} /> Веб-панель</h3>
              </div>

              <p className="sdm-hint">Данные для входа в веб-панель продавца. По умолчанию: логин Seller{seller.tg_id}, пароль — {seller.tg_id}.</p>

              {currentCredentials?.web_login && (
                <>
                  <div className="sdm-credential">
                    <span className="sdm-credential-label">Логин</span>
                    <span className="sdm-credential-value">{currentCredentials.web_login}</span>
                    <div className="sdm-credential-actions">
                      <button className="sdm-btn sdm-btn--icon sdm-btn--secondary" onClick={() => copyToClipboard(currentCredentials.web_login!)} title="Копировать"><Copy size={14} /></button>
                    </div>
                  </div>
                  <div className="sdm-credential">
                    <span className="sdm-credential-label">Пароль</span>
                    <span className="sdm-credential-value">
                      {currentCredentials.web_password != null
                        ? (showPassword ? currentCredentials.web_password : '••••••••')
                        : 'Изменён продавцом'
                      }
                    </span>
                    <div className="sdm-credential-actions">
                      {currentCredentials.web_password != null && (
                        <>
                          <button className="sdm-btn sdm-btn--icon sdm-btn--secondary" onClick={() => setShowPassword(!showPassword)} title={showPassword ? 'Скрыть' : 'Показать'}>
                            {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                          <button className="sdm-btn sdm-btn--icon sdm-btn--secondary" onClick={() => copyToClipboard(currentCredentials.web_password!)} title="Копировать"><Copy size={14} /></button>
                        </>
                      )}
                    </div>
                  </div>
                </>
              )}

              {webCredentials && (
                <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(34, 197, 94, 0.08)', borderRadius: 8 }}>
                  <p className="sdm-hint" style={{ color: 'var(--success)', marginBottom: '0.5rem' }}>Новые данные созданы:</p>
                  <div className="sdm-credential">
                    <span className="sdm-credential-label">Логин</span>
                    <span className="sdm-credential-value">{webCredentials.web_login}</span>
                    <div className="sdm-credential-actions">
                      <button className="sdm-btn sdm-btn--icon sdm-btn--secondary" onClick={() => copyToClipboard(webCredentials.web_login)}><Copy size={14} /></button>
                    </div>
                  </div>
                  <div className="sdm-credential">
                    <span className="sdm-credential-label">Пароль</span>
                    <span className="sdm-credential-value">{webCredentials.web_password}</span>
                    <div className="sdm-credential-actions">
                      <button className="sdm-btn sdm-btn--icon sdm-btn--secondary" onClick={() => copyToClipboard(webCredentials.web_password)}><Copy size={14} /></button>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ marginTop: '1rem' }}>
                <button className="sdm-btn sdm-btn--secondary" onClick={handleSetWebCredentials} disabled={credentialsLoading}>
                  {credentialsLoading ? 'Создание...' : 'Сбросить / создать пароль'}
                </button>
              </div>
            </div>

            {/* ═══ Status ═══ */}
            <div ref={(el) => { sectionRefs.current['status'] = el; }} className="sdm-section">
              <div className="sdm-section-header">
                <h3 className="sdm-section-title"><Shield size={16} /> Статус</h3>
              </div>

              <div className="sdm-status-row">
                <span className={`sdm-status-indicator sdm-status-indicator--${status.indicator}`} />
                <span className="sdm-status-text">{status.text}</span>
                {status.sub && <span className="sdm-status-sub">{status.sub}</span>}
              </div>

              {seller.active_orders && seller.active_orders > 0 && !seller.is_blocked && (
                <p className="sdm-hint" style={{ color: 'var(--warning)' }}>
                  У продавца {seller.active_orders} активных заказов. Блокировка может повлиять на их выполнение.
                </p>
              )}

              <button
                className={`sdm-btn ${seller.is_blocked ? 'sdm-btn--success' : 'sdm-btn--warning'}`}
                onClick={handleBlock}
                disabled={loading}
              >
                <Shield size={14} />
                {seller.is_blocked ? 'Разблокировать' : 'Заблокировать'}
              </button>
            </div>

            {/* ═══ Delete ═══ */}
            <div ref={(el) => { sectionRefs.current['delete'] = el; }} className="sdm-section sdm-section--danger">
              <div className="sdm-section-header">
                <h3 className="sdm-section-title"><Trash2 size={16} /> Удаление</h3>
              </div>

              <p className="sdm-hint">Это действие необратимо. Продавец и все его данные будут удалены из системы.</p>

              <label className="sdm-confirm-check">
                <input type="checkbox" checked={confirmDelete} onChange={(e) => setConfirmDelete(e.target.checked)} />
                Я понимаю, что это действие необратимо
              </label>

              <button
                className="sdm-btn sdm-btn--danger"
                onClick={handleDelete}
                disabled={loading || !confirmDelete}
              >
                <Trash2 size={14} />
                {loading ? 'Удаление...' : 'Удалить продавца'}
              </button>
            </div>

          </div>
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
