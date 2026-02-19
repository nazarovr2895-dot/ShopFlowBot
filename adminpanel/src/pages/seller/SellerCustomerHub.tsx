import { TabBar, PageHeader } from '../../components/ui';
import { useTabs } from '../../hooks/useTabs';
import { SellerCustomers } from './SellerCustomers';
import { SellerSubscribers } from './SellerSubscribers';
import { LoyaltySettingsTab } from './LoyaltySettingsTab';

const TABS = [
  { key: 'crm', label: 'Клиенты' },
  { key: 'subscribers', label: 'Подписчики' },
  { key: 'loyalty', label: 'Настройки лояльности' },
];

export function SellerCustomerHub() {
  const [tab, setTab] = useTabs('crm');

  return (
    <div>
      <PageHeader title="Клиенты" subtitle="CRM, подписчики и лояльность" />
      <TabBar tabs={TABS} activeTab={tab} onChange={setTab} />
      {tab === 'crm' && <SellerCustomers />}
      {tab === 'subscribers' && <SellerSubscribers />}
      {tab === 'loyalty' && <LoyaltySettingsTab />}
    </div>
  );
}
