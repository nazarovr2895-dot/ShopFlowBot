import './TabBar.css';

interface Tab {
  key: string;
  label: string;
  count?: number;
}

interface TabBarProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (key: string) => void;
  size?: 'default' | 'small';
}

export function TabBar({ tabs, activeTab, onChange, size = 'default' }: TabBarProps) {
  return (
    <div className={`tab-bar tab-bar--${size}`} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          role="tab"
          aria-selected={activeTab === tab.key}
          className={`tab-bar-item ${activeTab === tab.key ? 'tab-bar-item--active' : ''}`}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
          {tab.count !== undefined && tab.count > 0 && (
            <span className="tab-bar-count">{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
