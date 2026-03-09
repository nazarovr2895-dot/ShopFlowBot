import { useEffect, useState, useCallback, useMemo } from 'react';
import { PageHeader } from '@shared/components/ui';
import { useTabs } from '@shared/hooks/useTabs';
import { useSellerAuth } from '../../contexts/SellerAuthContext';
import { getMe } from '../../api/sellerClient';
import type { SellerMe } from '../../api/sellerClient';
import { Store, Truck, CreditCard, User } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ShopSettingsTab } from './settings/ShopSettingsTab';
import { WorkingHoursSettingsTab } from './settings/WorkingHoursSettingsTab';
import { PreordersSettingsTab } from './settings/PreordersSettingsTab';
import { AccountSettingsTab } from './settings/AccountSettingsTab';
import { PaymentSettingsTab } from './settings/PaymentSettingsTab';
import { SubscriptionSettingsTab } from './settings/SubscriptionSettingsTab';
import { LegalSettingsTab } from './settings/LegalSettingsTab';
import { DeliveryZonesSettingsTab } from './settings/DeliveryZonesSettingsTab';
import { LogoSettingsTab } from './settings/LogoSettingsTab';
import { SocialAboutSettingsTab } from './settings/SocialAboutSettingsTab';
import './SellerSettings.css';

interface SettingsGroup {
  key: string;
  label: string;
  icon: LucideIcon;
  items: { key: string; label: string }[];
}

const ALL_GROUPS: SettingsGroup[] = [
  {
    key: 'store',
    label: 'Магазин',
    icon: Store,
    items: [
      { key: 'shop', label: 'Основные' },
      { key: 'logo', label: 'Медиа' },
      { key: 'about', label: 'О нас' },
    ],
  },
  {
    key: 'delivery',
    label: 'Доставка и расписание',
    icon: Truck,
    items: [
      { key: 'delivery', label: 'Зоны доставки' },
      { key: 'hours', label: 'Время работы' },
      { key: 'preorders', label: 'Предзаказы' },
    ],
  },
  {
    key: 'billing',
    label: 'Оплата и подписка',
    icon: CreditCard,
    items: [
      { key: 'subscription', label: 'Подписка' },
      { key: 'payment', label: 'ЮКасса' },
    ],
  },
  {
    key: 'account',
    label: 'Аккаунт',
    icon: User,
    items: [
      { key: 'account', label: 'Настройки аккаунта' },
      { key: 'legal', label: 'Документы' },
    ],
  },
];

const NETWORK_OWNER_GROUPS: SettingsGroup[] = [
  {
    key: 'billing',
    label: 'Оплата и подписка',
    icon: CreditCard,
    items: [
      { key: 'subscription', label: 'Подписка' },
      { key: 'payment', label: 'ЮКасса' },
    ],
  },
  {
    key: 'account',
    label: 'Аккаунт',
    icon: User,
    items: [
      { key: 'account', label: 'Настройки аккаунта' },
      { key: 'legal', label: 'Документы' },
    ],
  },
];

export function SellerSettings() {
  const { isNetworkOwner, isNetwork, isPrimary } = useSellerAuth();

  const groups = useMemo(() => {
    if (isNetworkOwner) return NETWORK_OWNER_GROUPS;
    if (isNetwork && !isPrimary) {
      // Branch accounts: hide subscription and payment
      return ALL_GROUPS
        .map((g) => ({
          ...g,
          items: g.items.filter((i) => i.key !== 'subscription' && i.key !== 'payment'),
        }))
        .filter((g) => g.items.length > 0);
    }
    return ALL_GROUPS;
  }, [isNetworkOwner, isNetwork, isPrimary]);

  const defaultTab = isNetworkOwner ? 'subscription' : 'shop';
  const [tab, setTab] = useTabs(defaultTab);
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
        <PageHeader title="Настройки" />
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <div className="loader" />
        </div>
      </div>
    );
  }

  if (!me) {
    return (
      <div>
        <PageHeader title="Настройки" />
        <div className="card">
          <p className="empty-text">Не удалось загрузить данные. Попробуйте обновить страницу.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <PageHeader title="Настройки" />

      <div className="settings-layout">
        {/* Sidebar nav */}
        <nav className="settings-nav">
          {groups.map((group) => (
            <div key={group.key} className="settings-nav-group">
              <div className="settings-nav-group-label">
                <group.icon size={14} />
                <span>{group.label}</span>
              </div>
              {group.items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`settings-nav-item${tab === item.key ? ' settings-nav-item--active' : ''}`}
                  onClick={() => setTab(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* Content */}
        <div className="settings-content">
          {tab === 'shop' && <ShopSettingsTab me={me} reload={reload} />}
          {tab === 'logo' && <LogoSettingsTab me={me} reload={reload} />}
          {tab === 'about' && <SocialAboutSettingsTab me={me} reload={reload} />}
          {tab === 'delivery' && <DeliveryZonesSettingsTab me={me} reload={reload} />}
          {tab === 'hours' && <WorkingHoursSettingsTab me={me} reload={reload} />}
          {tab === 'preorders' && <PreordersSettingsTab me={me} reload={reload} />}
          {tab === 'subscription' && <SubscriptionSettingsTab me={me} reload={reload} />}
          {tab === 'payment' && <PaymentSettingsTab me={me} reload={reload} />}
          {tab === 'account' && <AccountSettingsTab me={me} />}
          {tab === 'legal' && <LegalSettingsTab />}
        </div>
      </div>
    </div>
  );
}
