import { useEffect, useState } from 'react';
import {
  getReceptions,
  getReceptionInventory,
  inventoryCheck,
  inventoryApply,
  getGlobalInventory,
  globalInventoryCheck,
  globalInventoryApply,
  type ReceptionBrief,
  type InventoryItem,
  type GlobalInventoryItem,
  type GlobalInventoryCheckLine,
} from '../../api/sellerClient';
import './SellerInventory.css';

type InventoryMode = 'reception' | 'global';

export function SellerInventory() {
  const [mode, setMode] = useState<InventoryMode>('global');
  // --- Reception mode state ---
  const [receptions, setReceptions] = useState<ReceptionBrief[]>([]);
  const [selectedReceptionId, setSelectedReceptionId] = useState<number | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [actualQty, setActualQty] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [checkResult, setCheckResult] = useState<{
    lines: { reception_item_id: number; flower_name: string; system_quantity: number; actual_quantity: number; difference: number; loss_amount: number }[];
    total_loss: number;
  } | null>(null);
  const [applySubmitting, setApplySubmitting] = useState(false);

  // --- Global mode state ---
  const [globalItems, setGlobalItems] = useState<GlobalInventoryItem[]>([]);
  const [globalActualQty, setGlobalActualQty] = useState<Record<number, string>>({});
  const [globalCheckResult, setGlobalCheckResult] = useState<{
    lines: GlobalInventoryCheckLine[];
    total_loss: number;
  } | null>(null);

  const loadReceptions = async () => {
    try {
      const data = await getReceptions();
      setReceptions(data || []);
    } catch {
      setReceptions([]);
    }
  };

  const loadInventory = async (receptionId: number) => {
    try {
      const data = await getReceptionInventory(receptionId);
      setItems(data.items || []);
      const initial: Record<number, string> = {};
      (data.items || []).forEach((it) => {
        initial[it.id] = String(it.remaining_quantity);
      });
      setActualQty(initial);
      setCheckResult(null);
    } catch {
      setItems([]);
      setActualQty({});
    }
  };

  const loadGlobalInventory = async () => {
    try {
      const data = await getGlobalInventory();
      setGlobalItems(data || []);
      const initial: Record<number, string> = {};
      (data || []).forEach((it) => {
        initial[it.flower_id] = String(it.total_remaining);
      });
      setGlobalActualQty(initial);
      setGlobalCheckResult(null);
    } catch {
      setGlobalItems([]);
      setGlobalActualQty({});
    }
  };

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      await loadReceptions();
      if (mode === 'global') {
        await loadGlobalInventory();
      }
      setLoading(false);
    };
    run();
  }, []);

  useEffect(() => {
    if (mode === 'global') {
      loadGlobalInventory();
    }
  }, [mode]);

  useEffect(() => {
    if (selectedReceptionId) {
      loadInventory(selectedReceptionId);
    } else {
      setItems([]);
      setActualQty({});
      setCheckResult(null);
    }
  }, [selectedReceptionId]);

  // --- Reception mode handlers ---
  const handleActualChange = (itemId: number, value: string) => {
    setActualQty((p) => ({ ...p, [itemId]: value }));
  };

  const getCheckLines = () =>
    items.map((it) => ({
      reception_item_id: it.id,
      actual_quantity: parseInt(actualQty[it.id] ?? '', 10) || 0,
    }));

  const handleCheck = async () => {
    if (!selectedReceptionId) return;
    try {
      const result = await inventoryCheck(selectedReceptionId, getCheckLines());
      setCheckResult(result);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка');
    }
  };

  const handleApply = async () => {
    if (!selectedReceptionId || !checkResult) return;
    if (!confirm('Остатки в системе будут приведены в соответствие с введёнными. Продолжить?')) return;
    setApplySubmitting(true);
    try {
      await inventoryApply(selectedReceptionId, getCheckLines());
      setCheckResult(null);
      await loadInventory(selectedReceptionId);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setApplySubmitting(false);
    }
  };

  // --- Global mode handlers ---
  const handleGlobalActualChange = (flowerId: number, value: string) => {
    setGlobalActualQty((p) => ({ ...p, [flowerId]: value }));
  };

  const getGlobalCheckLines = () =>
    globalItems.map((it) => ({
      flower_id: it.flower_id,
      actual_quantity: parseInt(globalActualQty[it.flower_id] ?? '', 10) || 0,
    }));

  const handleGlobalCheck = async () => {
    try {
      const result = await globalInventoryCheck(getGlobalCheckLines());
      setGlobalCheckResult(result);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка');
    }
  };

  const handleGlobalApply = async () => {
    if (!globalCheckResult) return;
    if (!confirm('Остатки по всем открытым приёмкам будут обновлены. Продолжить?')) return;
    setApplySubmitting(true);
    try {
      await globalInventoryApply(getGlobalCheckLines());
      setGlobalCheckResult(null);
      await loadGlobalInventory();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setApplySubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="seller-inventory-loading">
        <div className="loader" />
      </div>
    );
  }

  return (
    <div className="seller-inventory-page">
      <h1 className="page-title">Инвентаризация</h1>

      <div className="orders-tabs" style={{ marginBottom: '1rem' }}>
        <button
          className={`orders-tab ${mode === 'global' ? 'active' : ''}`}
          onClick={() => setMode('global')}
        >
          Общая
        </button>
        <button
          className={`orders-tab ${mode === 'reception' ? 'active' : ''}`}
          onClick={() => setMode('reception')}
        >
          По приёмке
        </button>
      </div>

      {mode === 'reception' && (
        <>
          <p className="section-hint">Выберите приёмку и введите фактические остатки для сверки.</p>

          <div className="form-group">
            <label>Приёмка</label>
            <select
              value={selectedReceptionId ?? ''}
              onChange={(e) => setSelectedReceptionId(e.target.value ? Number(e.target.value) : null)}
              className="form-input"
            >
              <option value="">— выбрать —</option>
              {receptions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} {r.reception_date ? ` (${r.reception_date})` : ''}
                </option>
              ))}
            </select>
          </div>

          {selectedReceptionId && items.length > 0 && (
            <>
              <div className="card inventory-table-wrap">
                <table className="inventory-table">
                  <thead>
                    <tr>
                      <th>Название</th>
                      <th>Система (остаток)</th>
                      <th>Факт</th>
                      <th>Расхождение</th>
                      <th>Убыток (₽)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => {
                      const actual = parseInt(actualQty[it.id] ?? '', 10) || 0;
                      const diff = actual - it.remaining_quantity;
                      const loss = diff < 0 ? Math.abs(diff) * it.price_per_unit : 0;
                      return (
                        <tr key={it.id}>
                          <td>{it.flower_name}</td>
                          <td>{it.remaining_quantity}</td>
                          <td>
                            <input
                              type="number"
                              min={0}
                              value={actualQty[it.id] ?? ''}
                              onChange={(e) => handleActualChange(it.id, e.target.value)}
                              className="form-input input-sm"
                            />
                          </td>
                          <td>{diff !== 0 ? diff : '—'}</td>
                          <td>{loss > 0 ? loss.toFixed(0) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <button type="button" className="btn btn-primary" onClick={handleCheck}>
                Сверить
              </button>

              {checkResult && (
                <div className="card check-result">
                  <h3>Результат сверки</h3>
                  <p className="total-loss">
                    Сумма убытка: <strong>{checkResult.total_loss.toFixed(0)} ₽</strong>
                  </p>
                  <table className="inventory-table">
                    <thead>
                      <tr>
                        <th>Цветок</th>
                        <th>Система</th>
                        <th>Факт</th>
                        <th>Разница</th>
                        <th>Убыток (₽)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {checkResult.lines.map((line) => (
                        <tr key={line.reception_item_id}>
                          <td>{line.flower_name}</td>
                          <td>{line.system_quantity}</td>
                          <td>{line.actual_quantity}</td>
                          <td>{line.difference}</td>
                          <td>{line.loss_amount > 0 ? line.loss_amount.toFixed(0) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="section-hint">После применения остатки в системе будут обновлены в соответствии с введёнными значениями.</p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleApply}
                    disabled={applySubmitting}
                  >
                    {applySubmitting ? 'Применение…' : 'Применить остатки'}
                  </button>
                </div>
              )}
            </>
          )}

          {selectedReceptionId && items.length === 0 && (
            <p className="empty-text">В этой приёмке нет позиций для сверки.</p>
          )}
        </>
      )}

      {mode === 'global' && (
        <>
          <p className="section-hint">Все цветы в наличии по всем открытым приёмкам, сгруппированные по названию. Введите фактические остатки.</p>

          {globalItems.length === 0 ? (
            <p className="empty-text">Нет цветов в открытых приёмках.</p>
          ) : (
            <>
              <div className="card inventory-table-wrap">
                <table className="inventory-table">
                  <thead>
                    <tr>
                      <th>Цветок</th>
                      <th>Система (суммарно)</th>
                      <th>Ср. цена (₽)</th>
                      <th>Факт</th>
                      <th>Расхождение</th>
                      <th>Убыток (₽)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {globalItems.map((it) => {
                      const actual = parseInt(globalActualQty[it.flower_id] ?? '', 10) || 0;
                      const diff = actual - it.total_remaining;
                      const loss = diff < 0 ? Math.abs(diff) * it.avg_price : 0;
                      return (
                        <tr key={it.flower_id}>
                          <td>{it.flower_name}</td>
                          <td>{it.total_remaining}</td>
                          <td>{it.avg_price.toFixed(0)}</td>
                          <td>
                            <input
                              type="number"
                              min={0}
                              value={globalActualQty[it.flower_id] ?? ''}
                              onChange={(e) => handleGlobalActualChange(it.flower_id, e.target.value)}
                              className="form-input input-sm"
                            />
                          </td>
                          <td>{diff !== 0 ? diff : '—'}</td>
                          <td>{loss > 0 ? loss.toFixed(0) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <button type="button" className="btn btn-primary" onClick={handleGlobalCheck}>
                Сверить
              </button>

              {globalCheckResult && (
                <div className="card check-result">
                  <h3>Результат сверки</h3>
                  <p className="total-loss">
                    Сумма убытка: <strong>{globalCheckResult.total_loss.toFixed(0)} ₽</strong>
                  </p>
                  <table className="inventory-table">
                    <thead>
                      <tr>
                        <th>Цветок</th>
                        <th>Система</th>
                        <th>Факт</th>
                        <th>Разница</th>
                        <th>Убыток (₽)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {globalCheckResult.lines.map((line) => (
                        <tr key={line.flower_id}>
                          <td>{line.flower_name}</td>
                          <td>{line.system_quantity}</td>
                          <td>{line.actual_quantity}</td>
                          <td>{line.difference}</td>
                          <td>{line.loss_amount > 0 ? line.loss_amount.toFixed(0) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="section-hint">Остатки по открытым приёмкам будут обновлены. При недостаче — сначала уменьшаются новые партии.</p>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleGlobalApply}
                    disabled={applySubmitting}
                  >
                    {applySubmitting ? 'Применение…' : 'Применить остатки'}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
