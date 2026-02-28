import { useMemo } from 'react';
import { TabBar, PageHeader } from '@shared/components/ui';
import { useTabs } from '@shared/hooks/useTabs';
import { useSellerAuth } from '../../contexts/SellerAuthContext';
import { SellerCustomers } from './SellerCustomers';
import { SellerSubscribers } from './SellerSubscribers';
import { LoyaltySettingsTab } from './LoyaltySettingsTab';
import { AddCustomerTab } from './AddCustomerTab';

const ALL_TABS = [
  { key: 'crm', label: 'Клиенты' },
  { key: 'add', label: '+ Клиент' },
  { key: 'subscribers', label: 'Подписчики' },
  { key: 'loyalty', label: 'Настройки лояльности' },
];

const NETWORK_OWNER_TABS = [
  { key: 'subscribers', label: 'Подписчики' },
  { key: 'loyalty', label: 'Настройки лояльности' },
];

export function SellerCustomerHub() {
  const { isNetworkOwner } = useSellerAuth();
  const tabs = useMemo(() => isNetworkOwner ? NETWORK_OWNER_TABS : ALL_TABS, [isNetworkOwner]);
  const [tab, setTab] = useTabs(isNetworkOwner ? 'subscribers' : 'crm');

  return (
    <div>
      <PageHeader title="Клиенты" subtitle="CRM, подписчики и лояльность" />
      <TabBar tabs={tabs} activeTab={tab} onChange={setTab} />
      {tab === 'crm' && <SellerCustomers />}
      {tab === 'add' && <AddCustomerTab />}
      {tab === 'subscribers' && <SellerSubscribers />}
      {tab === 'loyalty' && <LoyaltySettingsTab />}
    </div>
  );
}
