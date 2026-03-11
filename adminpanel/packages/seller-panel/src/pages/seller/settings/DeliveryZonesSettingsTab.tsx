import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  getDeliveryZones,
  createDeliveryZone,
  updateDeliveryZone,
  deleteDeliveryZone,
  getPublicDistricts,
  updateMe,
} from '../../../api/sellerClient';
import type { DeliveryZone, CreateDeliveryZoneData } from '../../../api/sellerClient';
import { FormField, Toggle, useToast } from '@shared/components/ui';
import {
  MapPin, Plus, Pencil, Trash2, Clock, Info,
  ChevronDown, ChevronUp, MapPinned, Truck, X,
  Package, Banknote,
} from 'lucide-react';
import { DistrictSelector } from './DistrictSelector';
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

const MAX_VISIBLE_DISTRICTS = 5;

export function DeliveryZonesSettingsTab({ me, reload }: SettingsTabProps) {
  const toast = useToast();
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [districts, setDistricts] = useState<DistrictOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingZoneId, setEditingZoneId] = useState<number | null>(null);
  const [form, setForm] = useState<CreateDeliveryZoneData>({ ...EMPTY_FORM });
  const [expandedZoneIds, setExpandedZoneIds] = useState<Set<number>>(new Set());

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

  const districtName = (id: number) => districts.find(d => d.id === id)?.name ?? `#${id}`;

  const toggleExpandZone = (id: number) => {
    setExpandedZoneIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const usedByOtherZonesMap = useMemo(() => {
    const map = new Map<number, string>();
    zones.filter(z => z.id !== editingZoneId).forEach(z => {
      (z.district_ids || []).forEach(id => map.set(id, z.name));
    });
    return map;
  }, [zones, editingZoneId]);

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
      {/* ═══ Delivery Slots ═══ */}
      <div className="shop-card">
        <div className="shop-card__header">
          <div className="shop-card__header-left">
            <div className="shop-card__icon-badge" style={{ background: 'rgba(168,85,247,0.1)', color: '#a855f7' }}>
              <Clock size={18} />
            </div>
            <div>
              <h3 className="shop-card__title">Слоты доставки</h3>
              <p className="shop-card__subtitle">Покупатель выбирает временной интервал</p>
            </div>
          </div>
        </div>

        <div className="dz-slots" style={{ padding: '0 var(--space-4) var(--space-4)' }}>
          <Toggle
            checked={slotsEnabled}
            onChange={setSlotsEnabled}
            label="Включить выбор времени доставки"
          />

          {slotsEnabled && (
            <div className="dz-slots__grid">
              <FormField label={<span className="dz-slot-label">Интервал слота <span className="dz-slot-hint"><Info size={14} /><span className="dz-slot-hint__text">Длительность одного слота. Например, 2 часа — слоты 10:00–12:00, 12:00–14:00.</span></span></span>}>
                <select className="form-input" value={slotDuration} onChange={e => setSlotDuration(parseInt(e.target.value))}>
                  {DURATION_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </FormField>
              <FormField label={<span className="dz-slot-label">Доставок за слот <span className="dz-slot-hint"><Info size={14} /><span className="dz-slot-hint__text">Сколько заказов за один интервал. 1 — один заказ на слот, 3 — три покупателя смогут выбрать одно время.</span></span></span>}>
                <input type="number" className="form-input" min={1} max={10} value={deliveriesPerSlot} onChange={e => setDeliveriesPerSlot(parseInt(e.target.value) || 1)} />
              </FormField>
              <FormField label={<span className="dz-slot-label">Дней вперёд <span className="dz-slot-hint"><Info size={14} /><span className="dz-slot-hint__text">На сколько дней покупатель увидит слоты. 2 — сегодня и завтра, 7 — на неделю.</span></span></span>}>
                <input type="number" className="form-input" min={1} max={7} value={slotDaysAhead} onChange={e => setSlotDaysAhead(parseInt(e.target.value) || 3)} />
              </FormField>
              <FormField label={<span className="dz-slot-label">Минимум заранее <span className="dz-slot-hint"><Info size={14} /><span className="dz-slot-hint__text">За сколько часов до слота можно забронировать. Если 14:00 и минимум 2ч — ближайший слот с 16:00.</span></span></span>}>
                <select className="form-input" value={minSlotLead} onChange={e => setMinSlotLead(parseInt(e.target.value))}>
                  {LEAD_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </FormField>
            </div>
          )}

          <div>
            <button className="btn btn-primary btn-sm" onClick={saveSlotSettings} disabled={savingSlots}>
              {savingSlots ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </div>
      </div>

      {/* ═══ Delivery Zones ═══ */}
      <div className="shop-card">
        <div className="shop-card__header">
          <div className="shop-card__header-left">
            <div className="shop-card__icon-badge" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>
              <MapPin size={18} />
            </div>
            <div>
              <h3 className="shop-card__title">
                Зоны доставки
                {zones.length > 0 && <span className="dz-header__count">{zones.length}</span>}
              </h3>
              <p className="shop-card__subtitle">Районы, цены и условия доставки</p>
            </div>
          </div>
          {!showForm && zones.length > 0 && (
            <button className="btn btn-primary btn-sm" onClick={openCreateForm}>
              <Plus size={14} /> Добавить
            </button>
          )}
        </div>

        <div style={{ padding: '0 var(--space-4) var(--space-4)' }}>
          {/* Empty state */}
          {zones.length === 0 && !showForm && (
            <div className="dz-empty">
              <div className="dz-empty__icon">
                <Truck size={28} />
              </div>
              <div className="dz-empty__title">Нет зон доставки</div>
              <div className="dz-empty__desc">
                Без настроенных зон покупатели смогут оформить только самовывоз. Добавьте первую зону, чтобы включить доставку.
              </div>
              <button className="btn btn-primary" onClick={openCreateForm}>
                <Plus size={16} /> Создать зону доставки
              </button>
            </div>
          )}

          {/* Zone list */}
          {zones.length > 0 && !showForm && (
            <div className="dz-zones-list">
              {zones.map(zone => {
                const ids = zone.district_ids || [];
                const isExpanded = expandedZoneIds.has(zone.id);
                const visibleIds = ids.slice(0, MAX_VISIBLE_DISTRICTS);
                const hiddenCount = ids.length - MAX_VISIBLE_DISTRICTS;

                return (
                  <div key={zone.id} className={`dz-zone-card ${!zone.is_active ? 'dz-zone-card--inactive' : ''}`}>
                    <div className="dz-zone-card__top">
                      {/* Row 1: name + price */}
                      <div className="dz-zone-card__row1">
                        <div className="dz-zone-card__name">
                          {zone.name}
                          {!zone.is_active && <span className="dz-zone-card__inactive-badge">Неактивна</span>}
                        </div>
                        <div className={`dz-zone-card__price ${zone.delivery_price === 0 ? 'dz-zone-card__price--free' : ''}`}>
                          {zone.delivery_price > 0 ? `${zone.delivery_price} ₽` : 'Бесплатно'}
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="dz-zone-card__stats">
                        <span className="dz-zone-card__stat">
                          <MapPinned size={12} />
                          {ids.length} {pluralize(ids.length, 'район', 'района', 'районов')}
                        </span>
                        {zone.min_order_amount != null && (
                          <span className="dz-zone-card__stat">
                            <Package size={12} />
                            Мин. заказ {zone.min_order_amount} ₽
                          </span>
                        )}
                        {zone.free_delivery_from != null && (
                          <span className="dz-zone-card__stat">
                            <Banknote size={12} />
                            Бесплатно от {zone.free_delivery_from} ₽
                          </span>
                        )}
                      </div>

                      {/* District tags preview */}
                      <div className="dz-zone-card__districts">
                        {visibleIds.map(id => (
                          <span key={id} className="dz-zone-card__district-tag">{districtName(id)}</span>
                        ))}
                        {hiddenCount > 0 && !isExpanded && (
                          <button
                            className="dz-zone-card__district-more"
                            onClick={() => toggleExpandZone(zone.id)}
                          >
                            +{hiddenCount} ещё
                          </button>
                        )}
                        {isExpanded && hiddenCount > 0 && (
                          <button
                            className="dz-zone-card__district-more"
                            onClick={() => toggleExpandZone(zone.id)}
                          >
                            <ChevronUp size={12} /> Скрыть
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expanded districts */}
                    {isExpanded && hiddenCount > 0 && (
                      <div className="dz-zone-card__districts-expanded">
                        {ids.slice(MAX_VISIBLE_DISTRICTS).map(id => (
                          <span key={id} className="dz-zone-card__district-tag">{districtName(id)}</span>
                        ))}
                      </div>
                    )}

                    {/* Actions footer */}
                    <div className="dz-zone-card__footer">
                      <button className="btn btn-ghost btn-sm" onClick={() => openEditForm(zone)}>
                        <Pencil size={13} /> Изменить
                      </button>
                      <div className="dz-zone-card__footer-spacer" />
                      <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(zone.id)} style={{ color: 'var(--danger)' }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add button (when no zones) */}
          {zones.length === 0 && showForm ? null : null}

          {/* ═══ Create/Edit Form ═══ */}
          {showForm && (
            <div className="dz-form">
              <div className="dz-form__header">
                <span className="dz-form__title">
                  {editingZoneId ? 'Редактирование зоны' : 'Новая зона доставки'}
                </span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => { setShowForm(false); setEditingZoneId(null); }}
                >
                  <X size={16} />
                </button>
              </div>

              <div className="dz-form__body">
                <FormField label="Название зоны">
                  <input
                    type="text"
                    className="form-input"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Например: Центр Москвы"
                  />
                </FormField>

                <div className="dz-form__row-3col">
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
                  <FormField label="Мин. сумма заказа (₽)">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className="form-input"
                      value={form.min_order_amount ?? ''}
                      onChange={e => setForm(f => ({ ...f, min_order_amount: e.target.value ? parseFloat(e.target.value) : null }))}
                      placeholder="Без ограничений"
                    />
                  </FormField>
                  <FormField label="Бесплатно от (₽)">
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

                <FormField label="Районы доставки">
                  {districts.length > 0 ? (
                    <DistrictSelector
                      districts={districts}
                      selectedIds={form.district_ids}
                      onChange={(ids) => setForm(f => ({ ...f, district_ids: ids }))}
                      usedByOtherZonesMap={usedByOtherZonesMap}
                    />
                  ) : (
                    <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
                      Укажите город в настройках магазина, чтобы увидеть районы
                    </p>
                  )}
                </FormField>
              </div>

              <div className="dz-form__footer">
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? 'Сохранение...' : editingZoneId ? 'Сохранить' : 'Создать зону'}
                </button>
                <button className="btn btn-ghost" onClick={() => { setShowForm(false); setEditingZoneId(null); }}>
                  Отмена
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function pluralize(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last > 1 && last < 5) return few;
  if (last === 1) return one;
  return many;
}
