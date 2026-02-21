import { useEffect, useState, useCallback } from 'react';
import { TabBar, PageHeader } from '../../components/ui';
import { useTabs } from '../../hooks/useTabs';
import { getMe } from '../../api/sellerClient';
import type { SellerMe } from '../../api/sellerClient';
import { ShopSettingsTab } from './settings/ShopSettingsTab';
import { HashtagsSettingsTab } from './settings/HashtagsSettingsTab';
import { LimitsSettingsTab } from './settings/LimitsSettingsTab';
import { WorkingHoursSettingsTab } from './settings/WorkingHoursSettingsTab';
import { PreordersSettingsTab } from './settings/PreordersSettingsTab';
import { AccountSettingsTab } from './settings/AccountSettingsTab';
import { PaymentSettingsTab } from './settings/PaymentSettingsTab';

const TABS = [
  { key: 'shop', label: 'Магазин' },
  { key: 'hashtags', label: 'Хештеги' },
  { key: 'limits', label: 'Лимиты' },
  { key: 'hours', label: 'Время работы' },
  { key: 'preorders', label: 'Предзаказы' },
  { key: 'payment', label: 'ЮКасса' },
  { key: 'account', label: 'Аккаунт' },
];

/**
 * SellerSettings — unified settings page with 5 tabs.
 * Shared data loading: single getMe() call, passed to all tabs via props.
 */
export function SellerSettings() {
  const [tab, setTab] = useTabs('shop');
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
      <TabBar tabs={TABS} activeTab={tab} onChange={setTab} />
      {tab === 'shop' && <ShopSettingsTab me={me} reload={reload} />}
      {tab === 'hashtags' && <HashtagsSettingsTab me={me} reload={reload} />}
      {tab === 'limits' && <LimitsSettingsTab me={me} reload={reload} />}
      {tab === 'hours' && <WorkingHoursSettingsTab me={me} reload={reload} />}
      {tab === 'preorders' && <PreordersSettingsTab me={me} reload={reload} />}
      {tab === 'payment' && <PaymentSettingsTab me={me} reload={reload} />}
      {tab === 'account' && <AccountSettingsTab me={me} />}
    </div>
  );
}
