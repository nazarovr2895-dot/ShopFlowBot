import { useState } from 'react';
import { SlidePanel } from '../../../components/ui';
import { User, Store, BarChart3, Shield, ChevronRight } from 'lucide-react';
import type { SellerMe } from '../../../api/sellerClient';
import { AccountPersonalSection } from './sections/AccountPersonalSection';
import { AccountShopSection } from './sections/AccountShopSection';
import { AccountLimitsSection } from './sections/AccountLimitsSection';
import { AccountSecuritySection } from './sections/AccountSecuritySection';
import './AccountSettingsTab.css';

interface AccountSettingsTabProps {
  me: SellerMe;
}

type SectionKey = 'personal' | 'shop' | 'limits' | 'security';

interface SectionConfig {
  key: SectionKey;
  icon: typeof User;
  title: string;
  description: string;
}

const SECTIONS: SectionConfig[] = [
  {
    key: 'personal',
    icon: User,
    title: 'Личные данные',
    description: 'Telegram ID, ФИО, телефон',
  },
  {
    key: 'shop',
    icon: Store,
    title: 'Магазин',
    description: 'Название, описание, доставка, адрес',
  },
  {
    key: 'limits',
    icon: BarChart3,
    title: 'Лимиты и статистика',
    description: 'Лимиты, активные заказы, тариф',
  },
  {
    key: 'security',
    icon: Shield,
    title: 'Смена пароля',
    description: 'Логин и пароль для веб-панели',
  },
];

export function AccountSettingsTab({ me }: AccountSettingsTabProps) {
  const [openSection, setOpenSection] = useState<SectionKey | null>(null);

  const activeSection = SECTIONS.find((s) => s.key === openSection);

  return (
    <div className="settings-account">
      <div className="settings-account-cards">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <button
              key={section.key}
              className="settings-account-card"
              onClick={() => setOpenSection(section.key)}
            >
              <div className="settings-account-card-icon">
                <Icon size={20} />
              </div>
              <div className="settings-account-card-body">
                <span className="settings-account-card-title">{section.title}</span>
                <span className="settings-account-card-desc">{section.description}</span>
              </div>
              <ChevronRight size={16} className="settings-account-card-arrow" />
            </button>
          );
        })}
      </div>

      <SlidePanel
        isOpen={openSection !== null}
        onClose={() => setOpenSection(null)}
        title={activeSection?.title ?? ''}
      >
        {openSection === 'personal' && <AccountPersonalSection me={me} />}
        {openSection === 'shop' && <AccountShopSection me={me} />}
        {openSection === 'limits' && <AccountLimitsSection me={me} />}
        {openSection === 'security' && <AccountSecuritySection />}
      </SlidePanel>
    </div>
  );
}
