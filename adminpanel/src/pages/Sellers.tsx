import { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader, useToast } from '../components/ui';
import {
  Plus, Store, User, MapPin, Truck, Building2, Percent,
  Gauge, Calendar, Globe, Shield, Trash2, X, Edit3, Save,
  Copy, Eye, EyeOff, CreditCard, AlertTriangle, GitBranch, Network,
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
  getSellerBranches,
  getOrgData,
  getCities,
  getDistricts,
  suggestAddress,
  checkAddressCoverage,
  type InnData,
  type AddressSuggestion,
  type CoverageCheckResult,
  getSellerSubscription,
  type SellerSubscriptionInfo,
} from '../api/adminClient';
import type { Seller, MetroStation, City, District, AdminBranchInfo } from '../types';
import { OrgDataDisplay } from '../components/OrgDataDisplay';
import { MetroSearchField } from '../components/MetroSearchField';
import './Sellers.css';

const DELIVERY_TYPES = [
  { value: 'pickup', label: 'Самовывоз' },
  { value: 'delivery', label: 'Доставка' },
  { value: 'both', label: 'Оба' },
];

// Districts are loaded from API (no hardcoded list)

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
export function Sellers() {
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight');
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

  // Scroll to and highlight seller from URL param
  useEffect(() => {
    if (!highlightId || sellers.length === 0) return;
    const el = document.getElementById(`seller-${highlightId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('seller-row--highlighted');
      const timer = setTimeout(() => el.classList.remove('seller-row--highlighted'), 3000);
      return () => clearTimeout(timer);
    }
  }, [highlightId, sellers]);

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
                <th>Филиалы</th>
                <th>Дата окончания</th>
                <th>Статус</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sellers.map((s) => (
                <tr key={s.tg_id} id={`seller-${s.tg_id}`}>
                  <td>{s.fio}</td>
                  <td>{s.shop_name}</td>
                  <td><code>{s.tg_id}</code></td>
                  <td>
                    {(s.branch_count ?? 1) > 1
                      ? <span className="badge badge-info">{s.branch_count}</span>
                      : '—'}
                  </td>
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
  const toast = useToast();
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
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [commissionPercent, setCommissionPercent] = useState('');
  const [isNetworkSeller, setIsNetworkSeller] = useState(false);
  const [maxBranches, setMaxBranches] = useState('3');
  const [credentials, setCredentials] = useState<{ web_login: string; web_password: string } | null>(null);

  // Address autocomplete state
  const [addressQuery, setAddressQuery] = useState('');
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [addressDropdownOpen, setAddressDropdownOpen] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState('');
  const [coverageResult, setCoverageResult] = useState<CoverageCheckResult | null>(null);
  const [checkingCoverage, setCheckingCoverage] = useState(false);
  const addressTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const addressWrapperRef = useRef<HTMLDivElement>(null);

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
      // Don't override districtId if it was set from coverage check
      if (list.length > 0 && !list.find(d => d.id === districtId) && !coverageResult?.district_id) {
        setDistrictId(list[0].id);
      }
    }).catch(() => setDistricts([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityId]);

  // Cleanup address debounce timer on unmount
  useEffect(() => {
    return () => {
      if (addressTimerRef.current) clearTimeout(addressTimerRef.current);
    };
  }, []);

  // Close address dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (addressWrapperRef.current && !addressWrapperRef.current.contains(e.target as Node)) {
        setAddressDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const fetchAddressSuggestions = useCallback(async (q: string) => {
    if (q.length < 3) {
      setAddressSuggestions([]);
      setAddressDropdownOpen(false);
      return;
    }
    try {
      // No city filter — show addresses from all cities
      const data = await suggestAddress(q);
      setAddressSuggestions(data);
      setAddressDropdownOpen(data.length > 0);
    } catch {
      setAddressSuggestions([]);
    }
  }, []);

  const handleAddressInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setAddressQuery(v);
    setSelectedAddress('');
    setCoverageResult(null);
    setDistrictId(0);
    if (addressTimerRef.current) clearTimeout(addressTimerRef.current);
    addressTimerRef.current = setTimeout(() => fetchAddressSuggestions(v), 250);
  };

  const handleAddressSelect = async (suggestion: AddressSuggestion) => {
    setAddressQuery(suggestion.value);
    setSelectedAddress(suggestion.value);
    setAddressDropdownOpen(false);
    setAddressSuggestions([]);

    // Auto-detect city from address
    let resolvedCityId = cityId;
    if (suggestion.city) {
      const matchedCity = cities.find(c => c.name.toLowerCase() === suggestion.city!.toLowerCase());
      if (matchedCity) {
        resolvedCityId = matchedCity.id;
        setCityId(matchedCity.id);
      }
    }

    // Check coverage using resolved city
    setCheckingCoverage(true);
    try {
      const result = await checkAddressCoverage(suggestion.value, resolvedCityId);
      setCoverageResult(result);
      if (result.covered && result.district_id) {
        setDistrictId(result.district_id);
      }
    } catch {
      setCoverageResult(null);
    } finally {
      setCheckingCoverage(false);
    }
  };

  const handlePhoneChange = (value: string) => {
    const formatted = formatPhoneInput(value);
    setPhoneDisplay(formatted);
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

    // Validate tg_id — required
    if (!tgId.trim()) {
      setError('Telegram ID обязателен');
      return;
    }
    const parsedTgId = parseInt(tgId.trim(), 10);
    if (isNaN(parsedTgId) || parsedTgId <= 0) {
      setError('Telegram ID должен быть положительным числом');
      return;
    }

    setSubmitting(true);
    setCredentials(null);
    try {
      const payload: Record<string, unknown> = {
        tg_id: parseInt(tgId.trim(), 10),
        fio,
        phone: phoneDigits,
        shop_name: shopName || undefined,
      };
      if (initialInnData?.inn) {
        payload.inn = initialInnData.inn;
      }
      if (initialInnData?.ogrn) {
        payload.ogrn = initialInnData.ogrn;
      }
      if (commissionPercent) {
        const cp = parseInt(commissionPercent, 10);
        if (!isNaN(cp) && cp >= 0 && cp <= 100) payload.commission_percent = cp;
      }
      if (isNetworkSeller) {
        const mb = parseInt(maxBranches, 10);
        if (!isNaN(mb) && mb >= 1) payload.max_branches = mb;
      } else {
        // Shop-specific fields only for regular sellers
        payload.description = description || undefined;
        payload.city_id = cityId;
        payload.district_id = districtId;
        payload.metro_id = metroId || undefined;
        payload.metro_walk_minutes = metroWalkMinutes || undefined;
        payload.address_name = selectedAddress || undefined;
        payload.delivery_type = 'both';
        payload.auto_create_delivery_zone = coverageResult?.covered && coverageResult?.district_id ? true : false;
      }
      const res = await createSeller(payload) as { status?: string; web_login?: string; web_password?: string; delivery_zone_created?: boolean };
      if (res?.status === 'ok' || res?.status === undefined) {
        if (!isNetworkSeller && res.delivery_zone_created === false) {
          toast.error('Продавец создан, но зона доставки не создалась. Создайте вручную.');
        }
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
          <p className="credentials-hint">{isNetworkSeller ? 'Данные для входа в панель управления сетью. Передайте управляющему.' : 'Данные для входа созданы автоматически. Передайте их продавцу для входа в веб-панель.'}</p>
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
          <label className="form-label">Telegram ID *</label>
          <input
            type="text"
            className="form-input"
            value={tgId}
            onChange={(e) => setTgId(e.target.value.replace(/\D/g, ''))}
            placeholder="Введите Telegram ID пользователя"
            required
          />
          <small className="form-hint">Telegram ID пользователя (числовой). Обязательное поле.</small>
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
        <FormRow label={isNetworkSeller ? 'Название сети' : 'Название магазина'} value={shopName} onChange={setShopName} required />
        {!isNetworkSeller && (
          <>
            <FormRow label="Описание" value={description} onChange={setDescription} textarea />
            <FormRow label="Город" render={
              <select className="form-input" value={cityId} onChange={(e) => setCityId(parseInt(e.target.value, 10))}>
                {cities.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            } />
            <div className="form-group">
              <label className="form-label">Адрес (DaData)</label>
              <div ref={addressWrapperRef} style={{ position: 'relative' }}>
                <input
                  className="form-input"
                  value={addressQuery}
                  onChange={handleAddressInputChange}
                  onFocus={() => { if (addressSuggestions.length > 0) setAddressDropdownOpen(true); }}
                  placeholder="Начните вводить адрес..."
                  autoComplete="off"
                />
                {addressDropdownOpen && addressSuggestions.length > 0 && (
                  <div className="cov-district-ac__dropdown" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10 }}>
                    {addressSuggestions.map((s, i) => (
                      <div
                        key={i}
                        className="cov-district-ac__option"
                        onClick={() => handleAddressSelect(s)}
                      >
                        {s.value}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {checkingCoverage && (
                <small className="form-hint" style={{ color: 'var(--text-secondary)' }}>Проверка покрытия...</small>
              )}
              {coverageResult && !checkingCoverage && (
                coverageResult.covered ? (
                  <small className="form-hint" style={{ color: 'var(--success)', fontWeight: 500 }}>
                    Доступно — {coverageResult.district_name}
                  </small>
                ) : (
                  <small className="form-hint" style={{ color: 'var(--danger)', fontWeight: 500 }}>
                    <AlertTriangle size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                    Адрес не в зоне покрытия{coverageResult.district_name ? ` (район: ${coverageResult.district_name})` : ''}. Добавьте район в области покрытия.
                  </small>
                )
              )}
            </div>
            <FormRow label="Район" render={
              <select className="form-input" value={districtId} onChange={(e) => { setDistrictId(parseInt(e.target.value, 10)); setCoverageResult(null); setSelectedAddress(''); setAddressQuery(''); }}>
                {districts.map((d) => (
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
          </>
        )}
        <div className="form-group">
          <label className="form-label">Индивидуальная комиссия (%)</label>
          <input
            type="number"
            className="form-input"
            min={0}
            max={100}
            value={commissionPercent}
            onChange={(e) => setCommissionPercent(e.target.value)}
            placeholder="Глобальная по умолчанию"
          />
          <small className="form-hint">Оставьте пустым для использования глобальной комиссии платформы</small>
        </div>
        <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
            <input
              type="checkbox"
              checked={isNetworkSeller}
              onChange={(e) => setIsNetworkSeller(e.target.checked)}
            />
            Сеть (несколько филиалов)
          </label>
          {isNetworkSeller && (
            <input
              type="number"
              className="form-input"
              min={1}
              max={100}
              value={maxBranches}
              onChange={(e) => setMaxBranches(e.target.value)}
              style={{ width: '100px' }}
              placeholder="Макс."
            />
          )}
          {isNetworkSeller && <small style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>макс. филиалов</small>}
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

type SdmSection = 'profile' | 'address' | 'delivery' | 'org' | 'branches' | 'network' | 'limits' | 'commission' | 'payment' | 'placement' | 'web' | 'status' | 'delete';

const SDM_NAV: { group: string; items: { id: SdmSection; label: string; icon: typeof Store; danger?: boolean }[] }[] = [
  {
    group: 'Информация',
    items: [
      { id: 'profile', label: 'Профиль', icon: User },
      { id: 'address', label: 'Адрес', icon: MapPin },
      { id: 'delivery', label: 'Доставка', icon: Truck },
      { id: 'org', label: 'Организация', icon: Building2 },
      { id: 'branches', label: 'Филиалы', icon: GitBranch },
      { id: 'network', label: 'Тип аккаунта', icon: Network },
    ],
  },
  {
    group: 'Управление',
    items: [
      { id: 'limits', label: 'Лимиты и тариф', icon: Gauge },
      { id: 'commission', label: 'Комиссия', icon: Percent },
      { id: 'payment', label: 'ЮКасса', icon: CreditCard },
      { id: 'placement', label: 'Подписка', icon: Calendar },
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

  // Subscription
  const [subscriptionInfo, setSubscriptionInfo] = useState<SellerSubscriptionInfo | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);

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

  // Branches
  const [branchList, setBranchList] = useState<AdminBranchInfo[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);

  // Metro search
  const [metroQuery, setMetroQuery] = useState('');
  const [metroResults, setMetroResults] = useState<MetroStation[]>([]);
  const [metroSearching, setMetroSearching] = useState(false);
  const [metroDropdownOpen, setMetroDropdownOpen] = useState(false);

  // Districts loaded from API for this seller's city
  const [modalDistricts, setModalDistricts] = useState<District[]>([]);

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

  // Load districts for seller's city
  useEffect(() => {
    if (seller.city_id) {
      getDistricts(seller.city_id).then(setModalDistricts).catch(() => setModalDistricts([]));
    }
  }, [seller.city_id]);

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

  // Load subscription info
  useEffect(() => {
    setSubscriptionLoading(true);
    getSellerSubscription(seller.tg_id)
      .then(setSubscriptionInfo)
      .catch(() => setSubscriptionInfo(null))
      .finally(() => setSubscriptionLoading(false));
  }, [seller.tg_id]);

  // Load branches
  useEffect(() => {
    if ((seller.branch_count ?? 1) > 1) {
      setBranchesLoading(true);
      getSellerBranches(seller.tg_id)
        .then(setBranchList)
        .catch(() => setBranchList([]))
        .finally(() => setBranchesLoading(false));
    }
  }, [seller.tg_id, seller.branch_count]);

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
        metro_id: seller.metro_id ? String(seller.metro_id) : '',
        metro_walk_minutes: seller.metro_walk_minutes ? String(seller.metro_walk_minutes) : '',
      };
      setMetroQuery('');
    } else if (section === 'delivery') {
      fields = {
        delivery_type: seller.delivery_type || 'both',
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
          : field === 'metro_id' ? seller.metro_id
          : field === 'metro_walk_minutes' ? seller.metro_walk_minutes
          : field === 'delivery_type' ? seller.delivery_type
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
    if (!id) return '—';
    const found = modalDistricts.find(d => d.id === id);
    return found?.name || `#${id}`;
  };

  const getPlanLabel = (plan: string) => {
    if (plan === 'pro') return 'Pro';
    if (plan === 'premium') return 'Premium';
    return 'Free';
  };

  const getSubscriptionStatus = () => {
    const active = subscriptionInfo?.active;
    if (!active) return { dot: 'expired' as const, text: 'Нет активной подписки', sub: '' };
    const days = active.days_remaining;
    const expiresAt = active.expires_at ? new Date(active.expires_at).toLocaleDateString('ru-RU') : '';
    if (days <= 0) return { dot: 'expired' as const, text: `Истекла ${expiresAt}`, sub: '' };
    if (days <= 7) return { dot: 'warning' as const, text: `Активна до ${expiresAt}`, sub: `Осталось ${days} дн.` };
    return { dot: 'ok' as const, text: `Активна до ${expiresAt}`, sub: `Осталось ${days} дн.` };
  };

  const getSellerStatus = () => {
    if (seller.is_deleted) return { indicator: 'deleted' as const, text: 'Удалён', sub: seller.deleted_at ? `с ${formatPlacementExpired(seller.deleted_at)}` : '' };
    if (seller.is_blocked) return { indicator: 'blocked' as const, text: 'Заблокирован', sub: '' };
    if (isPlacementExpired(seller.placement_expired_at)) return { indicator: 'expired' as const, text: 'Срок истёк', sub: '' };
    return { indicator: 'active' as const, text: 'Активен', sub: '' };
  };

  const subStatus = getSubscriptionStatus();
  const status = getSellerStatus();

  return (
    <div className="sdm-overlay">
      <div className="sdm-panel">

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
            {SDM_NAV.map((group) => {
              const items = group.items.filter((item) =>
                item.id !== 'branches' || (seller.branch_count ?? 1) > 1
              );
              if (items.length === 0) return null;
              return (
                <div key={group.group} className="sdm-nav-group">
                  <div className="sdm-nav-group-label">{group.group}</div>
                  {items.map((item) => (
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
              );
            })}
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
                    <label className="sdm-edit-label">Район</label>
                    <select className="sdm-edit-input sdm-edit-input--select" value={editedFields.district_id || ''} onChange={(e) => handleFieldChange('district_id', e.target.value)}>
                      <option value="">— не выбран —</option>
                      {modalDistricts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                  <div className="sdm-edit-field">
                    <label className="sdm-edit-label">Адрес</label>
                    <input className="sdm-edit-input" value={editedFields.address_name || ''} onChange={(e) => handleFieldChange('address_name', e.target.value)} placeholder="ул. Цветочная, д. 1" />
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
                    <div className="sdm-field-label">Район</div>
                    <div className="sdm-field-value">{getDistrictName(seller.district_id)}</div>
                  </div>
                  <div className="sdm-field">
                    <div className="sdm-field-label">Адрес</div>
                    <div className="sdm-field-value">{seller.address_name || <span className="sdm-field-value--muted">—</span>}</div>
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
                    <label className="sdm-edit-label">Стоимость доставки</label>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Настраивается в зонах доставки</span>
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
                    <div className="sdm-field-value" style={{ color: 'var(--text-muted)' }}>Зоны доставки</div>
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

            {/* ═══ Branches ═══ */}
            {(seller.branch_count ?? 1) > 1 && (
              <div ref={(el) => { sectionRefs.current['branches'] = el; }} className="sdm-section">
                <div className="sdm-section-header">
                  <h3 className="sdm-section-title"><GitBranch size={16} /> Филиалы ({seller.branch_count})</h3>
                </div>
                {branchesLoading ? (
                  <div className="sdm-loading"><div className="loader" /></div>
                ) : branchList.length > 0 ? (
                  <div className="sdm-branch-list">
                    {branchList.map((b) => (
                      <div key={b.seller_id} className={`sdm-branch-item ${b.is_blocked ? 'sdm-branch-item--blocked' : ''}`}>
                        <div className="sdm-branch-name">
                          {b.shop_name || `#${b.seller_id}`}
                          {b.is_owner && <span className="badge badge-info" style={{ marginLeft: 6 }}>Основной</span>}
                          {b.is_blocked && <span className="badge badge-danger" style={{ marginLeft: 6 }}>Заблокирован</span>}
                        </div>
                        {b.address_name && <div className="sdm-branch-address">{b.address_name}</div>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="sdm-hint">Нет филиалов</p>
                )}
              </div>
            )}

            {/* ═══ Network Type ═══ */}
            <div ref={(el) => { sectionRefs.current['network'] = el; }} className="sdm-section">
              <div className="sdm-section-header">
                <h3 className="sdm-section-title"><Network size={16} /> Тип аккаунта</h3>
              </div>
              <div className="sdm-field-row">
                <span className="sdm-field-label">Тип</span>
                <span className="sdm-field-value">
                  {(seller.max_branches ?? 0) > 0 ? (
                    <span className="badge badge-info">Сеть (до {seller.max_branches} филиалов)</span>
                  ) : (
                    <span className="badge">Одиночный</span>
                  )}
                </span>
              </div>
              {editingSection === 'network' ? (
                <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>max_branches:</label>
                  <input
                    type="number"
                    className="form-input"
                    min={0}
                    max={100}
                    value={editedFields.max_branches ?? String(seller.max_branches ?? 0)}
                    onChange={(e) => setEditedFields(prev => ({ ...prev, max_branches: e.target.value }))}
                    style={{ width: '100px' }}
                  />
                  <button
                    className="btn btn-sm btn-primary"
                    disabled={loading}
                    onClick={async () => {
                      setLoading(true);
                      try {
                        await updateSellerField(seller.tg_id, 'max_branches', editedFields.max_branches ?? String(seller.max_branches ?? 0));
                        onUpdate({ ...seller, max_branches: parseInt(editedFields.max_branches ?? '0', 10) || null });
                        toast.success('Сохранено');
                        setEditingSection(null);
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : 'Ошибка');
                      } finally {
                        setLoading(false);
                      }
                    }}
                  >
                    <Save size={13} />
                  </button>
                  <button className="btn btn-sm" onClick={() => setEditingSection(null)}>Отмена</button>
                </div>
              ) : (
                <button className="btn btn-sm" style={{ marginTop: '0.5rem' }} onClick={() => { setEditingSection('network'); setEditedFields({ max_branches: String(seller.max_branches ?? 0) }); }}>
                  <Edit3 size={13} /> Изменить
                </button>
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

            {/* ═══ Commission ═══ */}
            <div ref={(el) => { sectionRefs.current['commission'] = el; }} className="sdm-section">
              <div className="sdm-section-header">
                <h3 className="sdm-section-title"><Percent size={16} /> Индивидуальная комиссия</h3>
              </div>
              <p className="sdm-hint">
                Если задана индивидуальная комиссия — она используется вместо глобальной.
                Оставьте пустым для использования глобальной комиссии.
              </p>
              <div className="sdm-edit-field">
                <label className="sdm-edit-label">Комиссия (%)</label>
                <div className="sdm-inline-row">
                  <input
                    className="sdm-edit-input"
                    type="number"
                    min={0}
                    max={100}
                    value={seller.commission_percent ?? ''}
                    placeholder="Глобальная по умолчанию"
                    onChange={(e) => onUpdate({ ...seller, commission_percent: e.target.value ? parseInt(e.target.value, 10) : null })}
                  />
                  <button
                    className="sdm-btn sdm-btn--primary"
                    disabled={loading}
                    onClick={async () => {
                      try {
                        setLoading(true);
                        const val = seller.commission_percent != null ? String(seller.commission_percent) : 'null';
                        await updateSellerField(seller.tg_id, 'commission_percent', val);
                        toast.success('Комиссия обновлена');
                        onSuccess();
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : 'Ошибка');
                      } finally {
                        setLoading(false);
                      }
                    }}
                  >
                    Сохранить
                  </button>
                  {seller.commission_percent != null && (
                    <button
                      className="sdm-btn sdm-btn--secondary"
                      disabled={loading}
                      onClick={async () => {
                        try {
                          setLoading(true);
                          await updateSellerField(seller.tg_id, 'commission_percent', 'null');
                          onUpdate({ ...seller, commission_percent: null });
                          toast.success('Комиссия сброшена на глобальную');
                          onSuccess();
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : 'Ошибка');
                        } finally {
                          setLoading(false);
                        }
                      }}
                    >
                      Сбросить
                    </button>
                  )}
                </div>
              </div>
              <div className="sdm-stat-row" style={{ marginTop: 'var(--space-3)' }}>
                <div className="sdm-stat-item">
                  <span className="sdm-stat-label">Текущая комиссия</span>
                  <span className="sdm-stat-value">{seller.commission_percent != null ? `${seller.commission_percent}% (индивид.)` : 'Глобальная'}</span>
                </div>
              </div>
            </div>

            {/* ═══ Payment (YuKassa) ═══ */}
            <div ref={(el) => { sectionRefs.current['payment'] = el; }} className="sdm-section">
              <div className="sdm-section-header">
                <h3 className="sdm-section-title"><CreditCard size={16} /> ЮКасса</h3>
              </div>
              <p className="sdm-hint">
                ID аккаунта продавца в системе ЮКасса. Если задан — при принятии заказа автоматически создаётся платёж с разделением денег (комиссия платформы + перевод продавцу).
              </p>
              <div className="sdm-edit-field">
                <label className="sdm-edit-label">YooKassa Account ID</label>
                <div className="sdm-inline-row">
                  <input
                    className="sdm-edit-input"
                    type="text"
                    value={seller.yookassa_account_id ?? ''}
                    placeholder="Не подключён"
                    onChange={(e) => onUpdate({ ...seller, yookassa_account_id: e.target.value || null })}
                  />
                  <button
                    className="sdm-btn sdm-btn--primary"
                    disabled={loading}
                    onClick={async () => {
                      try {
                        setLoading(true);
                        const val = seller.yookassa_account_id || '';
                        await updateSellerField(seller.tg_id, 'yookassa_account_id', val || 'null');
                        toast.success('YooKassa Account ID обновлён');
                        onSuccess();
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : 'Ошибка');
                      } finally {
                        setLoading(false);
                      }
                    }}
                  >
                    Сохранить
                  </button>
                  {seller.yookassa_account_id && (
                    <button
                      className="sdm-btn sdm-btn--secondary"
                      disabled={loading}
                      onClick={async () => {
                        try {
                          setLoading(true);
                          await updateSellerField(seller.tg_id, 'yookassa_account_id', 'null');
                          onUpdate({ ...seller, yookassa_account_id: null });
                          toast.success('YooKassa Account ID удалён');
                          onSuccess();
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : 'Ошибка');
                        } finally {
                          setLoading(false);
                        }
                      }}
                    >
                      Отключить
                    </button>
                  )}
                </div>
              </div>
              <div className="sdm-stat-row" style={{ marginTop: 'var(--space-3)' }}>
                <div className="sdm-stat-item">
                  <span className="sdm-stat-label">Статус оплаты</span>
                  <span className="sdm-stat-value">
                    {seller.yookassa_account_id
                      ? '✅ Подключён'
                      : '❌ Не подключён'}
                  </span>
                </div>
              </div>
            </div>

            {/* ═══ Subscription ═══ */}
            <div ref={(el) => { sectionRefs.current['placement'] = el; }} className="sdm-section">
              <div className="sdm-section-header">
                <h3 className="sdm-section-title"><Calendar size={16} /> Подписка</h3>
              </div>

              {subscriptionLoading ? (
                <p className="sdm-hint">Загрузка...</p>
              ) : (
                <>
                  <div className="sdm-expiry">
                    <span className={`sdm-expiry-dot sdm-expiry-dot--${subStatus.dot}`} />
                    <span className="sdm-expiry-text">{subStatus.text}</span>
                    {subStatus.sub && <span className="sdm-expiry-sub">{subStatus.sub}</span>}
                  </div>

                  {subscriptionInfo?.active && (
                    <div className="sdm-stat-row" style={{ marginTop: '0.75rem' }}>
                      <div className="sdm-stat-item">
                        <span className="sdm-stat-label">Период</span>
                        <span className="sdm-stat-value">{subscriptionInfo.active.period_months} мес.</span>
                      </div>
                      <div className="sdm-stat-item">
                        <span className="sdm-stat-label">Оплачено</span>
                        <span className="sdm-stat-value">{subscriptionInfo.active.amount_paid} ₽</span>
                      </div>
                      <div className="sdm-stat-item">
                        <span className="sdm-stat-label">Автопродление</span>
                        <span className="sdm-stat-value">{subscriptionInfo.active.auto_renew ? 'Да' : 'Нет'}</span>
                      </div>
                    </div>
                  )}

                  {subscriptionInfo?.history && subscriptionInfo.history.length > 0 && (
                    <>
                      <div className="sdm-divider" />
                      <label className="sdm-edit-label">История подписок</label>
                      <div style={{ maxHeight: 200, overflowY: 'auto', marginTop: '0.5rem' }}>
                        {subscriptionInfo.history.map((h) => (
                          <div key={h.id} className="sdm-stat-row" style={{ marginBottom: '0.5rem', padding: '0.5rem', borderRadius: 8, background: 'var(--bg-elevated, rgba(255,255,255,0.03))' }}>
                            <div className="sdm-stat-item">
                              <span className="sdm-stat-label">Период</span>
                              <span className="sdm-stat-value">{h.period_months} мес.</span>
                            </div>
                            <div className="sdm-stat-item">
                              <span className="sdm-stat-label">Статус</span>
                              <span className="sdm-stat-value">
                                <span className={`badge badge-${h.status === 'active' ? 'success' : h.status === 'expired' ? 'warning' : 'info'}`}>
                                  {h.status === 'active' ? 'Активна' : h.status === 'expired' ? 'Истекла' : h.status === 'pending' ? 'Ожидание' : h.status === 'cancelled' ? 'Отменена' : h.status}
                                </span>
                              </span>
                            </div>
                            <div className="sdm-stat-item">
                              <span className="sdm-stat-label">Сумма</span>
                              <span className="sdm-stat-value">{h.amount_paid} ₽</span>
                            </div>
                            <div className="sdm-stat-item">
                              <span className="sdm-stat-label">Срок</span>
                              <span className="sdm-stat-value" style={{ fontSize: '0.75rem' }}>
                                {h.started_at ? new Date(h.started_at).toLocaleDateString('ru-RU') : '—'}
                                {' → '}
                                {h.expires_at ? new Date(h.expires_at).toLocaleDateString('ru-RU') : '—'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
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
    <div className="modal-overlay">
      <div className="modal">
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
