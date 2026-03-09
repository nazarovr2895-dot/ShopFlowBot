import { useEffect, useState } from 'react';
import { updateMe, searchMetro } from '../../../api/sellerClient';
import { useToast } from '@shared/components/ui';
import { useEditMode } from '@shared/hooks/useEditMode';
import { LocationPicker } from '../../../components/LocationPicker';
import { MetroSearchField } from '@shared/components/MetroSearchField';
import { Toggle } from '@shared/components/ui';
import {
  Store, Link as LinkIcon, Pencil, MapPin, Truck, Copy,
  ExternalLink, MessageSquare, Phone, AtSign, Eye, EyeOff,
  Check, X,
} from 'lucide-react';
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
    contactPhone: me.contact_phone || '',
    contactUsername: me.contact_username || '',
  });

  const [showMapPicker, setShowMapPicker] = useState(false);
  const [savingGeo, setSavingGeo] = useState(false);
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
        contact_phone: shopEdit.draft.contactPhone.trim(),
        contact_username: shopEdit.draft.contactUsername.trim(),
      };
      if (me.has_metro) {
        payload.metro_id = metroId ?? 0;
        payload.metro_walk_minutes = metroWalkMinutes ?? 0;
      }
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

  const hasGeo = me.geo_lat != null && me.geo_lon != null;
  const isVisible = me.is_visible ?? true;

  return (
    <div className="settings-shop">

      {/* ═══ Visibility ═══════════════════════════ */}
      <section className="shop-section">
        <div className="shop-section__header">
          <div className="shop-section__header-left">
            <div className={`shop-section__icon ${isVisible ? 'shop-section__icon--emerald' : ''}`}>
              {isVisible ? <Eye size={20} /> : <EyeOff size={20} />}
            </div>
            <div className="shop-section__titles">
              <h3 className="shop-section__title">Видимость магазина</h3>
              <p className="shop-section__subtitle">Управляйте отображением в каталоге</p>
            </div>
          </div>
          <span className={`shop-status-pill ${isVisible ? 'shop-status-pill--active' : 'shop-status-pill--hidden'}`}>
            <span className="shop-status-pill__dot" />
            {isVisible ? 'Активен' : 'Скрыт'}
          </span>
        </div>
        <div className="shop-section__body">
          <div className="shop-toggle-row">
            <span className="shop-toggle-row__label">Показывать магазин в каталоге</span>
            <Toggle
              checked={isVisible}
              onChange={async (checked) => {
                try {
                  await updateMe({ is_visible: checked });
                  await reload();
                  toast.success(checked ? 'Магазин виден в каталоге' : 'Магазин скрыт из каталога');
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : 'Ошибка');
                }
              }}
            />
          </div>
        </div>
      </section>

      {/* ═══ Main Settings ════════════════════════ */}
      <section className="shop-section">
        <div className="shop-section__header">
          <div className="shop-section__header-left">
            <div className="shop-section__icon shop-section__icon--accent">
              <Store size={20} />
            </div>
            <div className="shop-section__titles">
              <h3 className="shop-section__title">Основные настройки</h3>
              <p className="shop-section__subtitle">Информация о вашем магазине</p>
            </div>
          </div>
          {!shopEdit.isEditing && (
            <button className="shop-edit-btn" onClick={shopEdit.startEditing}>
              <Pencil size={14} />
              Изменить
            </button>
          )}
        </div>

        {shopEdit.isEditing ? (
          /* ── Edit Mode ──────────────────────── */
          <div className="shop-form">
            {/* Name (wide) */}
            <div className="shop-form__group">
              <label className="shop-form__label">Название магазина</label>
              <input
                type="text"
                className="shop-form__input"
                value={shopEdit.draft.shopName}
                onChange={(e) => shopEdit.updateField('shopName', e.target.value)}
                placeholder="Например: Цветочный рай"
              />
            </div>

            {/* Description (wide) */}
            <div className="shop-form__group">
              <label className="shop-form__label">Описание</label>
              <textarea
                className="shop-form__input shop-form__input--textarea"
                value={shopEdit.draft.description}
                onChange={(e) => shopEdit.updateField('description', e.target.value)}
                placeholder="Краткое описание вашего магазина"
                rows={3}
              />
            </div>

            {/* Delivery + Price */}
            <div className="shop-form__grid">
              <div className="shop-form__group">
                <label className="shop-form__label">Тип доставки</label>
                <select
                  className="shop-form__input shop-form__select"
                  value={shopEdit.draft.deliveryType}
                  onChange={(e) => shopEdit.updateField('deliveryType', e.target.value)}
                >
                  {DELIVERY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="shop-form__group">
                <label className="shop-form__label">Цена доставки</label>
                <span className="shop-form__hint">Настраивается в зонах доставки</span>
              </div>
            </div>

            {/* Address + Map */}
            <div className="shop-form__grid">
              <div className="shop-form__group">
                <label className="shop-form__label">Адрес магазина</label>
                <input
                  type="text"
                  className="shop-form__input"
                  value={shopEdit.draft.addressName}
                  onChange={(e) => shopEdit.updateField('addressName', e.target.value)}
                  placeholder="Например: ул. Тверская, д. 1"
                />
              </div>
              <div className="shop-form__group">
                <label className="shop-form__label">Точка на карте</label>
                <button
                  type="button"
                  className="shop-form__map-trigger"
                  onClick={() => setShowMapPicker(true)}
                  disabled={savingGeo}
                >
                  <MapPin size={16} />
                  {hasGeo
                    ? (savingGeo ? 'Сохранение...' : 'Изменить точку на карте')
                    : (savingGeo ? 'Сохранение...' : 'Указать на карте')
                  }
                </button>
                {hasGeo && (
                  <span className="shop-form__geo-coords">
                    {me.geo_lat!.toFixed(5)}, {me.geo_lon!.toFixed(5)}
                  </span>
                )}
              </div>
            </div>

            {/* Metro */}
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

            {/* Contact phone + Telegram */}
            <div className="shop-form__grid">
              <div className="shop-form__group">
                <label className="shop-form__label">Рабочий телефон</label>
                <input
                  type="tel"
                  className="shop-form__input"
                  value={shopEdit.draft.contactPhone}
                  onChange={(e) => shopEdit.updateField('contactPhone', e.target.value)}
                  placeholder="+7 (999) 123-45-67"
                />
              </div>
              <div className="shop-form__group">
                <label className="shop-form__label">Telegram для связи</label>
                <input
                  type="text"
                  className="shop-form__input"
                  value={shopEdit.draft.contactUsername}
                  onChange={(e) => shopEdit.updateField('contactUsername', e.target.value)}
                  placeholder="@username"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="shop-form__footer">
              <button
                className="shop-btn shop-btn--primary"
                onClick={handleSaveShopSettings}
                disabled={shopEdit.saving}
              >
                <Check size={16} />
                {shopEdit.saving ? 'Сохранение...' : 'Сохранить'}
              </button>
              <button className="shop-btn shop-btn--ghost" onClick={shopEdit.cancelEditing}>
                <X size={16} />
                Отмена
              </button>
            </div>
          </div>
        ) : (
          /* ── View Mode ──────────────────────── */
          <div className="shop-data">
            {/* Name */}
            <div className="shop-data__cell shop-data__cell--wide">
              <span className="shop-data__label">Название</span>
              <span className={`shop-data__value ${me.shop_name ? 'shop-data__value--bold' : 'shop-data__value--empty'}`}>
                {me.shop_name || 'Не указано'}
              </span>
            </div>

            {/* Description */}
            <div className="shop-data__cell shop-data__cell--wide">
              <span className="shop-data__label">Описание</span>
              <span className={`shop-data__value ${!me.description ? 'shop-data__value--empty' : ''}`}>
                {me.description || 'Не указано'}
              </span>
            </div>

            {/* Delivery */}
            <div className="shop-data__cell">
              <span className="shop-data__label">
                <Truck size={13} className="shop-data__label-icon" />
                Доставка
              </span>
              <span className={`shop-data__value ${!me.delivery_type ? 'shop-data__value--empty' : ''}`}>
                {DELIVERY_LABELS[me.delivery_type || ''] || me.delivery_type || 'Не указано'}
              </span>
            </div>

            {/* Delivery price */}
            <div className="shop-data__cell">
              <span className="shop-data__label">Цена доставки</span>
              <span className="shop-data__value shop-data__value--empty">
                Настраивается в зонах доставки
              </span>
            </div>

            {/* Address */}
            <div className="shop-data__cell">
              <span className="shop-data__label">
                <MapPin size={13} className="shop-data__label-icon" />
                Адрес
              </span>
              <span className={`shop-data__value ${!me.address_name ? 'shop-data__value--empty' : ''}`}>
                {me.address_name || 'Не указан'}
              </span>
            </div>

            {/* Map point */}
            <div className="shop-data__cell">
              <span className="shop-data__label">Точка на карте</span>
              <div className="shop-data__actions">
                {hasGeo ? (
                  <>
                    <a
                      href={`https://yandex.ru/maps/?pt=${me.geo_lon},${me.geo_lat}&z=16&l=map`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shop-action-link"
                    >
                      <ExternalLink size={13} />
                      Открыть на карте
                    </a>
                    <button
                      className="shop-action-link"
                      onClick={() => setShowMapPicker(true)}
                      disabled={savingGeo}
                    >
                      <MapPin size={13} />
                      {savingGeo ? 'Сохранение...' : 'Изменить'}
                    </button>
                  </>
                ) : (
                  <button
                    className="shop-action-link shop-action-link--primary"
                    onClick={() => setShowMapPicker(true)}
                    disabled={savingGeo}
                  >
                    <MapPin size={13} />
                    {savingGeo ? 'Сохранение...' : 'Указать на карте'}
                  </button>
                )}
              </div>
            </div>

            {/* Metro */}
            {me.has_metro && (
              <div className="shop-data__cell shop-data__cell--wide">
                <span className="shop-data__label">Метро</span>
                <span className={`shop-data__value ${!me.metro_name ? 'shop-data__value--empty' : ''}`}>
                  {me.metro_name ? (
                    <>
                      {me.metro_line_color && (
                        <span className="shop-metro-dot" style={{ background: me.metro_line_color }} />
                      )}
                      {me.metro_name}
                      {me.metro_walk_minutes ? ` (${me.metro_walk_minutes} мин пешком)` : ''}
                    </>
                  ) : (
                    'Не указано'
                  )}
                </span>
              </div>
            )}

            {/* Phone */}
            <div className="shop-data__cell">
              <span className="shop-data__label">
                <Phone size={13} className="shop-data__label-icon" />
                Телефон
              </span>
              <span className={`shop-data__value ${!me.contact_phone ? 'shop-data__value--empty' : ''}`}>
                {me.contact_phone || 'Не указан'}
              </span>
            </div>

            {/* Telegram */}
            <div className="shop-data__cell">
              <span className="shop-data__label">
                <AtSign size={13} className="shop-data__label-icon" />
                Telegram для связи
              </span>
              <span className={`shop-data__value ${!me.contact_username ? 'shop-data__value--empty' : ''}`}>
                {me.contact_username ? `@${me.contact_username}` : 'Не указан'}
              </span>
            </div>
          </div>
        )}
      </section>

      {/* ═══ Shop Links ═══════════════════════════ */}
      <section className="shop-section">
        <div className="shop-section__header">
          <div className="shop-section__header-left">
            <div className="shop-section__icon shop-section__icon--amber">
              <LinkIcon size={20} />
            </div>
            <div className="shop-section__titles">
              <h3 className="shop-section__title">Ссылки на магазин</h3>
              <p className="shop-section__subtitle">Отправьте клиентам — они сразу попадут в каталог</p>
            </div>
          </div>
        </div>
        <div className="shop-section__body">
          {me.shop_link ? (
            <div className="shop-links">
              <div className="shop-link-row">
                <span className="shop-link-row__badge shop-link-row__badge--tg">TG</span>
                <code className="shop-link-row__url">{me.shop_link}</code>
                <button
                  className="shop-link-row__copy"
                  onClick={() => {
                    navigator.clipboard.writeText(me.shop_link!);
                    toast.success('Ссылка скопирована');
                  }}
                >
                  <Copy size={13} />
                  Копировать
                </button>
              </div>
              {me.shop_link_web && (
                <div className="shop-link-row">
                  <span className="shop-link-row__badge shop-link-row__badge--web">WEB</span>
                  <code className="shop-link-row__url">{me.shop_link_web}</code>
                  <button
                    className="shop-link-row__copy"
                    onClick={() => {
                      navigator.clipboard.writeText(me.shop_link_web!);
                      toast.success('Ссылка скопирована');
                    }}
                  >
                    <Copy size={13} />
                    Копировать
                  </button>
                </div>
              )}
            </div>
          ) : (
            <p className="shop-links__empty">
              Ссылка генерируется автоматически. Обратитесь к администратору.
            </p>
          )}
        </div>
      </section>

      {/* ═══ Gift Note ════════════════════════════ */}
      <section className="shop-section">
        <div className="shop-section__header">
          <div className="shop-section__header-left">
            <div className="shop-section__icon shop-section__icon--rose">
              <MessageSquare size={20} />
            </div>
            <div className="shop-section__titles">
              <h3 className="shop-section__title">Записка к цветам</h3>
              <p className="shop-section__subtitle">Покупатели смогут приложить записку к букету</p>
            </div>
          </div>
        </div>
        <div className="shop-section__body">
          <div className="shop-toggle-row">
            <span className="shop-toggle-row__label">Разрешить записки к заказам</span>
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
            />
          </div>
        </div>
      </section>

      {/* ═══ Map Picker Modal ═════════════════════ */}
      {showMapPicker && (
        <LocationPicker
          initialCenter={hasGeo ? [me.geo_lon!, me.geo_lat!] : undefined}
          onConfirm={handleMapConfirm}
          onClose={() => setShowMapPicker(false)}
        />
      )}
    </div>
  );
}
