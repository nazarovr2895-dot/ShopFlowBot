import { useState, useEffect, useCallback } from 'react';
import {
  updateMe,
  getDeliveryZones,
  createDeliveryZone,
  updateDeliveryZone,
  deleteDeliveryZone,
  getPublicDistricts,
} from '../../../api/sellerClient';
import type { DeliveryZone, CreateDeliveryZoneData } from '../../../api/sellerClient';
import { FormField, useToast } from '../../../components/ui';
import { MapPin, Plus, Pencil, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
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

export function DeliveryZonesSettingsTab({ me, reload }: SettingsTabProps) {
  const toast = useToast();
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [districts, setDistricts] = useState<DistrictOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingZoneId, setEditingZoneId] = useState<number | null>(null);
  const [form, setForm] = useState<CreateDeliveryZoneData>({ ...EMPTY_FORM });

  const isEnabled = me.use_delivery_zones ?? false;

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

  const handleToggle = async () => {
    setSaving(true);
    try {
      await updateMe({ use_delivery_zones: !isEnabled });
      await reload();
      toast.success(isEnabled ? 'Зоны доставки отключены' : 'Зоны доставки включены');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

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
      {/* Toggle card */}
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

        <div className="dz-toggle">
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleToggle}
            disabled={saving}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {isEnabled ? <ToggleRight size={20} color="var(--accent)" /> : <ToggleLeft size={20} />}
            <span>{isEnabled ? 'Зоны включены' : 'Зоны выключены'}</span>
          </button>
          <span className="dz-toggle__label">
            {isEnabled
              ? 'Цена доставки зависит от района покупателя'
              : 'Используется единая цена доставки из настроек магазина'
            }
          </span>
        </div>

        {isEnabled && (
          <>
            {/* Zone list */}
            {zones.length > 0 ? (
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
            ) : (
              <div className="dz-empty">
                Зон доставки пока нет. Добавьте первую зону.
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
          </>
        )}
      </div>
    </div>
  );
}
