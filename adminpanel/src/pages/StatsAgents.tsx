import { useEffect, useState } from 'react';
import { getAgentsStats } from '../api/adminClient';
import type { AgentStats } from '../types';
import './Stats.css';

export function StatsAgents() {
  const [agentStats, setAgentStats] = useState<AgentStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const agents = await getAgentsStats();
        setAgentStats(agents || []);
      } catch {
        setAgentStats([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="stats-loading">
        <div className="loader" />
      </div>
    );
  }

  return (
    <div className="stats-page">
      <h1 className="page-title">Статистика по агентам</h1>

      <div className="card table-wrap">
        <h3>Статистика по агентам</h3>
        <table className="table">
          <thead>
            <tr>
              <th>ФИО</th>
              <th>Заказов</th>
              <th>Оборот</th>
            </tr>
          </thead>
          <tbody>
            {agentStats.map((s) => (
              <tr key={s.fio}>
                <td>{s.fio}</td>
                <td>{s.orders_count}</td>
                <td>{s.total_sales.toLocaleString('ru')} ₽</td>
              </tr>
            ))}
          </tbody>
        </table>
        {agentStats.length === 0 && <p className="empty-text">Нет данных</p>}
      </div>
    </div>
  );
}
