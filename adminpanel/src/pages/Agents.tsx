import { useEffect, useState } from 'react';
import {
  getAllAgents,
  searchAgents,
  removeAgentStatus,
  setAgentBalance,
  getAgentReferrals,
} from '../api/adminClient';
import type { Agent } from '../types';
import './Agents.css';

export function Agents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Agent | null>(null);
  const [referrals, setReferrals] = useState<unknown[]>([]);

  const loadAgents = async () => {
    setLoading(true);
    try {
      const list = query.trim()
        ? await searchAgents(query.trim())
        : await getAllAgents();
      setAgents(Array.isArray(list) ? list : []);
    } catch {
      setAgents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAgents();
  }, []);

  const handleSearch = () => loadAgents();

  const openAgent = async (agent: Agent) => {
    setSelected(agent);
    try {
      const refs = await getAgentReferrals(agent.tg_id);
      setReferrals(Array.isArray(refs) ? refs : []);
    } catch {
      setReferrals([]);
    }
  };

  return (
    <div className="agents-page">
      <h1 className="page-title">Посредники (агенты)</h1>

      <div className="search-bar card">
        <input
          type="text"
          className="form-input"
          placeholder="Поиск по ФИО или ID..."
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
                <th>ID</th>
                <th>Баланс</th>
                <th>Рефералов</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.tg_id}>
                  <td>{a.fio || '—'}</td>
                  <td><code>{a.tg_id}</code></td>
                  <td>{a.balance?.toLocaleString('ru') ?? 0} ₽</td>
                  <td>{a.referrals_count ?? 0}</td>
                  <td>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => openAgent(a)}
                    >
                      Подробнее
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {agents.length === 0 && (
            <p className="empty-text">Агенты не найдены</p>
          )}
        </div>
      )}

      {selected && (
        <AgentDetailModal
          agent={selected}
          referrals={referrals}
          onClose={() => setSelected(null)}
          onSuccess={() => {
            setSelected(null);
            loadAgents();
          }}
        />
      )}
    </div>
  );
}

function AgentDetailModal({
  agent,
  referrals,
  onClose,
  onSuccess,
}: {
  agent: Agent;
  referrals: unknown[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [newBalance, setNewBalance] = useState(String(agent.balance ?? 0));
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);

  const handleSetBalance = async () => {
    setLoading(true);
    setMsg('');
    try {
      const res = await setAgentBalance(agent.tg_id, parseFloat(newBalance) || 0);
      if (res?.status === 'ok') {
        setMsg('Баланс обновлён');
        setTimeout(() => onSuccess(), 500);
      } else {
        setMsg((res as { message?: string })?.message || 'Ошибка');
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveAgent = async () => {
    if (!confirmRemove) {
      setConfirmRemove(true);
      setMsg('Нажмите ещё раз для подтверждения');
      return;
    }
    setLoading(true);
    setMsg('');
    try {
      const res = await removeAgentStatus(agent.tg_id);
      if (res?.status === 'ok') {
        onSuccess();
      } else {
        const r = res as { message?: string; status?: string };
        setMsg(r?.message || r?.status || 'Ошибка');
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Агент: {agent.fio || agent.tg_id}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="agent-info">
            <p><strong>Telegram ID:</strong> {agent.tg_id}</p>
            <p><strong>Телефон:</strong> {agent.phone || '—'}</p>
            <p><strong>Баланс:</strong> {agent.balance?.toLocaleString('ru') ?? 0} ₽</p>
            <p><strong>Рефералов:</strong> {agent.referrals_count ?? 0}</p>
          </div>

          <div className="form-group">
            <label className="form-label">Установить баланс</label>
            <div className="input-row">
              <input
                type="number"
                step="0.01"
                className="form-input"
                value={newBalance}
                onChange={(e) => setNewBalance(e.target.value)}
              />
              <button
                className="btn btn-primary"
                onClick={handleSetBalance}
                disabled={loading}
              >
                Сохранить
              </button>
            </div>
          </div>

          <div className="manage-actions">
            <button
              className="btn btn-danger"
              onClick={handleRemoveAgent}
              disabled={loading}
            >
              {confirmRemove ? 'Подтвердить снятие статуса' : 'Снять статус агента'}
            </button>
          </div>

          {referrals.length > 0 && (
            <div className="referrals-section">
              <h4>Рефералы</h4>
              <ul className="referrals-list">
                {referrals.map((r: unknown, i) => (
                  <li key={i}>
                    {typeof r === 'object' && r !== null && 'tg_id' in r
                      ? `ID: ${(r as { tg_id?: number }).tg_id}`
                      : JSON.stringify(r)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {msg && <div className="modal-error">{msg}</div>}
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={onClose}>Закрыть</button>
          </div>
        </div>
      </div>
    </div>
  );
}
