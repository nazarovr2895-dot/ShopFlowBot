import { useEffect, useState, useCallback, useMemo } from 'react';
import { TabBar, PageHeader } from '../../components/ui';
import { useTabs } from '../../hooks/useTabs';
import { useAuth } from '../../contexts/AuthContext';
import { getMe } from '../../api/sellerClient';
import type { SellerMe } from '../../api/sellerClient';
import { ShopSettingsTab } from './settings/ShopSettingsTab';
import { HashtagsSettingsTab } from './settings/HashtagsSettingsTab';
import { LimitsSettingsTab } from './settings/LimitsSettingsTab';
import { WorkingHoursSettingsTab } from './settings/WorkingHoursSettingsTab';
import { PreordersSettingsTab } from './settings/PreordersSettingsTab';
import { AccountSettingsTab } from './settings/AccountSettingsTab';
import { PaymentSettingsTab } from './settings/PaymentSettingsTab';
import { SubscriptionSettingsTab } from './settings/SubscriptionSettingsTab';
import { LegalSettingsTab } from './settings/LegalSettingsTab';
import { DeliveryZonesSettingsTab } from './settings/DeliveryZonesSettingsTab';

const ALL_TABS = [
  { key: 'shop', label: 'Магазин' },
  { key: 'delivery', label: 'Доставка' },
  { key: 'hashtags', label: 'Хештеги' },
  { key: 'limits', label: 'Лимиты' },
  { key: 'hours', label: 'Время работы' },
  { key: 'preorders', label: 'Предзаказы' },
  { key: 'subscription', label: 'Подписка' },
  { key: 'payment', label: 'ЮКасса' },
  { key: 'account', label: 'Аккаунт' },
  { key: 'legal', label: 'Документы' },
];

const NETWORK_OWNER_TABS = [
  { key: 'subscription', label: 'Подписка' },
  { key: 'payment', label: 'ЮКасса' },
  { key: 'legal', label: 'Документы' },
  { key: 'account', label: 'Аккаунт' },
];

/**
 * SellerSettings — unified settings page with tabs.
 * Shared data loading: single getMe() call, passed to all tabs via props.
 */
export function SellerSettings() {
  const { isNetworkOwner } = useAuth();
  const tabs = useMemo(() => isNetworkOwner ? NETWORK_OWNER_TABS : ALL_TABS, [isNetworkOwner]);
  const [tab, setTab] = useTabs(isNetworkOwner ? 'subscription' : 'shop');
  const [me, setMe] = useState<SellerMe | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const data = await getMe();
      setMe(data);
    } catch {
      setMe(null);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    reload().finally(() => setLoading(false));
  }, [reload]);

  if (loading) {
    return (
      <div>
        <PageHeader title="Настройки" subtitle="Магазин, хештеги, лимиты, время работы, предзаказы, ЮКасса и аккаунт" />
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <div className="loader" />
        </div>
      </div>
    );
  }

  if (!me) {
    return (
      <div>
        <PageHeader title="Настройки" subtitle="Магазин, хештеги, лимиты, время работы, предзаказы, ЮКасса и аккаунт" />
        <div className="card">
          <p className="empty-text">Не удалось загрузить данные. Попробуйте обновить страницу.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Настройки" subtitle="Магазин, хештеги, лимиты, время работы, предзаказы, ЮКасса и аккаунт" />
      <TabBar tabs={tabs} activeTab={tab} onChange={setTab} />
      {tab === 'shop' && <ShopSettingsTab me={me} reload={reload} />}
      {tab === 'delivery' && <DeliveryZonesSettingsTab me={me} reload={reload} />}
      {tab === 'hashtags' && <HashtagsSettingsTab me={me} reload={reload} />}
      {tab === 'limits' && <LimitsSettingsTab me={me} reload={reload} />}
      {tab === 'hours' && <WorkingHoursSettingsTab me={me} reload={reload} />}
      {tab === 'preorders' && <PreordersSettingsTab me={me} reload={reload} />}
      {tab === 'subscription' && <SubscriptionSettingsTab me={me} reload={reload} />}
      {tab === 'payment' && <PaymentSettingsTab me={me} reload={reload} />}
      {tab === 'account' && <AccountSettingsTab me={me} />}
      {tab === 'legal' && <LegalSettingsTab />}
    </div>
  );
}
