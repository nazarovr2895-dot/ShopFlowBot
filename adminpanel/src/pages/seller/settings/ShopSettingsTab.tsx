import { useRef, useState } from 'react';
import { updateMe, getBannerImageUrl, uploadBannerPhoto } from '../../../api/sellerClient';
import { FormField, useToast } from '../../../components/ui';
import { useEditMode } from '../../../hooks/useEditMode';
import { Store, Image, Link as LinkIcon, Pencil, MapPin, Truck, Copy, ExternalLink, Upload, Trash2 } from 'lucide-react';
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
    deliveryPrice: String(me.delivery_price ?? ''),
    addressName: me.address_name || '',
    mapUrl: me.map_url || '',
  });

  const [bannerUploading, setBannerUploading] = useState(false);
  const [bannerRemoving, setBannerRemoving] = useState(false);
  const bannerFileInputRef = useRef<HTMLInputElement>(null);

  const handleSaveShopSettings = async () => {
    shopEdit.setSaving(true);
    try {
      await updateMe({
        shop_name: shopEdit.draft.shopName.trim() || undefined,
        description: shopEdit.draft.description.trim() || undefined,
        delivery_type: shopEdit.draft.deliveryType.trim() || undefined,
        delivery_price: shopEdit.draft.deliveryPrice ? parseFloat(shopEdit.draft.deliveryPrice) : undefined,
        address_name: shopEdit.draft.addressName.trim() || undefined,
        map_url: shopEdit.draft.mapUrl.trim() || undefined,
      });
      await reload();
      shopEdit.setIsEditing(false);
      toast.success('Настройки сохранены');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      shopEdit.setSaving(false);
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
              <FormField label="Цена доставки (₽)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={shopEdit.draft.deliveryPrice}
                  onChange={(e) => shopEdit.updateField('deliveryPrice', e.target.value)}
                  placeholder="0"
                  className="form-input"
                />
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 4, display: 'block' }}>
                  Используется если зоны доставки не настроены
                </span>
              </FormField>
            </div>

            {/* Row 4: Address — 2 columns */}
            <div className="shop-form__row-2col">
              <FormField label="Название адреса">
                <input
                  type="text"
                  value={shopEdit.draft.addressName}
                  onChange={(e) => shopEdit.updateField('addressName', e.target.value)}
                  placeholder="Например: ул. Тверская, д. 1"
                  className="form-input"
                />
              </FormField>
              <FormField label="Ссылка на карту">
                <input
                  type="text"
                  value={shopEdit.draft.mapUrl}
                  onChange={(e) => shopEdit.updateField('mapUrl', e.target.value)}
                  placeholder="https://yandex.ru/maps/..."
                  className="form-input"
                />
              </FormField>
            </div>

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
                <span className="shop-view__value">
                  {me.delivery_price != null ? (
                    <span className="shop-view__price">{me.delivery_price} ₽</span>
                  ) : '—'}
                </span>
              </div>

              {/* Address — 2 columns */}
              <div className="shop-view__item">
                <div className="shop-view__label-row">
                  <MapPin size={14} className="shop-view__label-icon" />
                  <span className="shop-view__label">Адрес</span>
                </div>
                <span className="shop-view__value">{me.address_name || '—'}</span>
              </div>
              <div className="shop-view__item">
                <span className="shop-view__label">Карта</span>
                <span className="shop-view__value">
                  {me.map_url ? (
                    <a href={me.map_url} target="_blank" rel="noopener noreferrer" className="shop-view__link">
                      <ExternalLink size={13} />
                      Открыть на карте
                    </a>
                  ) : '—'}
                </span>
              </div>
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
    </div>
  );
}
