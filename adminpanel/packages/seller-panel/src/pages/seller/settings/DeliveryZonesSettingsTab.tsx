import { useState, useEffect, useCallback } from 'react';
import {
  getDeliveryZones,
  createDeliveryZone,
  updateDeliveryZone,
  deleteDeliveryZone,
  getPublicDistricts,
  updateMe,
} from '../../../api/sellerClient';
import type { DeliveryZone, CreateDeliveryZoneData } from '../../../api/sellerClient';
import { FormField, useToast } from '@shared/components/ui';
import { MapPin, Plus, Pencil, Trash2, Clock, Info } from 'lucide-react';
import type { SettingsTabProps } from './types';
import './DeliveryZonesSettingsTab.css';

interface DistrictOption {
  id: number;
  name: string;
  city_id: number;
}

const EMPTY_FORM: CreateDeliveryZoneData = {
  name: '',
  district_ids: [],
  delivery_price: 0,
  min_order_amount: null,
  free_delivery_from: null,
  is_active: true,
  priority: 0,
};

const LEAD_OPTIONS = [
  { value: 60, label: '1 час' },
  { value: 120, label: '2 часа' },
  { value: 180, label: '3 часа' },
  { value: 240, label: '4 часа' },
];

const DURATION_OPTIONS = [
  { value: 60, label: '1 час' },
  { value: 90, label: '1.5 часа' },
  { value: 120, label: '2 часа' },
  { value: 180, label: '3 часа' },
];

export function DeliveryZonesSettingsTab({ me, reload }: SettingsTabProps) {
  const toast = useToast();
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [districts, setDistricts] = useState<DistrictOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingZoneId, setEditingZoneId] = useState<number | null>(null);
  const [form, setForm] = useState<CreateDeliveryZoneData>({ ...EMPTY_FORM });

  // Delivery slots state
  const [slotsEnabled, setSlotsEnabled] = useState(me.deliveries_per_slot != null && me.deliveries_per_slot > 0);
  const [deliveriesPerSlot, setDeliveriesPerSlot] = useState(me.deliveries_per_slot ?? 1);
  const [slotDaysAhead, setSlotDaysAhead] = useState(me.slot_days_ahead ?? 3);
  const [minSlotLead, setMinSlotLead] = useState(me.min_slot_lead_minutes ?? 120);
  const [slotDuration, setSlotDuration] = useState(me.slot_duration_minutes ?? 120);
  const [savingSlots, setSavingSlots] = useState(false);

  const saveSlotSettings = async () => {
    setSavingSlots(true);
    try {
      await updateMe({
        deliveries_per_slot: slotsEnabled ? Math.max(1, deliveriesPerSlot) : 0,
        slot_days_ahead: slotDaysAhead,
        min_slot_lead_minutes: minSlotLead,
        slot_duration_minutes: slotDuration,
      });
      toast.success('Настройки слотов сохранены');
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSavingSlots(false);
    }
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [zonesData, districtsData] = await Promise.all([
        getDeliveryZones(),
        me.city_id ? getPublicDistricts(me.city_id) : Promise.resolve([]),
      ]);
      setZones(zonesData);
      setDistricts(districtsData);
    } catch {
      toast.error('Ошибка загрузки зон доставки');
    } finally {
      setLoading(false);
    }
  }, [me.city_id]);

  useEffect(() => { loadData(); }, [loadData]);

  const openCreateForm = () => {
    setForm({ ...EMPTY_FORM });
    setEditingZoneId(null);
    setShowForm(true);
  };

  const openEditForm = (zone: DeliveryZone) => {
    setForm({
      name: zone.name,
      district_ids: zone.district_ids || [],
      delivery_price: zone.delivery_price,
      min_order_amount: zone.min_order_amount ?? null,
      free_delivery_from: zone.free_delivery_from ?? null,
      is_active: zone.is_active,
      priority: zone.priority,
    });
    setEditingZoneId(zone.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Укажите название зоны');
      return;
    }
    if (form.district_ids.length === 0) {
      toast.error('Выберите хотя бы один район');
      return;
    }
    setSaving(true);
    try {
      if (editingZoneId) {
        await updateDeliveryZone(editingZoneId, form);
        toast.success('Зона обновлена');
      } else {
        await createDeliveryZone(form);
        toast.success('Зона создана');
      }
      setShowForm(false);
      setEditingZoneId(null);
      await loadData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (zoneId: number) => {
    if (!confirm('Удалить зону доставки?')) return;
    try {
      await deleteDeliveryZone(zoneId);
      toast.success('Зона удалена');
      await loadData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  const toggleDistrict = (districtId: number) => {
    setForm(prev => ({
      ...prev,
      district_ids: prev.district_ids.includes(districtId)
        ? prev.district_ids.filter(id => id !== districtId)
        : [...prev.district_ids, districtId],
    }));
  };

  const selectAllDistricts = () => {
    setForm(prev => ({ ...prev, district_ids: districts.map(d => d.id) }));
  };

  const clearAllDistricts = () => {
    setForm(prev => ({ ...prev, district_ids: [] }));
  };

  const districtName = (id: number) => districts.find(d => d.id === id)?.name ?? `#${id}`;

  if (loading) {
    return (
      <div className="shop-card">
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
          <div className="loader" />
        </div>
      </div>
    );
  }

  return (
    <div className="settings-shop">
      {/* Delivery Slots Section */}
      <div className="shop-card">
        <div className="shop-card__header">
          <div className="shop-card__header-left">
            <div className="shop-card__icon-badge" style={{ background: 'rgba(168,85,247,0.1)', color: '#a855f7' }}>
              <Clock size={18} />
            </div>
            <div>
              <h3 className="shop-card__title">Слоты доставки</h3>
              <p className="shop-card__subtitle">Покупатель выбирает временной интервал доставки</p>
            </div>
          </div>
        </div>

        <div style={{ padding: '0 var(--space-4) var(--space-4)' }}>
          <label className="dz-form__district-checkbox" style={{ marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={slotsEnabled}
              onChange={e => setSlotsEnabled(e.target.checked)}
            />
            <span>Включить выбор времени доставки</span>
          </label>

          {slotsEnabled && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <FormField label={<span className="dz-slot-label">Интервал слота <span className="dz-slot-hint"><Info size={14} /><span className="dz-slot-hint__text">Длительность одного слота доставки. Например, 1 час — слоты 10:00–11:00, 11:00–12:00; 2 часа — слоты 10:00–12:00, 12:00–14:00.</span></span></span>}>
                <select
                  className="form-input"
                  value={slotDuration}
                  onChange={e => setSlotDuration(parseInt(e.target.value))}
                >
                  {DURATION_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </FormField>

              <FormField label={<span className="dz-slot-label">Доставок за слот <span className="dz-slot-hint"><Info size={14} /><span className="dz-slot-hint__text">Сколько заказов вы можете доставить за один интервал. Например, 1 — один заказ на слот 10:00–12:00, 3 — три покупателя смогут выбрать одно время.</span></span></span>}>
                <input
                  type="number"
                  className="form-input"
                  min={1}
                  max={10}
                  value={deliveriesPerSlot}
                  onChange={e => setDeliveriesPerSlot(parseInt(e.target.value) || 1)}
                />
              </FormField>

              <FormField label={<span className="dz-slot-label">Дней вперёд <span className="dz-slot-hint"><Info size={14} /><span className="dz-slot-hint__text">На сколько дней вперёд покупатель увидит доступные слоты. Например, 2 — сегодня и завтра, 7 — на неделю вперёд.</span></span></span>}>
                <input
                  type="number"
                  className="form-input"
                  min={1}
                  max={7}
                  value={slotDaysAhead}
                  onChange={e => setSlotDaysAhead(parseInt(e.target.value) || 3)}
                />
              </FormField>

              <FormField label={<span className="dz-slot-label">Минимум заранее <span className="dz-slot-hint"><Info size={14} /><span className="dz-slot-hint__text">За сколько часов до начала слота можно его забронировать. Если сейчас 14:00 и минимум 2 часа — ближайший доступный слот начнётся не раньше 16:00.</span></span></span>}>
                <select
                  className="form-input"
                  value={minSlotLead}
                  onChange={e => setMinSlotLead(parseInt(e.target.value))}
                >
                  {LEAD_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </FormField>
            </div>
          )}

          <button
            className="btn btn-primary btn-sm"
            style={{ marginTop: 'var(--space-3)' }}
            onClick={saveSlotSettings}
            disabled={savingSlots}
          >
            {savingSlots ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>

      {/* Delivery Zones Section */}
      <div className="shop-card">
        <div className="shop-card__header">
          <div className="shop-card__header-left">
            <div className="shop-card__icon-badge" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>
              <MapPin size={18} />
            </div>
            <div>
              <h3 className="shop-card__title">Зоны доставки</h3>
              <p className="shop-card__subtitle">Настройте районы и цены доставки</p>
            </div>
          </div>
        </div>

        {zones.length === 0 && !showForm && (
          <div className="dz-empty">
            Зон доставки пока нет. Без настроенных зон доставка будет недоступна — только самовывоз.
          </div>
        )}

        {/* Zone list */}
        {zones.length > 0 && (
          <div className="dz-zones-list">
            {zones.map(zone => (
              <div key={zone.id} className={`dz-zone-card ${!zone.is_active ? 'dz-zone-card--inactive' : ''}`}>
                <div className="dz-zone-card__header">
                  <span className="dz-zone-card__name">
                    {zone.name}
                    {!zone.is_active && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> (неактивна)</span>}
                  </span>
                  <span className="dz-zone-card__price">
                    {zone.delivery_price > 0 ? `${zone.delivery_price} ₽` : 'Бесплатно'}
                  </span>
                </div>
                <div className="dz-zone-card__districts">
                  {(zone.district_ids || []).map(id => (
                    <span key={id} className="dz-zone-card__district-tag">{districtName(id)}</span>
                  ))}
                </div>
                <div className="dz-zone-card__meta">
                  {zone.min_order_amount != null && <span>Мин. заказ: {zone.min_order_amount} ₽</span>}
                  {zone.free_delivery_from != null && <span>Бесплатно от: {zone.free_delivery_from} ₽</span>}
                </div>
                <div className="dz-zone-card__actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => openEditForm(zone)}>
                    <Pencil size={14} /> Изменить
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(zone.id)} style={{ color: '#ef4444' }}>
                    <Trash2 size={14} /> Удалить
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add button */}
        {!showForm && (
          <button className="btn btn-primary btn-sm" style={{ marginTop: 'var(--space-4)' }} onClick={openCreateForm}>
            <Plus size={14} /> Добавить зону
          </button>
        )}

        {/* Form */}
        {showForm && (
          <div className="dz-form">
            <div className="dz-form__row">
              <FormField label="Название зоны">
                <input
                  type="text"
                  className="form-input"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Например: Центр Москвы"
                />
              </FormField>
            </div>

            <div className="dz-form__row-2col">
              <FormField label="Цена доставки (₽)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="form-input"
                  value={form.delivery_price}
                  onChange={e => setForm(f => ({ ...f, delivery_price: parseFloat(e.target.value) || 0 }))}
                />
              </FormField>
              <FormField label="Бесплатно от суммы (₽)">
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="form-input"
                  value={form.free_delivery_from ?? ''}
                  onChange={e => setForm(f => ({ ...f, free_delivery_from: e.target.value ? parseFloat(e.target.value) : null }))}
                  placeholder="Не ограничено"
                />
              </FormField>
            </div>

            <div className="dz-form__row">
              <FormField label="Районы">
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={selectAllDistricts}>Выбрать все</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={clearAllDistricts}>Снять все</button>
                </div>
                {districts.length > 0 ? (
                  <div className="dz-form__districts-grid">
                    {districts.map(d => (
                      <label key={d.id} className="dz-form__district-checkbox">
                        <input
                          type="checkbox"
                          checked={form.district_ids.includes(d.id)}
                          onChange={() => toggleDistrict(d.id)}
                        />
                        {d.name}
                      </label>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
                    Укажите город в настройках магазина, чтобы увидеть районы
                  </p>
                )}
              </FormField>
            </div>

            <div className="dz-form__actions">
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Сохранение...' : editingZoneId ? 'Сохранить' : 'Создать'}
              </button>
              <button className="btn btn-ghost" onClick={() => { setShowForm(false); setEditingZoneId(null); }}>
                Отмена
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
