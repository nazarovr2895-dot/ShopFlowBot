import { useEffect, useState } from 'react';
import {
  getFlowers,
  createFlower,
  deleteFlower,
  getReceptions,
  createReception,
  getReception,
  addReceptionItem,
  deleteReceptionItem,
  type Flower,
  type ReceptionBrief,
  type ReceptionDetail,
  type ReceptionItemRow,
} from '../../api/sellerClient';
import './SellerReceptions.css';

export function SellerReceptions() {
  const [flowers, setFlowers] = useState<Flower[]>([]);
  const [receptions, setReceptions] = useState<ReceptionBrief[]>([]);
  const [selectedReception, setSelectedReception] = useState<ReceptionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddFlower, setShowAddFlower] = useState(false);
  const [newFlowerName, setNewFlowerName] = useState('');
  const [newFlowerShelfDays, setNewFlowerShelfDays] = useState<string>('');
  const [showAddReception, setShowAddReception] = useState(false);
  const [newReceptionName, setNewReceptionName] = useState('');
  const [newReceptionDate, setNewReceptionDate] = useState('');
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItem, setNewItem] = useState({
    flower_id: 0,
    quantity_initial: '1',
    arrival_date: '',
    shelf_life_days: '7',
    price_per_unit: '',
  });

  const loadFlowers = async () => {
    try {
      const data = await getFlowers();
      setFlowers(data || []);
    } catch {
      setFlowers([]);
    }
  };

  const loadReceptions = async () => {
    try {
      const data = await getReceptions();
      setReceptions(data || []);
    } catch {
      setReceptions([]);
    }
  };

  const loadSelectedReception = async (id: number) => {
    try {
      const data = await getReception(id);
      setSelectedReception(data);
    } catch {
      setSelectedReception(null);
    }
  };

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      await Promise.all([loadFlowers(), loadReceptions()]);
      setLoading(false);
    };
    run();
  }, []);

  const handleCreateFlower = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFlowerName.trim()) return;
    try {
      await createFlower({
        name: newFlowerName.trim(),
        default_shelf_life_days: newFlowerShelfDays ? parseInt(newFlowerShelfDays, 10) : undefined,
      });
      setNewFlowerName('');
      setNewFlowerShelfDays('');
      setShowAddFlower(false);
      await loadFlowers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка');
    }
  };

  const handleDeleteFlower = async (id: number) => {
    if (!confirm('Удалить цветок из справочника?')) return;
    try {
      await deleteFlower(id);
      await loadFlowers();
      if (selectedReception) await loadSelectedReception(selectedReception.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка');
    }
  };

  const handleCreateReception = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReceptionName.trim()) return;
    try {
      const rec = await createReception({
        name: newReceptionName.trim(),
        reception_date: newReceptionDate || undefined,
      });
      setNewReceptionName('');
      setNewReceptionDate('');
      setShowAddReception(false);
      await loadReceptions();
      setSelectedReception({ ...rec, items: [] });
      await loadSelectedReception(rec.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка');
    }
  };

  const handleAddReceptionItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReception || !newItem.flower_id || !newItem.price_per_unit) return;
    const qty = parseInt(newItem.quantity_initial, 10);
    const shelf = parseInt(newItem.shelf_life_days, 10);
    const price = parseFloat(newItem.price_per_unit);
    if (isNaN(qty) || qty < 1 || isNaN(shelf) || shelf < 1 || isNaN(price) || price < 0) {
      alert('Проверьте количество, срок жизни и цену');
      return;
    }
    try {
      await addReceptionItem(selectedReception.id, {
        flower_id: newItem.flower_id,
        quantity_initial: qty,
        arrival_date: newItem.arrival_date || undefined,
        shelf_life_days: shelf,
        price_per_unit: price,
      });
      setNewItem({ flower_id: 0, quantity_initial: '1', arrival_date: '', shelf_life_days: '7', price_per_unit: '' });
      setShowAddItem(false);
      await loadSelectedReception(selectedReception.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка');
    }
  };

  const handleDeleteReceptionItem = async (itemId: number) => {
    if (!confirm('Удалить позицию?')) return;
    try {
      await deleteReceptionItem(itemId);
      if (selectedReception) await loadSelectedReception(selectedReception.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка');
    }
  };

  if (loading) {
    return (
      <div className="seller-receptions-loading">
        <div className="loader" />
      </div>
    );
  }

  return (
    <div className="seller-receptions-page">
      <h1 className="page-title">Приёмка</h1>

      <div className="receptions-actions">
        <button className="btn btn-primary" onClick={() => setShowAddFlower(true)}>
          Создать цветок
        </button>
        <button className="btn btn-primary" onClick={() => setShowAddReception(true)}>
          Создать приёмку
        </button>
      </div>

      {showAddFlower && (
        <form onSubmit={handleCreateFlower} className="card add-form">
          <h3>Новый цветок</h3>
          <div className="form-group">
            <label>Название</label>
            <input
              type="text"
              value={newFlowerName}
              onChange={(e) => setNewFlowerName(e.target.value)}
              className="form-input"
              required
            />
          </div>
          <div className="form-group">
            <label>Срок жизни по умолчанию (дней)</label>
            <input
              type="number"
              min={1}
              value={newFlowerShelfDays}
              onChange={(e) => setNewFlowerShelfDays(e.target.value)}
              className="form-input"
              placeholder="например 7"
            />
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setShowAddFlower(false)}>
              Отмена
            </button>
            <button type="submit" className="btn btn-primary">Добавить</button>
          </div>
        </form>
      )}

      {showAddReception && (
        <form onSubmit={handleCreateReception} className="card add-form">
          <h3>Новая приёмка</h3>
          <div className="form-group">
            <label>Название</label>
            <input
              type="text"
              value={newReceptionName}
              onChange={(e) => setNewReceptionName(e.target.value)}
              className="form-input"
              required
            />
          </div>
          <div className="form-group">
            <label>Дата приёмки</label>
            <input
              type="date"
              value={newReceptionDate}
              onChange={(e) => setNewReceptionDate(e.target.value)}
              className="form-input"
            />
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setShowAddReception(false)}>
              Отмена
            </button>
            <button type="submit" className="btn btn-primary">Создать</button>
          </div>
        </form>
      )}

      <div className="card shop-section">
        <h3>Справочник цветов</h3>
        <p className="section-hint">Цветы для выбора при добавлении позиций в приёмку.</p>
        {flowers.length === 0 ? (
          <p className="empty-text">Нет цветов. Нажмите «Создать цветок».</p>
        ) : (
          <ul className="flowers-list">
            {flowers.map((f) => (
              <li key={f.id} className="flower-item">
                <span>{f.name}</span>
                {f.default_shelf_life_days != null && (
                  <span className="flower-shelf">({f.default_shelf_life_days} дн.)</span>
                )}
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => handleDeleteFlower(f.id)}>
                  Удалить
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card shop-section">
        <h3>Приёмки</h3>
        <p className="section-hint">Выберите приёмку, чтобы увидеть и редактировать позиции.</p>
        {receptions.length === 0 ? (
          <p className="empty-text">Нет приёмок. Нажмите «Создать приёмку».</p>
        ) : (
          <div className="receptions-list">
            {receptions.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`reception-tab ${selectedReception?.id === r.id ? 'active' : ''}`}
                onClick={() => loadSelectedReception(r.id)}
              >
                {r.name} {r.reception_date ? ` — ${r.reception_date}` : ''}
              </button>
            ))}
          </div>
        )}

        {selectedReception && (
          <>
            <div className="reception-header">
              <strong>{selectedReception.name}</strong>
              {selectedReception.reception_date && (
                <span className="reception-date">{selectedReception.reception_date}</span>
              )}
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setShowAddItem(true)}
              >
                Добавить позицию
              </button>
            </div>

            {showAddItem && (
              <form onSubmit={handleAddReceptionItem} className="card add-form add-item-form">
                <h4>Позиция приёмки</h4>
                <div className="form-group">
                  <label>Цветок</label>
                  <select
                    value={newItem.flower_id}
                    onChange={(e) => setNewItem((p) => ({ ...p, flower_id: Number(e.target.value) }))}
                    className="form-input"
                    required
                  >
                    <option value={0}>— выбрать —</option>
                    {flowers.map((f) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-row-2">
                  <div className="form-group">
                    <label>Кол-во (шт)</label>
                    <input
                      type="number"
                      min={1}
                      value={newItem.quantity_initial}
                      onChange={(e) => setNewItem((p) => ({ ...p, quantity_initial: e.target.value }))}
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label>Дата прихода</label>
                    <input
                      type="date"
                      value={newItem.arrival_date}
                      onChange={(e) => setNewItem((p) => ({ ...p, arrival_date: e.target.value }))}
                      className="form-input"
                    />
                  </div>
                </div>
                <div className="form-row-2">
                  <div className="form-group">
                    <label>Срок жизни (дней)</label>
                    <input
                      type="number"
                      min={1}
                      value={newItem.shelf_life_days}
                      onChange={(e) => setNewItem((p) => ({ ...p, shelf_life_days: e.target.value }))}
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label>Цена за шт (₽)</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={newItem.price_per_unit}
                      onChange={(e) => setNewItem((p) => ({ ...p, price_per_unit: e.target.value }))}
                      className="form-input"
                      required
                    />
                  </div>
                </div>
                <div className="form-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowAddItem(false)}>
                    Отмена
                  </button>
                  <button type="submit" className="btn btn-primary">Добавить</button>
                </div>
              </form>
            )}

            <div className="reception-items-wrap">
              <table className="reception-items-table">
                <thead>
                  <tr>
                    <th>Название</th>
                    <th>Кол-во (шт)</th>
                    <th>Дата прихода</th>
                    <th>Срок жизни (дн)</th>
                    <th>Цена за шт</th>
                    <th>Осталось шт</th>
                    <th>Осталось дней</th>
                    <th>Проданно шт / сумма</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {selectedReception.items.map((row: ReceptionItemRow) => (
                    <tr
                      key={row.id}
                      className={
                        row.days_left != null && row.days_left <= 2 ? 'row-expiring' : ''
                      }
                    >
                      <td>{row.flower_name}</td>
                      <td>{row.quantity_initial}</td>
                      <td>{row.arrival_date ?? '—'}</td>
                      <td>{row.shelf_life_days}</td>
                      <td>{row.price_per_unit} ₽</td>
                      <td>{row.remaining_quantity}</td>
                      <td>{row.days_left != null ? row.days_left : '—'}</td>
                      <td>{row.sold_quantity} / {row.sold_amount.toFixed(0)} ₽</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-sm btn-secondary"
                          onClick={() => handleDeleteReceptionItem(row.id)}
                        >
                          Удалить
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {selectedReception.items.length === 0 && (
                <p className="empty-text">Нет позиций. Нажмите «Добавить позицию».</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
