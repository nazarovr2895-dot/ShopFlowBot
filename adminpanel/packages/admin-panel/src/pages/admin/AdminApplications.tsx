import { useEffect, useState, useCallback } from 'react';
import { PageHeader } from '@shared/components/ui';
import { formatDateTime, formatPhone } from '@shared/utils/formatters';
import {
  getApplications,
  updateApplicationStatus,
  type SellerApplicationItem,
  type InnData,
} from '../../api/adminClient';
import { AddSellerModal } from '../sellers/AddSellerModal';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import './AdminApplications.css';

const STATUS_LABELS: Record<string, string> = {
  new: 'Новая',
  approved: 'Одобрена',
  rejected: 'Отклонена',
};

const STATUS_CLASSES: Record<string, string> = {
  new: 'badge-warning',
  approved: 'badge-success',
  rejected: 'badge-danger',
};

const FILTER_OPTIONS = [
  { value: '', label: 'Все' },
  { value: 'new', label: 'Новые' },
  { value: 'approved', label: 'Одобренные' },
  { value: 'rejected', label: 'Отклонённые' },
];

export function AdminApplications() {
  const [apps, setApps] = useState<SellerApplicationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  // Данные для открытия AddSellerModal с предзаполнением
  const [sellerModalApp, setSellerModalApp] = useState<SellerApplicationItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getApplications(filter || undefined);
      setApps(data);
    } catch {
      setApps([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const handleStatusChange = async (app: SellerApplicationItem, newStatus: string) => {
    setActionLoading(app.id);
    try {
      await updateApplicationStatus(app.id, newStatus);
      // Обновляем локально
      setApps((prev) =>
        prev.map((a) => (a.id === app.id ? { ...a, status: newStatus, reviewed_at: new Date().toISOString() } : a))
      );
      // При одобрении — открыть форму создания продавца
      if (newStatus === 'approved') {
        setSellerModalApp(app);
      }
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  };

  // Преобразование данных заявки в формат InnData для AddSellerModal
  const buildInnData = (app: SellerApplicationItem): InnData => ({
    inn: app.inn,
    name: app.org_name || app.shop_name,
    short_name: app.org_name || app.shop_name,
    type: app.org_type || 'LEGAL',
    address: app.org_address || '',
    management: app.management_name || undefined,
    state: { status: 'ACTIVE' },
    ogrn: app.ogrn || undefined,
  });

  return (
    <div className="admin-applications">
      <PageHeader title="Заявки на подключение" />

      <div className="admin-applications__filters card">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            className={`btn btn-sm ${filter === opt.value ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading-row"><div className="loader" /></div>
      ) : apps.length === 0 ? (
        <div className="card">
          <p className="empty-text">Заявок нет</p>
        </div>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Магазин</th>
                <th>Организация</th>
                <th>ИНН</th>
                <th>Телефон</th>
                <th>Дата</th>
                <th>Статус</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {apps.map((app) => (
                <tr key={app.id}>
                  <td className="admin-applications__shop-name">{app.shop_name}</td>
                  <td className="admin-applications__org">
                    {app.org_name || <span className="text-muted">—</span>}
                  </td>
                  <td><code>{app.inn}</code></td>
                  <td>{formatPhone(app.phone)}</td>
                  <td className="admin-applications__date">
                    {app.created_at ? formatDateTime(app.created_at) : '—'}
                  </td>
                  <td>
                    <span className={`badge ${STATUS_CLASSES[app.status] || ''}`}>
                      {STATUS_LABELS[app.status] || app.status}
                    </span>
                  </td>
                  <td className="admin-applications__actions">
                    {app.status === 'new' && (
                      <>
                        <button
                          className="btn btn-sm btn-success"
                          onClick={() => handleStatusChange(app, 'approved')}
                          disabled={actionLoading === app.id}
                          title="Одобрить"
                        >
                          {actionLoading === app.id ? (
                            <Loader2 size={14} className="spin" />
                          ) : (
                            <CheckCircle2 size={14} />
                          )}
                          <span>Одобрить</span>
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => handleStatusChange(app, 'rejected')}
                          disabled={actionLoading === app.id}
                          title="Отклонить"
                        >
                          <XCircle size={14} />
                          <span>Отклонить</span>
                        </button>
                      </>
                    )}
                    {app.status === 'approved' && (
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => setSellerModalApp(app)}
                      >
                        Создать продавца
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sellerModalApp && (
        <AddSellerModal
          onClose={() => setSellerModalApp(null)}
          onSuccess={() => {
            setSellerModalApp(null);
            load();
          }}
          initialInnData={buildInnData(sellerModalApp)}
          initialPhone={sellerModalApp.phone}
          initialShopName={sellerModalApp.shop_name}
        />
      )}
    </div>
  );
}
