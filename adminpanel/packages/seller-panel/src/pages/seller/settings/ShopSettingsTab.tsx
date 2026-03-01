import { useEffect, useRef, useState } from 'react';
import { updateMe, getBannerImageUrl, uploadBannerPhoto, searchMetro } from '../../../api/sellerClient';
import { FormField, useToast } from '@shared/components/ui';
import { useEditMode } from '@shared/hooks/useEditMode';
import { LocationPicker } from '../../../components/LocationPicker';
import { MetroSearchField } from '@shared/components/MetroSearchField';
import { Toggle } from '@shared/components/ui';
import { Store, Image, Link as LinkIcon, Pencil, MapPin, Truck, Copy, ExternalLink, Upload, Trash2, MessageSquare } from 'lucide-react';
import type { SettingsTabProps } from './types';
import './ShopSettingsTab.css';

const DELIVERY_LABELS: Record<string, string> = {
  'доставка': 'Только доставка',
  'самовывоз': 'Только самовывоз',
  'доставка и самовывоз': 'Доставка и самовывоз',
};

const DELIVERY_OPTIONS = [
  { value: '', label: 'Не указано' },
  { value: 'доставка', label: 'Только доставка' },
  { value: 'самовывоз', label: 'Только самовывоз' },
  { value: 'доставка и самовывоз', label: 'Доставка и самовывоз' },
];

export function ShopSettingsTab({ me, reload }: SettingsTabProps) {
  const toast = useToast();

  const shopEdit = useEditMode({
    shopName: me.shop_name || '',
    description: me.description || '',
    deliveryType: me.delivery_type || '',
    addressName: me.address_name || '',
  });

  const [showMapPicker, setShowMapPicker] = useState(false);
  const [savingGeo, setSavingGeo] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [bannerRemoving, setBannerRemoving] = useState(false);
  const bannerFileInputRef = useRef<HTMLInputElement>(null);

  // Metro state
  const [metroId, setMetroId] = useState<number | null>(me.metro_id ?? null);
  const [metroWalkMinutes, setMetroWalkMinutes] = useState<number | null>(me.metro_walk_minutes ?? null);

  useEffect(() => {
    setMetroId(me.metro_id ?? null);
    setMetroWalkMinutes(me.metro_walk_minutes ?? null);
  }, [me.metro_id, me.metro_walk_minutes]);

  const handleSaveShopSettings = async () => {
    shopEdit.setSaving(true);
    try {
      const payload: Parameters<typeof updateMe>[0] = {
        shop_name: shopEdit.draft.shopName.trim() || undefined,
        description: shopEdit.draft.description.trim() || undefined,
        delivery_type: shopEdit.draft.deliveryType.trim() || undefined,
        address_name: shopEdit.draft.addressName.trim() || undefined,
      };
      // Metro fields (0 = clear)
      if (me.has_metro) {
        payload.metro_id = metroId ?? 0;
        payload.metro_walk_minutes = metroWalkMinutes ?? 0;
      }
      // If seller already has geo coordinates and address changed, keep existing coords
      // (they'll be auto-geocoded by backend, but seller can re-pick on map)
      await updateMe(payload);
      await reload();
      shopEdit.setIsEditing(false);
      toast.success('Настройки сохранены');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      shopEdit.setSaving(false);
    }
  };

  const handleMapConfirm = async (lat: number, lon: number) => {
    setShowMapPicker(false);
    setSavingGeo(true);
    try {
      await updateMe({ geo_lat: lat, geo_lon: lon });
      await reload();
      toast.success('Местоположение сохранено');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка сохранения координат');
    } finally {
      setSavingGeo(false);
    }
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBannerUploading(true);
    try {
      await uploadBannerPhoto(file);
      await reload();
      e.target.value = '';
      toast.success('Баннер загружен');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка загрузки баннера');
    } finally {
      setBannerUploading(false);
    }
  };

  const handleRemoveBanner = async () => {
    setBannerRemoving(true);
    try {
      await updateMe({ banner_url: null });
      await reload();
      toast.success('Баннер удалён');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBannerRemoving(false);
    }
  };

  const hasGeo = me.geo_lat != null && me.geo_lon != null;

  return (
    <div className="settings-shop">
      {/* ── Section 1: Shop info ──────────────────── */}
      <div className="shop-card">
        <div className="shop-card__header">
          <div className="shop-card__header-left">
            <div className="shop-card__icon-badge">
              <Store size={18} />
            </div>
            <div>
              <h3 className="shop-card__title">Основные настройки</h3>
              <p className="shop-card__subtitle">Информация о вашем магазине</p>
            </div>
          </div>
          {!shopEdit.isEditing && (
            <button className="shop-card__edit-btn" onClick={shopEdit.startEditing}>
              <Pencil size={14} />
              <span>Изменить</span>
            </button>
          )}
        </div>

        {shopEdit.isEditing ? (
          <div className="shop-form">
            {/* Row 1: Name */}
            <FormField label="Название магазина">
              <input
                type="text"
                value={shopEdit.draft.shopName}
                onChange={(e) => shopEdit.updateField('shopName', e.target.value)}
                placeholder="Например: Цветочный рай"
                className="form-input"
              />
            </FormField>

            {/* Row 2: Description */}
            <FormField label="Описание">
              <textarea
                value={shopEdit.draft.description}
                onChange={(e) => shopEdit.updateField('description', e.target.value)}
                placeholder="Краткое описание вашего магазина"
                className="form-input"
                rows={3}
              />
            </FormField>

            {/* Row 3: Delivery — 2 columns */}
            <div className="shop-form__row-2col">
              <FormField label="Тип доставки">
                <select
                  value={shopEdit.draft.deliveryType}
                  onChange={(e) => shopEdit.updateField('deliveryType', e.target.value)}
                  className="form-input"
                >
                  {DELIVERY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Цена доставки">
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Настраивается в зонах доставки
                </span>
              </FormField>
            </div>

            {/* Row 4: Address + Map button */}
            <div className="shop-form__row-2col">
              <FormField label="Адрес магазина">
                <input
                  type="text"
                  value={shopEdit.draft.addressName}
                  onChange={(e) => shopEdit.updateField('addressName', e.target.value)}
                  placeholder="Например: ул. Тверская, д. 1"
                  className="form-input"
                />
              </FormField>
              <FormField label="Точка на карте">
                <button
                  type="button"
                  className="shop-form__map-btn"
                  onClick={() => setShowMapPicker(true)}
                  disabled={savingGeo}
                >
                  <MapPin size={15} />
                  {hasGeo
                    ? (savingGeo ? 'Сохранение...' : 'Изменить точку на карте')
                    : (savingGeo ? 'Сохранение...' : 'Указать на карте')
                  }
                </button>
                {hasGeo && (
                  <span className="shop-form__geo-hint">
                    {me.geo_lat!.toFixed(5)}, {me.geo_lon!.toFixed(5)}
                  </span>
                )}
              </FormField>
            </div>

            {/* Row 5: Metro (only if city has metro) */}
            {me.has_metro && (
              <MetroSearchField
                metroId={metroId}
                metroWalkMinutes={metroWalkMinutes}
                onMetroChange={(mId, walkMin) => {
                  setMetroId(mId);
                  setMetroWalkMinutes(walkMin);
                }}
                initialStationName={me.metro_name || ''}
                searchMetro={searchMetro}
              />
            )}

            {/* Actions */}
            <div className="shop-form__actions">
              <button
                className="btn btn-primary"
                onClick={handleSaveShopSettings}
                disabled={shopEdit.saving}
              >
                {shopEdit.saving ? 'Сохранение...' : 'Сохранить'}
              </button>
              <button className="btn btn-ghost" onClick={shopEdit.cancelEditing}>
                Отмена
              </button>
            </div>
          </div>
        ) : (
          <div className="shop-view">
            <div className="shop-view__grid">
              {/* Name + Description — full width */}
              <div className="shop-view__item shop-view__item--wide">
                <span className="shop-view__label">Название</span>
                <span className="shop-view__value shop-view__value--primary">{me.shop_name || '—'}</span>
              </div>
              <div className="shop-view__item shop-view__item--wide">
                <span className="shop-view__label">Описание</span>
                <span className="shop-view__value">{me.description || '—'}</span>
              </div>

              {/* Delivery — 2 columns */}
              <div className="shop-view__item">
                <div className="shop-view__label-row">
                  <Truck size={14} className="shop-view__label-icon" />
                  <span className="shop-view__label">Доставка</span>
                </div>
                <span className="shop-view__value">
                  {DELIVERY_LABELS[me.delivery_type || ''] || me.delivery_type || '—'}
                </span>
              </div>
              <div className="shop-view__item">
                <span className="shop-view__label">Цена доставки</span>
                <span className="shop-view__value" style={{ color: 'var(--text-muted)' }}>
                  Настраивается в зонах доставки
                </span>
              </div>

              {/* Address + Location — 2 columns */}
              <div className="shop-view__item">
                <div className="shop-view__label-row">
                  <MapPin size={14} className="shop-view__label-icon" />
                  <span className="shop-view__label">Адрес</span>
                </div>
                <span className="shop-view__value">{me.address_name || '—'}</span>
              </div>
              <div className="shop-view__item">
                <span className="shop-view__label">Точка на карте</span>
                <span className="shop-view__value">
                  {hasGeo ? (
                    <span className="shop-view__geo-info">
                      <a
                        href={`https://yandex.ru/maps/?pt=${me.geo_lon},${me.geo_lat}&z=16&l=map`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shop-view__link"
                      >
                        <ExternalLink size={13} />
                        Открыть на карте
                      </a>
                      <button
                        className="shop-view__map-btn"
                        onClick={() => setShowMapPicker(true)}
                        disabled={savingGeo}
                      >
                        <MapPin size={13} />
                        {savingGeo ? 'Сохранение...' : 'Изменить'}
                      </button>
                    </span>
                  ) : (
                    <span className="shop-view__geo-info">
                      <span style={{ color: 'var(--text-tertiary)' }}>Не указана</span>
                      <button
                        className="shop-view__map-btn shop-view__map-btn--primary"
                        onClick={() => setShowMapPicker(true)}
                        disabled={savingGeo}
                      >
                        <MapPin size={13} />
                        {savingGeo ? 'Сохранение...' : 'Указать на карте'}
                      </button>
                    </span>
                  )}
                </span>
              </div>

              {/* Metro (only if city has metro) */}
              {me.has_metro && (
                <div className="shop-view__item shop-view__item--wide">
                  <span className="shop-view__label">Метро</span>
                  <span className="shop-view__value">
                    {me.metro_name ? (
                      <>
                        {me.metro_line_color && (
                          <span
                            style={{
                              display: 'inline-block',
                              width: 10,
                              height: 10,
                              borderRadius: '50%',
                              background: me.metro_line_color,
                              marginRight: 6,
                              verticalAlign: 'middle',
                            }}
                          />
                        )}
                        {me.metro_name}
                        {me.metro_walk_minutes ? ` (${me.metro_walk_minutes} мин пешком)` : ''}
                      </>
                    ) : (
                      <span style={{ color: 'var(--text-tertiary)' }}>Не указано</span>
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Section 2: Banner ─────────────────────── */}
      <div className="shop-card">
        <div className="shop-card__header">
          <div className="shop-card__header-left">
            <div className="shop-card__icon-badge shop-card__icon-badge--teal">
              <Image size={18} />
            </div>
            <div>
              <h3 className="shop-card__title">Баннер магазина</h3>
              <p className="shop-card__subtitle">Рекомендуемый размер: 1200 x 400 px (3:1)</p>
            </div>
          </div>
        </div>

        {me.banner_url ? (
          <div className="shop-banner">
            <div className="shop-banner__preview">
              <img src={getBannerImageUrl(me.banner_url) ?? ''} alt="Баннер магазина" />
            </div>
            <div className="shop-banner__actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={bannerUploading}
                onClick={() => bannerFileInputRef.current?.click()}
              >
                <Upload size={14} />
                {bannerUploading ? 'Загрузка...' : 'Заменить'}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm shop-banner__remove-btn"
                disabled={bannerRemoving}
                onClick={handleRemoveBanner}
              >
                <Trash2 size={14} />
                {bannerRemoving ? 'Удаление...' : 'Удалить'}
              </button>
            </div>
          </div>
        ) : (
          <div
            className="shop-banner__dropzone"
            onClick={() => bannerFileInputRef.current?.click()}
          >
            <Upload size={24} className="shop-banner__dropzone-icon" />
            <span className="shop-banner__dropzone-text">
              {bannerUploading ? 'Загрузка...' : 'Нажмите, чтобы загрузить баннер'}
            </span>
            <span className="shop-banner__dropzone-hint">JPG, PNG, WebP или GIF</span>
          </div>
        )}
        <input
          ref={bannerFileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleBannerUpload}
          className="shop-banner__file-input"
        />
      </div>

      {/* ── Section 3: Shop link ──────────────────── */}
      <div className="shop-card">
        <div className="shop-card__header">
          <div className="shop-card__header-left">
            <div className="shop-card__icon-badge shop-card__icon-badge--amber">
              <LinkIcon size={18} />
            </div>
            <div>
              <h3 className="shop-card__title">Ссылка на магазин</h3>
              <p className="shop-card__subtitle">Отправьте клиентам — они сразу попадут в каталог</p>
            </div>
          </div>
        </div>

        {me.shop_link ? (
          <div className="shop-link">
            <code className="shop-link__url">{me.shop_link}</code>
            <button
              className="shop-link__copy-btn"
              onClick={() => {
                navigator.clipboard.writeText(me.shop_link!);
                toast.success('Ссылка скопирована');
              }}
            >
              <Copy size={14} />
              Копировать
            </button>
          </div>
        ) : (
          <p className="shop-card__muted">Ссылка генерируется автоматически. Обратитесь к администратору.</p>
        )}
      </div>

      {/* ── Section 4: Gift note toggle ────────────── */}
      <div className="shop-card">
        <div className="shop-card__header">
          <div className="shop-card__header-left">
            <div className="shop-card__icon-badge shop-card__icon-badge--pink">
              <MessageSquare size={18} />
            </div>
            <div>
              <h3 className="shop-card__title">Записка к цветам</h3>
              <p className="shop-card__subtitle">Покупатели смогут приложить записку к букету</p>
            </div>
          </div>
        </div>
        <div style={{ padding: '0 20px 20px' }}>
          <Toggle
            checked={me.gift_note_enabled ?? false}
            onChange={async (checked) => {
              try {
                await updateMe({ gift_note_enabled: checked });
                await reload();
                toast.success(checked ? 'Записки включены' : 'Записки отключены');
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Ошибка');
              }
            }}
            label="Разрешить записки к заказам"
          />
        </div>
      </div>

      {/* ── Map Picker Modal ──────────────────────── */}
      {showMapPicker && (
        <LocationPicker
          initialCenter={
            hasGeo
              ? [me.geo_lon!, me.geo_lat!]
              : undefined
          }
          onConfirm={handleMapConfirm}
          onClose={() => setShowMapPicker(false)}
        />
      )}
    </div>
  );
}
