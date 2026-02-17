import { TabBar, PageHeader } from '../../components/ui';
import { useTabs } from '../../hooks/useTabs';
import { Stats } from '../Stats';
import { StatsSellers } from '../StatsSellers';

const TABS = [
  { key: 'overview', label: 'Обзор' },
  { key: 'sellers', label: 'По продавцам' },
];

export function AdminAnalytics() {
  const [tab, setTab] = useTabs('overview');

  return (
    <div>
      <PageHeader title="Аналитика" subtitle="Статистика платформы" />
      <TabBar tabs={TABS} activeTab={tab} onChange={setTab} />
      {tab === 'overview' && <Stats />}
      {tab === 'sellers' && <StatsSellers />}
    </div>
  );
}
