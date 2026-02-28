import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getBranches, createBranch, deleteBranch } from '../../api/sellerClient';
import type { BranchDetail } from '../../api/sellerClient';
import { useToast } from '../../components/ui';
import { GitBranch, Plus, Trash2, MapPin } from 'lucide-react';

export function SellerBranches() {
  const { sellerId, switchBranch } = useAuth();
  const toast = useToast();
  const [branches, setBranches] = useState<BranchDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newBranch, setNewBranch] = useState({ shop_name: '', address_name: '' });

  const load = useCallback(async () => {
    try {
      const data = await getBranches();
      setBranches(data);
    } catch {
      toast.error('Не удалось загрузить филиалы');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!newBranch.shop_name.trim()) {
      toast.error('Укажите название филиала');
      return;
    }
    setAdding(true);
    try {
      await createBranch(newBranch);
      toast.success('Филиал создан');
      setShowAdd(false);
      setNewBranch({ shop_name: '', address_name: '' });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка создания');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (branchId: number) => {
    if (!confirm('Удалить этот филиал? Все товары и заказы филиала останутся в базе.')) return;
    try {
      await deleteBranch(branchId);
      toast.success('Филиал удалён');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка удаления');
    }
  };

  if (loading) {
    return (
      <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
        <div className="loader" />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
          <GitBranch size={22} /> Филиалы
        </h1>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Plus size={16} /> Добавить
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.75rem' }}>Новый филиал</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <input
              type="text"
              placeholder="Название филиала"
              value={newBranch.shop_name}
              onChange={e => setNewBranch(b => ({ ...b, shop_name: e.target.value }))}
              style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border, #e5e7eb)' }}
            />
            <input
              type="text"
              placeholder="Адрес (необязательно)"
              value={newBranch.address_name}
              onChange={e => setNewBranch(b => ({ ...b, address_name: e.target.value }))}
              style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border, #e5e7eb)' }}
            />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-primary" onClick={handleAdd} disabled={adding}>
                {adding ? 'Создание...' : 'Создать'}
              </button>
              <button className="btn" onClick={() => setShowAdd(false)}>Отмена</button>
            </div>
          </div>
        </div>
      )}

      {/* Branches list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {branches.map(b => (
          <div
            key={b.seller_id}
            className="card"
            style={{
              padding: '1rem 1.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              border: b.seller_id === sellerId ? '2px solid var(--primary, #6366f1)' : undefined,
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                {b.shop_name || `Филиал #${b.seller_id}`}
                {b.seller_id === sellerId && (
                  <span style={{ fontSize: '0.7rem', color: 'var(--primary, #6366f1)', marginLeft: '0.5rem', fontWeight: 500 }}>
                    (текущий)
                  </span>
                )}
              </div>
              {b.address_name && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  <MapPin size={12} /> {b.address_name}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {b.seller_id !== sellerId && (
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
                  title="Удалить филиал"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {branches.length === 0 && (
        <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Нет филиалов
        </div>
      )}
    </div>
  );
}
