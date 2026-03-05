import { TabBar } from '@shared/components/ui';
import { PageHeader } from '@shared/components/ui';
import { useTabs } from '@shared/hooks/useTabs';
import { SellerShowcase } from './SellerShowcase';
import { SellerBouquets } from './SellerBouquets';
import { SellerAddons } from './SellerAddons';

const TABS = [
  { key: 'showcase', label: 'Витрина' },
  { key: 'bouquets', label: 'Букеты' },
  { key: 'addons', label: 'К цветам' },
];

export function SellerCatalog() {
  const [tab, setTab] = useTabs('showcase');

  return (
    <div>
      <PageHeader title="Каталог" subtitle="Товары и конструктор букетов" />
      <TabBar tabs={TABS} activeTab={tab} onChange={setTab} />
      {tab === 'showcase' && <SellerShowcase />}
      {tab === 'bouquets' && <SellerBouquets />}
      {tab === 'addons' && <SellerAddons />}
    </div>
  );
}
