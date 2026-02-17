import { TabBar, PageHeader } from '../../components/ui';
import { useTabs } from '../../hooks/useTabs';
import { SellerShop } from './SellerShop';
import { SellerProfile } from './SellerProfile';
import { SellerSecurity } from './SellerSecurity';

const TABS = [
  { key: 'shop', label: 'Магазин' },
  { key: 'limits', label: 'Лимиты' },
  { key: 'preorders', label: 'Предзаказы' },
  { key: 'account', label: 'Аккаунт' },
];

/**
 * SellerSettings — unified settings page.
 * Phase 1: wraps existing pages as tabs.
 * Phase 2 (later): decompose SellerShop into separate tab-content components.
 */
export function SellerSettings() {
  const [tab, setTab] = useTabs('shop');

  return (
    <div>
      <PageHeader title="Настройки" subtitle="Магазин, лимиты, предзаказы и аккаунт" />
      <TabBar tabs={TABS} activeTab={tab} onChange={setTab} />
      {/* For now, shop/limits/preorders all render SellerShop (it has all 3 sections).
          Account tab shows profile + security side by side. */}
      {(tab === 'shop' || tab === 'limits' || tab === 'preorders') && <SellerShop />}
      {tab === 'account' && (
        <div>
          <SellerProfile />
          <SellerSecurity />
        </div>
      )}
    </div>
  );
}
