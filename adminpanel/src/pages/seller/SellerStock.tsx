import { TabBar } from '../../components/ui';
import { PageHeader } from '../../components/ui';
import { useTabs } from '../../hooks/useTabs';
import { SellerReceptions } from './SellerReceptions';
import { SellerInventory } from './SellerInventory';
import { SellerWasteReport } from './SellerWasteReport';

const TABS = [
  { key: 'receptions', label: 'Приёмка' },
  { key: 'inventory', label: 'Инвентаризация' },
  { key: 'writeoffs', label: 'Списания' },
];

export function SellerStock() {
  const [tab, setTab] = useTabs('receptions');

  return (
    <div>
      <PageHeader title="Склад" subtitle="Приёмка, инвентаризация и списания" />
      <TabBar tabs={TABS} activeTab={tab} onChange={setTab} />
      {tab === 'receptions' && <SellerReceptions />}
      {tab === 'inventory' && <SellerInventory />}
      {tab === 'writeoffs' && <SellerWasteReport />}
    </div>
  );
}
