import { useState } from 'react';
import { TabBar, PageHeader } from '@shared/components/ui';
import { useTabs } from '@shared/hooks/useTabs';
import { useSellerAuth } from '../../contexts/SellerAuthContext';
import { CustomerList } from './customers/CustomerList';
import { SubscribersTab } from './customers/SubscribersTab';
import { LoyaltySettingsTab } from './customers/LoyaltySettingsTab';
import { AddCustomerTab } from './customers/AddCustomerTab';

const ALL_TABS = [
  { key: 'crm', label: 'Клиенты' },
  { key: 'add', label: '+ Клиент' },
  { key: 'subscribers', label: 'Подписчики' },
  { key: 'loyalty', label: 'Настройки лояльности' },
];

export function SellerCustomerHub() {
  const { isNetworkOwner, branches } = useSellerAuth();
  const [tab, setTab] = useTabs('crm');
  const [branch, setBranch] = useState<string>('all');

  const branchParam = isNetworkOwner ? branch : undefined;

  return (
    <div>
      <PageHeader
        title="Клиенты"
        subtitle="CRM, подписчики и лояльность"
        actions={
          isNetworkOwner && (tab === 'crm' || tab === 'subscribers') ? (
            <select
              className="form-input form-input-sm"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              style={{ minWidth: 160 }}
            >
              <option value="all">Все филиалы</option>
              {branches.map((b) => (
                <option key={b.seller_id} value={String(b.seller_id)}>
                  {b.shop_name || `Филиал #${b.seller_id}`}
                </option>
              ))}
            </select>
          ) : undefined
        }
      />
      <TabBar tabs={ALL_TABS} activeTab={tab} onChange={setTab} />
      {tab === 'crm' && <CustomerList branch={branchParam} />}
      {tab === 'add' && <AddCustomerTab />}
      {tab === 'subscribers' && <SubscribersTab branch={branchParam} />}
      {tab === 'loyalty' && <LoyaltySettingsTab />}
    </div>
  );
}
