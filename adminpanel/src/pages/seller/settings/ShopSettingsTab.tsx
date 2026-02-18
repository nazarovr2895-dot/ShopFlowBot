import { useRef, useState } from 'react';
import { updateMe, getBannerImageUrl, uploadBannerPhoto } from '../../../api/sellerClient';
import { DataRow, FormField, useToast } from '../../../components/ui';
import { useEditMode } from '../../../hooks/useEditMode';
import { Store, Image, Link as LinkIcon, Pencil } from 'lucide-react';
import type { SettingsTabProps } from './types';
import './ShopSettingsTab.css';

const DELIVERY_LABELS: Record<string, string> = {
  'доставка': 'Только доставка',
  'самовывоз': 'Только самовывоз',
  'доставка и самовывоз': 'Доставка и самовывоз',
};

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
      {/* Section 1: Shop info (view/edit) */}
      <div className="card settings-shop-section">
        <div className="settings-shop-header">
          <div className="settings-shop-header-left">
            <Store size={20} className="settings-shop-icon" />
            <h3>Основные настройки магазина</h3>
          </div>
          {!shopEdit.isEditing && (
            <button className="btn btn-ghost btn-sm" onClick={shopEdit.startEditing}>
              <Pencil size={14} />
              Изменить
            </button>
          )}
        </div>

        {shopEdit.isEditing ? (
          <div className="settings-shop-form">
            <FormField label="Название магазина">
              <input
                type="text"
                value={shopEdit.draft.shopName}
                onChange={(e) => shopEdit.updateField('shopName', e.target.value)}
                placeholder="Например: Цветочный рай"
                className="form-input"
              />
            </FormField>
            <FormField label="Описание">
              <textarea
                value={shopEdit.draft.description}
                onChange={(e) => shopEdit.updateField('description', e.target.value)}
                placeholder="Краткое описание вашего магазина"
                className="form-input"
                rows={3}
              />
            </FormField>
            <FormField label="Тип доставки">
              <select
                value={shopEdit.draft.deliveryType}
                onChange={(e) => shopEdit.updateField('deliveryType', e.target.value)}
                className="form-input"
              >
                <option value="">Не указано</option>
                <option value="доставка">Только доставка</option>
                <option value="самовывоз">Только самовывоз</option>
                <option value="доставка и самовывоз">Доставка и самовывоз</option>
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
                className="form-input settings-shop-input-price"
              />
            </FormField>
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
                placeholder="https://maps.google.com/..."
                className="form-input"
              />
            </FormField>
            <div className="settings-shop-actions">
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
          <div className="settings-shop-view">
            <DataRow label="Название" value={me.shop_name || '—'} />
            <DataRow label="Описание" value={me.description || '—'} />
            <DataRow label="Тип доставки" value={DELIVERY_LABELS[me.delivery_type || ''] || me.delivery_type || '—'} />
            <DataRow label="Цена доставки" value={me.delivery_price != null ? `${me.delivery_price} ₽` : '—'} />
            <DataRow label="Адрес" value={me.address_name || '—'} />
            <DataRow
              label="Карта"
              value={me.map_url ? (
                <a href={me.map_url} target="_blank" rel="noopener noreferrer" className="settings-shop-link">
                  Открыть на карте
                </a>
              ) : '—'}
            />
          </div>
        )}
      </div>

      {/* Section 2: Banner */}
      <div className="card settings-shop-section">
        <div className="settings-shop-header">
          <div className="settings-shop-header-left">
            <Image size={20} className="settings-shop-icon" />
            <h3>Баннер магазина</h3>
          </div>
        </div>
        <p className="settings-shop-hint">
          Баннер отображается в каталоге вашего магазина. Рекомендуемый размер: 1200×400 px (3:1).
        </p>
        {me.banner_url && (
          <div className="settings-shop-banner-preview">
            <img src={getBannerImageUrl(me.banner_url) ?? ''} alt="Баннер магазина" />
          </div>
        )}
        <div className="settings-shop-banner-actions">
          <input
            ref={bannerFileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleBannerUpload}
            className="settings-shop-file-input"
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={bannerUploading}
            onClick={() => bannerFileInputRef.current?.click()}
          >
            {bannerUploading ? 'Загрузка...' : me.banner_url ? 'Заменить баннер' : 'Загрузить баннер'}
          </button>
          {me.banner_url && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={bannerRemoving}
              onClick={handleRemoveBanner}
            >
              {bannerRemoving ? 'Удаление...' : 'Удалить баннер'}
            </button>
          )}
        </div>
      </div>

      {/* Section 3: Shop link */}
      <div className="card settings-shop-section">
        <div className="settings-shop-header">
          <div className="settings-shop-header-left">
            <LinkIcon size={20} className="settings-shop-icon" />
            <h3>Ссылка на магазин</h3>
          </div>
        </div>
        <p className="settings-shop-hint">Отправьте эту ссылку клиентам — они сразу попадут в каталог вашего магазина.</p>
        {me.shop_link ? (
          <div className="settings-shop-link-box">
            <code>{me.shop_link}</code>
            <button
              className="btn btn-sm btn-secondary"
              onClick={() => {
                navigator.clipboard.writeText(me.shop_link!);
                toast.success('Ссылка скопирована');
              }}
            >
              Копировать
            </button>
          </div>
        ) : (
          <p className="settings-shop-muted">Ссылка генерируется автоматически. Обратитесь к администратору.</p>
        )}
      </div>
    </div>
  );
}
