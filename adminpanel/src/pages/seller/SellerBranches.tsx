import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  getBranches, createBranch, updateBranch, deleteBranch,
  getPublicCities, getPublicDistricts, getPublicMetro,
} from '../../api/sellerClient';
import type { BranchDetail } from '../../api/sellerClient';
import { useToast } from '../../components/ui';
import { GitBranch, Plus, Trash2, MapPin, Pencil, Truck, X } from 'lucide-react';

const DELIVERY_OPTIONS = [
  { value: '', label: 'Не указано' },
  { value: 'доставка', label: 'Только доставка' },
  { value: 'самовывоз', label: 'Только самовывоз' },
  { value: 'доставка и самовывоз', label: 'Доставка и самовывоз' },
];

const DELIVERY_LABELS: Record<string, string> = {
  'доставка': 'Доставка',
  'самовывоз': 'Самовывоз',
  'доставка и самовывоз': 'Доставка и самовывоз',
};

interface FormData {
  shop_name: string;
  city_id: number | null;
  district_id: number | null;
  metro_id: number | null;
  metro_walk_minutes: number | null;
  address_name: string;
  delivery_type: string;
  clone_products_from: number | null;
}

const emptyForm: FormData = {
  shop_name: '',
  city_id: null,
  district_id: null,
  metro_id: null,
  metro_walk_minutes: null,
  address_name: '',
  delivery_type: '',
  clone_products_from: null,
};

type RefOption = { id: number; name: string; line_color?: string };

export function SellerBranches() {
  const { sellerId, switchBranch } = useAuth();
  const toast = useToast();

  const [branches, setBranches] = useState<BranchDetail[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingBranch, setEditingBranch] = useState<BranchDetail | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);

  // Reference data
  const [cities, setCities] = useState<RefOption[]>([]);
  const [districts, setDistricts] = useState<RefOption[]>([]);
  const [metros, setMetros] = useState<RefOption[]>([]);

  // --- Load branches ---
  const loadBranches = useCallback(async () => {
    try {
      const data = await getBranches();
      setBranches(data);
    } catch {
      toast.error('Не удалось загрузить филиалы');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadBranches(); }, [loadBranches]);

  // --- Load cities once ---
  useEffect(() => {
    getPublicCities().then(setCities);
  }, []);

  // --- Load districts when city changes ---
  useEffect(() => {
    if (form.city_id) {
      getPublicDistricts(form.city_id).then(setDistricts);
    } else {
      setDistricts([]);
    }
  }, [form.city_id]);

  // --- Load metro when district changes ---
  useEffect(() => {
    if (form.district_id) {
      getPublicMetro(form.district_id).then(setMetros);
    } else {
      setMetros([]);
    }
  }, [form.district_id]);

  // --- Form helpers ---
  const updateField = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm(prev => {
      const next = { ...prev, [key]: value };
      // Cascade resets
      if (key === 'city_id') {
        next.district_id = null;
        next.metro_id = null;
      }
      if (key === 'district_id') {
        next.metro_id = null;
      }
      return next;
    });
  };

  const openAddForm = () => {
    setEditingBranch(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEditForm = (branch: BranchDetail) => {
    setEditingBranch(branch);
    setForm({
      shop_name: branch.shop_name || '',
      city_id: branch.city_id,
      district_id: branch.district_id,
      metro_id: branch.metro_id,
      metro_walk_minutes: null,
      address_name: branch.address_name || '',
      delivery_type: branch.delivery_type || '',
      clone_products_from: null,
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingBranch(null);
  };

  const handleSubmit = async () => {
    if (!form.shop_name.trim()) {
      toast.error('Укажите название филиала');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        shop_name: form.shop_name.trim(),
        address_name: form.address_name.trim() || null,
        city_id: form.city_id,
        district_id: form.district_id,
        metro_id: form.metro_id,
        metro_walk_minutes: form.metro_id ? form.metro_walk_minutes : null,
        delivery_type: form.delivery_type || null,
      };
      if (editingBranch) {
        await updateBranch(editingBranch.seller_id, payload);
        toast.success('Филиал обновлён');
      } else {
        if (form.clone_products_from) {
          payload.clone_products_from = form.clone_products_from;
        }
        await createBranch(payload);
        toast.success('Филиал создан');
      }
      closeForm();
      await loadBranches();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (branchId: number) => {
    if (!confirm('Удалить этот филиал? Товары и заказы останутся в базе.')) return;
    try {
      await deleteBranch(branchId);
      toast.success('Филиал удалён');
      await loadBranches();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка удаления');
    }
  };

  // --- Find city name ---
  const getCityName = (cityId: number | null) => cities.find(c => c.id === cityId)?.name;

  // --- Render ---
  if (loading) {
    return (
      <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
        <div className="loader" />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
          <GitBranch size={22} /> Филиалы
        </h1>
        <button className="btn btn-primary" onClick={openAddForm} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Plus size={16} /> Добавить
        </button>
      </div>

      {/* Branches list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {branches.map(b => {
          const isCurrent = b.seller_id === sellerId;
          return (
            <div
              key={b.seller_id}
              className="card"
              style={{
                padding: '1rem 1.25rem',
                border: isCurrent ? '2px solid var(--primary, #6366f1)' : undefined,
              }}
            >
              {/* Top row: name + actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <div style={{ flex: 1, fontWeight: 600, fontSize: '0.95rem' }}>
                  {b.shop_name || `Филиал #${b.seller_id}`}
                  {isCurrent && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--primary, #6366f1)', marginLeft: '0.5rem', fontWeight: 500 }}>
                      (текущий)
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button
                    className="btn btn-sm"
                    onClick={() => openEditForm(b)}
                    style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                    title="Редактировать"
                  >
                    <Pencil size={13} />
                  </button>
                  {!isCurrent && (
                    <button
                      className="btn btn-sm"
                      onClick={() => switchBranch(b.seller_id)}
                      style={{ fontSize: '0.75rem' }}
                    >
                      Перейти
                    </button>
                  )}
                  {branches.length > 1 && (
                    <button
                      className="btn btn-sm"
                      onClick={() => handleDelete(b.seller_id)}
                      style={{ color: '#ef4444', fontSize: '0.75rem' }}
                      title="Удалить"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Info rows */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {b.address_name && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <MapPin size={12} /> {b.address_name}
                  </span>
                )}
                {b.city_id && (
                  <span>{getCityName(b.city_id)}</span>
                )}
                {b.delivery_type && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Truck size={12} /> {DELIVERY_LABELS[b.delivery_type] || b.delivery_type}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {branches.length === 0 && (
        <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Нет филиалов
        </div>
      )}

      {/* Modal form overlay */}
      {showForm && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={e => { if (e.target === e.currentTarget) closeForm(); }}
        >
          <div
            className="card"
            style={{
              width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto',
              padding: '1.5rem', position: 'relative',
            }}
          >
            {/* Close button */}
            <button
              onClick={closeForm}
              style={{
                position: 'absolute', top: '0.75rem', right: '0.75rem',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-secondary)', padding: '0.25rem',
              }}
            >
              <X size={18} />
            </button>

            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.25rem' }}>
              {editingBranch ? 'Редактировать филиал' : 'Новый филиал'}
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Name */}
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem', display: 'block' }}>
                  Название *
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Например: Цветы на Арбате"
                  value={form.shop_name}
                  onChange={e => updateField('shop_name', e.target.value)}
                />
              </div>

              {/* City + District row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem', display: 'block' }}>
                    Город
                  </label>
                  <select
                    className="form-input"
                    value={form.city_id ?? ''}
                    onChange={e => updateField('city_id', e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">Выберите город</option>
                    {cities.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem', display: 'block' }}>
                    Район
                  </label>
                  <select
                    className="form-input"
                    value={form.district_id ?? ''}
                    onChange={e => updateField('district_id', e.target.value ? Number(e.target.value) : null)}
                    disabled={!form.city_id}
                  >
                    <option value="">{form.city_id ? 'Выберите район' : 'Сначала город'}</option>
                    {districts.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Metro + walk minutes */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem', display: 'block' }}>
                    Метро
                  </label>
                  <select
                    className="form-input"
                    value={form.metro_id ?? ''}
                    onChange={e => updateField('metro_id', e.target.value ? Number(e.target.value) : null)}
                    disabled={!form.district_id}
                  >
                    <option value="">{form.district_id ? (metros.length ? 'Выберите метро' : 'Нет станций') : 'Сначала район'}</option>
                    {metros.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
                {form.metro_id && (
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem', display: 'block' }}>
                      Пешком, мин.
                    </label>
                    <input
                      type="number"
                      className="form-input"
                      min={1}
                      max={60}
                      placeholder="5"
                      value={form.metro_walk_minutes ?? ''}
                      onChange={e => updateField('metro_walk_minutes', e.target.value ? Number(e.target.value) : null)}
                    />
                  </div>
                )}
              </div>

              {/* Address */}
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem', display: 'block' }}>
                  Адрес
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="ул. Тверская, д. 1"
                  value={form.address_name}
                  onChange={e => updateField('address_name', e.target.value)}
                />
              </div>

              {/* Delivery type */}
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem', display: 'block' }}>
                  Тип доставки
                </label>
                <select
                  className="form-input"
                  value={form.delivery_type}
                  onChange={e => updateField('delivery_type', e.target.value)}
                >
                  {DELIVERY_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Clone products (only when creating) */}
              {!editingBranch && branches.length > 0 && (
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.3rem', display: 'block' }}>
                    Скопировать товары из
                  </label>
                  <select
                    className="form-input"
                    value={form.clone_products_from ?? ''}
                    onChange={e => updateField('clone_products_from', e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">Не копировать</option>
                    {branches.map(b => (
                      <option key={b.seller_id} value={b.seller_id}>
                        {b.shop_name || `Филиал #${b.seller_id}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
                  {saving ? 'Сохранение...' : (editingBranch ? 'Сохранить' : 'Создать филиал')}
                </button>
                <button className="btn btn-ghost" onClick={closeForm}>Отмена</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
