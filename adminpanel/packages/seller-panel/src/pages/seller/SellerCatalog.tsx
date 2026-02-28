import { TabBar } from '@shared/components/ui';
import { PageHeader } from '@shared/components/ui';
import { useTabs } from '@shared/hooks/useTabs';
import { SellerShowcase } from './SellerShowcase';
import { SellerBouquets } from './SellerBouquets';

const TABS = [
  { key: 'showcase', label: 'Витрина' },
  { key: 'bouquets', label: 'Букеты' },
];

export function SellerCatalog() {
  const [tab, setTab] = useTabs('showcase');

  return (
    <div>
      <PageHeader title="Каталог" subtitle="Товары и конструктор букетов" />
      <TabBar tabs={TABS} activeTab={tab} onChange={setTab} />
      {tab === 'showcase' && <SellerShowcase />}
      {tab === 'bouquets' && <SellerBouquets />}
    </div>
  );
}
