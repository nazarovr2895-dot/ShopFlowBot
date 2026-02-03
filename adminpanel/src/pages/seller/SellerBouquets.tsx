import { useEffect, useState } from 'react';
import {
  getFlowers,
  getReceptions,
  getReception,
  getBouquets,
  createBouquet,
  updateBouquet,
  deleteBouquet,
  type Flower,
  type BouquetDetail,
  type FlowerStock,
} from '../../api/sellerClient';
import './SellerBouquets.css';

export function SellerBouquets() {
  const [flowersInStock, setFlowersInStock] = useState<FlowerStock[]>([]);
  const [bouquets, setBouquets] = useState<BouquetDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: '',
    packaging_cost: '0',
    items: [] as { flower_id: number; flower_name: string; quantity: number; markup_multiplier: string }[],
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
    const flowers = await getFlowers();
    const receptions = await getReceptions();
    const byFlower: Record<number, { name: string; total_remaining: number; avg_price: number; prices: number[] }> = {};
    for (const f of flowers) {
      byFlower[f.id] = { name: f.name, total_remaining: 0, avg_price: 0, prices: [] };
    }
    for (const r of receptions) {
      const detail = await getReception(r.id);
      for (const it of detail.items) {
        if (!byFlower[it.flower_id]) continue;
        byFlower[it.flower_id].total_remaining += it.remaining_quantity;
        for (let i = 0; i < it.remaining_quantity; i++) {
          byFlower[it.flower_id].prices.push(it.price_per_unit);
        }
      }
    }
    return flowers
      .filter((f) => byFlower[f.id].total_remaining > 0)
      .map((f) => {
        const d = byFlower[f.id];
        const avg = d.prices.length ? d.prices.reduce((a, b) => a + b, 0) / d.prices.length : 0;
        return {
          flower_id: f.id,
          flower_name: f.name,
          remaining_quantity: d.total_remaining,
          avg_price: avg,
        };
      });
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
          markup_multiplier: '1.5',
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
    let price = 0;
    for (const it of form.items) {
      const flower = flowersInStock.find((f) => f.flower_id === it.flower_id);
      const unitCost = flower?.avg_price ?? 0;
      const mult = parseFloat(it.markup_multiplier) || 1;
      cost += unitCost * it.quantity;
      price += unitCost * it.quantity * mult;
    }
    const pack = parseFloat(form.packaging_cost) || 0;
    return { cost, price: price + pack, packaging: pack };
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || form.items.length === 0) {
      alert('Укажите название и хотя бы одну позицию');
      return;
    }
    const packaging = parseFloat(form.packaging_cost) || 0;
    const payload = {
      name: form.name.trim(),
      packaging_cost: packaging,
      items: form.items.map((it) => ({
        flower_id: it.flower_id,
        quantity: it.quantity,
        markup_multiplier: parseFloat(it.markup_multiplier) || 1,
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
      alert(err instanceof Error ? err.message : 'Ошибка');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить букет?')) return;
    try {
      await deleteBouquet(id);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка');
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
        markup_multiplier: String(it.markup_multiplier ?? 1),
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
      <h1 className="page-title">Конструктор букетов</h1>
      <button className="btn btn-primary" onClick={() => { setShowCreate(true); setEditingId(null); setForm({ name: '', packaging_cost: '0', items: [] }); }}>
        Создать букет
      </button>

      {showCreate && (
        <form onSubmit={handleSave} className="card bouquet-form">
          <h3>{editingId ? 'Редактировать букет' : 'Новый букет'}</h3>
          <div className="form-group">
            <label>Название</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              className="form-input"
              required
            />
          </div>
          <div className="form-group">
            <label>Стоимость упаковки (₽)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.packaging_cost}
              onChange={(e) => setForm((p) => ({ ...p, packaging_cost: e.target.value }))}
              className="form-input"
            />
          </div>
          <h4>Состав</h4>
          <p className="section-hint">Выберите цветы из наличия в приёмках.</p>
          {form.items.map((it, idx) => (
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
              <input
                type="number"
                min={1}
                value={it.quantity}
                onChange={(e) => updateFormItem(idx, 'quantity', parseInt(e.target.value, 10) || 1)}
                className="form-input qty-input"
                placeholder="шт"
              />
              <input
                type="number"
                min="0.5"
                step="0.1"
                value={it.markup_multiplier}
                onChange={(e) => updateFormItem(idx, 'markup_multiplier', e.target.value)}
                className="form-input"
                placeholder="наценка (например 2 = 2x)"
                title="Множитель наценки"
              />
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => removeFormItem(idx)}>
                Удалить
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-secondary" onClick={addFormItem}>
            Добавить цветок
          </button>
          <div className="bouquet-totals">
            <p>Себестоимость цветов: {totals.cost.toFixed(0)} ₽</p>
            <p>Итоговая цена (с наценкой и упаковкой): <strong>{totals.price.toFixed(0)} ₽</strong></p>
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
          <p className="empty-text">Нет букетов. Создайте букет из цветов в наличии.</p>
        ) : (
          <div className="bouquets-list">
            {bouquets.map((b) => (
              <div key={b.id} className={`bouquet-card ${b.is_active === false ? 'bouquet-card-inactive' : ''}`}>
                <div className="bouquet-card-header">
                  <strong>{b.name}</strong>
                  <span className="bouquet-price">{b.total_price != null ? `${b.total_price.toFixed(0)} ₽` : '—'}</span>
                </div>
                {b.is_active === false ? (
                  <p className="bouquet-status bouquet-status-inactive">Не активен — в приёмке не хватает цветов (букет скрыт в каталоге)</p>
                ) : (
                  <p className="bouquet-status bouquet-status-active">Можно собрать: <strong>{b.can_assemble_count ?? 0}</strong> шт.</p>
                )}
                <p className="bouquet-cost">Себестоимость: {b.total_cost != null ? `${b.total_cost.toFixed(0)} ₽` : '—'}</p>
                {b.items && b.items.length > 0 && (
                  <ul className="bouquet-composition">
                    {b.items.map((it, i) => (
                      <li key={i}>{it.flower_name} × {it.quantity} (×{it.markup_multiplier})</li>
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
