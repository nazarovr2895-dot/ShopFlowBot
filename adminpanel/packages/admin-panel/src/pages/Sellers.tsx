import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/ui';
import { Plus } from 'lucide-react';
import {
  searchSellers,
  getAllSellers,
  type InnData,
} from '../api/adminClient';
import type { Seller } from '../types';
import { formatPlacementExpired, isPlacementExpired } from './sellers/sellerUtils';
import { InnVerificationModal } from './sellers/InnVerificationModal';
import { AddSellerModal } from './sellers/AddSellerModal';
import { SellerDetailsModal } from './sellers/SellerDetailsModal';
import './Sellers.css';


export function Sellers() {
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight');
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [showInnVerification, setShowInnVerification] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedSeller, setSelectedSeller] = useState<Seller | null>(null);
  const [innData, setInnData] = useState<{ data: InnData } | null>(null);

  const loadSellers = async () => {
    setLoading(true);
    try {
      const list = query.trim()
        ? await searchSellers(query.trim())
        : await getAllSellers(true);
      setSellers(list || []);
    } catch {
      setSellers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSellers();
  }, []);

  // Scroll to and highlight seller from URL param
  useEffect(() => {
    if (!highlightId || sellers.length === 0) return;
    const el = document.getElementById(`seller-${highlightId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('seller-row--highlighted');
      const timer = setTimeout(() => el.classList.remove('seller-row--highlighted'), 3000);
      return () => clearTimeout(timer);
    }
  }, [highlightId, sellers]);

  const handleSearch = () => loadSellers();

  return (
    <div className="sellers-page">
      <PageHeader
        title="Продавцы"
        actions={
          <button className="btn btn-primary" onClick={() => setShowInnVerification(true)}>
            <Plus size={16} /> Добавить
          </button>
        }
      />

      <div className="search-bar card">
        <input
          type="text"
          className="form-input"
          placeholder="Поиск по ФИО..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <button className="btn btn-secondary" onClick={handleSearch}>Поиск</button>
      </div>

      {loading ? (
        <div className="loading-row"><div className="loader" /></div>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ФИО</th>
                <th>Магазин</th>
                <th>ID</th>
                <th>Филиалы</th>
                <th>Дата окончания</th>
                <th>Статус</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sellers.map((s) => (
                <tr key={s.tg_id} id={`seller-${s.tg_id}`}>
                  <td>{s.fio}</td>
                  <td>{s.shop_name}</td>
                  <td><code>{s.tg_id}</code></td>
                  <td>
                    {(s.branch_count ?? 1) > 1
                      ? <span className="badge badge-info">{s.branch_count}</span>
                      : '—'}
                  </td>
                  <td>{formatPlacementExpired(s.placement_expired_at)}</td>
                  <td>
                    {s.is_deleted ? (
                      <span className="badge badge-warning">Удалён</span>
                    ) : s.is_blocked ? (
                      <span className="badge badge-danger">Заблокирован</span>
                    ) : isPlacementExpired(s.placement_expired_at) ? (
                      <span className="badge badge-warning">Срок истёк</span>
                    ) : (
                      <span className="badge badge-success">Активен</span>
                    )}
                  </td>
                  <td>
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => setSelectedSeller(s)}
                    >
                      Управление
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {sellers.length === 0 && (
            <p className="empty-text">Продавцы не найдены</p>
          )}
        </div>
      )}

      {showInnVerification && (
        <InnVerificationModal
          onClose={() => {
            setShowInnVerification(false);
            setInnData(null);
          }}
          onNext={(_identifier, data) => {
            setInnData({ data });
            setShowInnVerification(false);
            setShowAdd(true);
          }}
        />
      )}
      {showAdd && (
        <AddSellerModal
          onClose={() => {
            setShowAdd(false);
            setInnData(null);
          }}
          onSuccess={() => {
            setShowAdd(false);
            setInnData(null);
            loadSellers();
          }}
          initialInnData={innData?.data}
        />
      )}
      {selectedSeller && (
        <SellerDetailsModal
          seller={selectedSeller}
          onClose={() => setSelectedSeller(null)}
          onSuccess={() => {
            loadSellers();
          }}
          onUpdate={(updated) => setSelectedSeller(updated)}
        />
      )}
    </div>
  );
}
