import { useEffect, useState } from 'react';
import {
  getGlobalInventory,
  getBouquets,
  createBouquet,
  updateBouquet,
  deleteBouquet,
  type BouquetDetail,
  type FlowerStock,
} from '../../api/sellerClient';
import { PageHeader, FormField, EmptyState, useToast, useConfirm } from '@shared/components/ui';
import './SellerBouquets.css';

export function SellerBouquets() {
  const toast = useToast();
  const confirm = useConfirm();
  const [flowersInStock, setFlowersInStock] = useState<FlowerStock[]>([]);
  const [bouquets, setBouquets] = useState<BouquetDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: '',
    packaging_cost: '0',
    items: [] as { flower_id: number; flower_name: string; quantity: number }[],
  });

  const load = async () => {
    setLoading(true);
    try {
      const [stock, list] = await Promise.all([
        fetchFlowersWithStock(),
        getBouquets(),
      ]);
      setFlowersInStock(stock);
      setBouquets(list);
    } catch {
      setFlowersInStock([]);
      setBouquets([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const fetchFlowersWithStock = async (): Promise<FlowerStock[]> => {
    const inventory = await getGlobalInventory();
    return inventory.map((item) => ({
      flower_id: item.flower_id,
      flower_name: item.flower_name,
      remaining_quantity: item.total_remaining,
      avg_price: item.avg_price,
    }));
  };

  const addFormItem = () => {
    if (flowersInStock.length === 0) return;
    const first = flowersInStock[0];
    setForm((p) => ({
      ...p,
      items: [
        ...p.items,
        {
          flower_id: first.flower_id,
          flower_name: first.flower_name,
          quantity: 1,
        },
      ],
    }));
  };

  const updateFormItem = (index: number, field: string, value: number | string) => {
    setForm((p) => ({
      ...p,
      items: p.items.map((it, i) =>
        i === index ? { ...it, [field]: value } : it
      ),
    }));
  };

  const removeFormItem = (index: number) => {
    setForm((p) => ({ ...p, items: p.items.filter((_, i) => i !== index) }));
  };

  const getFormTotals = () => {
    let cost = 0;
    for (const it of form.items) {
      const flower = flowersInStock.find((f) => f.flower_id === it.flower_id);
      const unitCost = flower?.avg_price ?? 0;
      cost += unitCost * it.quantity;
    }
    const pack = parseFloat(form.packaging_cost) || 0;
    return { cost, total: cost + pack, packaging: pack };
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || form.items.length === 0) {
      toast.warning('Укажите название и хотя бы одну позицию');
      return;
    }
    const packaging = parseFloat(form.packaging_cost) || 0;
    const payload = {
      name: form.name.trim(),
      packaging_cost: packaging,
      items: form.items.map((it) => ({
        flower_id: it.flower_id,
        quantity: it.quantity,
      })),
    };
    try {
      if (editingId) {
        await updateBouquet(editingId, payload);
        setEditingId(null);
      } else {
        await createBouquet(payload);
      }
      setForm({ name: '', packaging_cost: '0', items: [] });
      setShowCreate(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка');
    }
  };

  const handleDelete = async (id: number) => {
    if (!await confirm({ message: 'Удалить букет?' })) return;
    try {
      await deleteBouquet(id);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка');
    }
  };

  const startEdit = (b: BouquetDetail) => {
    setEditingId(b.id);
    setForm({
      name: b.name,
      packaging_cost: String(b.packaging_cost ?? 0),
      items: (b.items || []).map((it) => ({
        flower_id: it.flower_id,
        flower_name: it.flower_name,
        quantity: it.quantity,
      })),
    });
    setShowCreate(true);
  };

  if (loading) {
    return (
      <div className="seller-bouquets-loading">
        <div className="loader" />
      </div>
    );
  }

  const totals = getFormTotals();

  return (
    <div className="seller-bouquets-page">
      <PageHeader
        title="Конструктор букетов"
        actions={
          <button
            className="btn btn-primary"
            onClick={() => { setShowCreate(true); setEditingId(null); setForm({ name: '', packaging_cost: '0', items: [] }); }}
          >
            Создать букет
          </button>
        }
      />

      {showCreate && (
        <form onSubmit={handleSave} className="card bouquet-form">
          <h3>{editingId ? 'Редактировать букет' : 'Новый букет'}</h3>
          <FormField label="Название" required>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              className="form-input"
              required
            />
          </FormField>
          <FormField label="Стоимость упаковки (₽)">
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.packaging_cost}
              onChange={(e) => setForm((p) => ({ ...p, packaging_cost: e.target.value }))}
              className="form-input"
            />
          </FormField>
          <h4>Состав</h4>
          <p className="section-hint">Выберите цветы из наличия в приёмках.</p>
          {form.items.map((it, idx) => {
            const flowerStock = flowersInStock.find((f) => f.flower_id === it.flower_id);
            const maxQty = flowerStock?.remaining_quantity ?? 1;
            return (
            <div key={idx} className="bouquet-item-row">
              <select
                value={it.flower_id}
                onChange={(e) => {
                  const f = flowersInStock.find((x) => x.flower_id === Number(e.target.value));
                  if (f) updateFormItem(idx, 'flower_id', f.flower_id);
                  if (f) updateFormItem(idx, 'flower_name', f.flower_name);
                }}
                className="form-input"
              >
                {flowersInStock.map((f) => (
                  <option key={f.flower_id} value={f.flower_id}>
                    {f.flower_name} (осталось {f.remaining_quantity}, ~{f.avg_price.toFixed(0)} ₽/шт)
                  </option>
                ))}
              </select>
              <div className="qty-wrapper">
                <input
                  type="number"
                  min={1}
                  max={maxQty}
                  value={it.quantity}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10) || 1;
                    updateFormItem(idx, 'quantity', Math.min(val, maxQty));
                  }}
                  className="form-input qty-input"
                  placeholder="шт"
                />
                <span className="qty-hint">макс: {maxQty}</span>
              </div>
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => removeFormItem(idx)}>
                Удалить
              </button>
            </div>
            );
          })}
          <button type="button" className="btn btn-secondary" onClick={addFormItem}>
            Добавить цветок
          </button>
          <div className="bouquet-totals">
            <p>Себестоимость цветов: {totals.cost.toFixed(0)} ₽</p>
            {totals.packaging > 0 && <p>Упаковка: {totals.packaging.toFixed(0)} ₽</p>}
            <p>Итого себестоимость: <strong>{totals.total.toFixed(0)} ₽</strong></p>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => { setShowCreate(false); setEditingId(null); }}>
              Отмена
            </button>
            <button type="submit" className="btn btn-primary">Сохранить</button>
          </div>
        </form>
      )}

      <div className="card shop-section">
        <h3>Мои букеты</h3>
        {bouquets.length === 0 ? (
          <EmptyState title="Нет букетов" message="Создайте букет из цветов в наличии." />
        ) : (
          <div className="bouquets-list">
            {bouquets.map((b) => (
              <div key={b.id} className={`bouquet-card ${b.is_active === false ? 'bouquet-card-inactive' : ''}`}>
                <div className="bouquet-card-header">
                  <strong>{b.name}</strong>
                  <span className="bouquet-price">Себест.: {b.total_price != null ? `${b.total_price.toFixed(0)} ₽` : '—'}</span>
                </div>
                {b.is_active === false ? (
                  <p className="bouquet-status bouquet-status-inactive">Не активен — в приёмке не хватает цветов (букет скрыт в каталоге)</p>
                ) : (
                  <p className="bouquet-status bouquet-status-active">Можно собрать: <strong>{b.can_assemble_count ?? 0}</strong> шт.</p>
                )}
                {b.items && b.items.length > 0 && (
                  <ul className="bouquet-composition">
                    {b.items.map((it, i) => (
                      <li key={i}>{it.flower_name} × {it.quantity}</li>
                    ))}
                  </ul>
                )}
                <div className="bouquet-actions">
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => startEdit(b)}>Изменить</button>
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => handleDelete(b.id)}>Удалить</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
