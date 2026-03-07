import { TabBar, PageHeader } from '@shared/components/ui';
import { useTabs } from '@shared/hooks/useTabs';
import { Stats } from '../Stats';
import { StatsSellers } from '../StatsSellers';
import { AdminVisitorStats } from './AdminVisitorStats';

const TABS = [
  { key: 'overview', label: 'Обзор' },
  { key: 'sellers', label: 'По продавцам' },
  { key: 'visitors', label: 'Посещаемость' },
];

export function AdminAnalytics() {
  const [tab, setTab] = useTabs('overview');

  return (
    <div>
      <PageHeader title="Аналитика" subtitle="Статистика платформы" />
      <TabBar tabs={TABS} activeTab={tab} onChange={setTab} />
      {tab === 'overview' && <Stats />}
      {tab === 'sellers' && <StatsSellers />}
      {tab === 'visitors' && <AdminVisitorStats />}
    </div>
  );
}
