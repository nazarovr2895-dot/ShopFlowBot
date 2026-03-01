import { useEffect, useState, useRef, useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useToast } from '../../components/ui';
import {
  createSeller,
  getCities,
  getDistricts,
  suggestAddress,
  checkAddressCoverage,
  type InnData,
  type AddressSuggestion,
  type CoverageCheckResult,
} from '../../api/adminClient';
import type { City, District } from '../../types';
import { MetroSearchField } from '../../components/MetroSearchField';
import { Modal, FormRow, formatPhoneInput, phoneToDigits } from './sellerUtils';

interface AddSellerModalProps {
  onClose: () => void;
  onSuccess: () => void;
  initialInnData?: InnData;
}

export function AddSellerModal({ onClose, onSuccess, initialInnData }: AddSellerModalProps) {
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
        shop_name: shopName,
        description: description || undefined,
        city_id: cityId,
        district_id: districtId,
        metro_id: metroId || undefined,
        metro_walk_minutes: metroWalkMinutes || undefined,
        address_name: selectedAddress || undefined,
        delivery_type: 'both',
        auto_create_delivery_zone: coverageResult?.covered && coverageResult?.district_id ? true : false,
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
      const res = await createSeller(payload) as { status?: string; web_login?: string; web_password?: string; delivery_zone_created?: boolean };
      if (res?.status === 'ok' || res?.status === undefined) {
        if (res.delivery_zone_created === false) {
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
        <FormRow label="Название магазина" value={shopName} onChange={setShopName} required />
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
