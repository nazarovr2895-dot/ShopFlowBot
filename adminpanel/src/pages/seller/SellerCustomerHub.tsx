import { TabBar } from '../../components/ui';
import { PageHeader } from '../../components/ui';
import { useTabs } from '../../hooks/useTabs';
import { SellerCustomers } from './SellerCustomers';
import { SellerSubscribers } from './SellerSubscribers';

const TABS = [
  { key: 'crm', label: 'CRM' },
  { key: 'subscribers', label: 'Подписчики' },
];

export function SellerCustomerHub() {
  const [tab, setTab] = useTabs('crm');

  return (
    <div>
      <PageHeader title="Клиенты" subtitle="CRM и подписчики" />
      <TabBar tabs={TABS} activeTab={tab} onChange={setTab} />
      {tab === 'crm' && <SellerCustomers />}
      {tab === 'subscribers' && <SellerSubscribers />}
    </div>
  );
}
