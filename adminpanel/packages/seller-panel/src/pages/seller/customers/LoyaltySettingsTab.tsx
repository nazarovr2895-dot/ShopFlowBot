import { useEffect, useState } from 'react';
import {
  getLoyaltySettings,
  updateLoyaltySettings,
} from '../../../api/sellerClient';
import type { LoyaltyTier } from '../../../api/sellerClient';
import { useToast, FormField, Skeleton } from '@shared/components/ui';
import { Gift, Settings, Trophy, Plus, X } from 'lucide-react';
import './shared.css';
import './LoyaltySettingsTab.css';

function TierPreview({ tiers }: { tiers: LoyaltyTier[] }) {
  const sorted = [...tiers].filter(t => t.name && t.min_total > 0).sort((a, b) => a.min_total - b.min_total);
  if (!sorted.length) return null;
  const maxTotal = sorted[sorted.length - 1].min_total;

  return (
    <div className="tier-preview">
      <div className="tier-preview-bar">
        <div className="tier-preview-track" />
        {sorted.map((tier, i) => {
          const left = maxTotal > 0 ? (tier.min_total / (maxTotal * 1.2)) * 100 : 0;
          return (
            <div key={i} className="tier-preview-marker" style={{ left: `${Math.min(left, 92)}%` }}>
              <div className="tier-preview-dot" />
              <div className="tier-preview-label">
                <strong>{tier.name}</strong>
                <span>от {tier.min_total.toLocaleString('ru')} ₽</span>
                <span>{tier.points_percent}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function LoyaltySettingsTab() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [pointsPercent, setPointsPercent] = useState('');
  const [maxPointsDiscount, setMaxPointsDiscount] = useState('100');
  const [pointsToRubleRate, setPointsToRubleRate] = useState('1');
  const [pointsExpireDays, setPointsExpireDays] = useState('');
  const [tiersConfig, setTiersConfig] = useState<LoyaltyTier[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getLoyaltySettings()
      .then((settings) => {
        setPointsPercent(String(settings.points_percent ?? ''));
        setMaxPointsDiscount(String(settings.max_points_discount_percent ?? 100));
        setPointsToRubleRate(String(settings.points_to_ruble_rate ?? 1));
        setTiersConfig(settings.tiers_config || []);
        setPointsExpireDays(settings.points_expire_days ? String(settings.points_expire_days) : '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    const num = parseFloat(pointsPercent.replace(',', '.'));
    if (isNaN(num) || num < 0 || num > 100) {
      toast.warning('Процент начисления: число от 0 до 100');
      return;
    }
    const maxDisc = parseInt(maxPointsDiscount, 10);
    if (isNaN(maxDisc) || maxDisc < 0 || maxDisc > 100) {
      toast.warning('Макс. % оплаты баллами: число от 0 до 100');
      return;
    }
    const rate = parseFloat(pointsToRubleRate.replace(',', '.'));
    if (isNaN(rate) || rate <= 0) {
      toast.warning('Курс баллов: число больше 0');
      return;
    }
    setSaving(true);
    try {
      const expDays = pointsExpireDays ? parseInt(pointsExpireDays, 10) : 0;
      const result = await updateLoyaltySettings({
        points_percent: num,
        max_points_discount_percent: maxDisc,
        points_to_ruble_rate: rate,
        tiers_config: tiersConfig.length > 0 ? tiersConfig : null,
        points_expire_days: expDays > 0 ? expDays : null,
      });
      setPointsPercent(String(result.points_percent));
      setMaxPointsDiscount(String(result.max_points_discount_percent));
      setPointsToRubleRate(String(result.points_to_ruble_rate));
      setTiersConfig(result.tiers_config || []);
      setPointsExpireDays(result.points_expire_days ? String(result.points_expire_days) : '');
      toast.success('Настройки сохранены');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="loyalty-tab">
        <Skeleton height="120px" borderRadius="var(--radius-lg)" className="loyalty-skeleton-mb" />
        <Skeleton height="200px" borderRadius="var(--radius-lg)" className="loyalty-skeleton-mb" />
        <Skeleton height="160px" borderRadius="var(--radius-lg)" />
      </div>
    );
  }

  return (
    <div className="loyalty-tab">
      {/* ═══ Help card ═══ */}
      <div className="crm-card loyalty-help-card">
        <div className="crm-card__header">
          <div className="crm-card__header-left">
            <div className="crm-card__icon-badge crm-card__icon-badge--amber">
              <Gift size={18} />
            </div>
            <div>
              <h3 className="crm-card__title">Как работает система лояльности</h3>
            </div>
          </div>
        </div>
        <p className="loyalty-help-text">
          При каждой покупке клиенту начисляются баллы — процент от суммы заказа.
          Клиент может использовать баллы для скидки на следующие покупки (1 балл = {pointsToRubleRate || '1'} ₽).
          Уровни лояльности позволяют увеличивать процент начисления для постоянных клиентов.
        </p>
      </div>

      {/* ═══ Accrual Settings ═══ */}
      <div className="crm-card">
        <div className="crm-card__header">
          <div className="crm-card__header-left">
            <div className="crm-card__icon-badge">
              <Settings size={18} />
            </div>
            <div>
              <h3 className="crm-card__title">Настройки начисления</h3>
              <p className="crm-card__subtitle">Основные параметры программы лояльности</p>
            </div>
          </div>
        </div>

        <div className="crm-form">
          <div className="crm-form__row-2col">
            <FormField label="Начисление баллов (% от суммы заказа)">
              <input
                type="text"
                inputMode="decimal"
                value={pointsPercent}
                onChange={(e) => setPointsPercent(e.target.value)}
                placeholder="0"
              />
            </FormField>
            <FormField label="Макс. % заказа, оплачиваемый баллами">
              <input
                type="text"
                inputMode="numeric"
                value={maxPointsDiscount}
                onChange={(e) => setMaxPointsDiscount(e.target.value)}
                placeholder="100"
              />
            </FormField>
          </div>
          <div className="crm-form__row-2col">
            <FormField label="Курс: 1 балл = X рублей">
              <input
                type="text"
                inputMode="decimal"
                value={pointsToRubleRate}
                onChange={(e) => setPointsToRubleRate(e.target.value)}
                placeholder="1"
              />
            </FormField>
            <FormField label="Срок действия баллов (дней, 0 = бессрочно)">
              <input
                type="text"
                inputMode="numeric"
                value={pointsExpireDays}
                onChange={(e) => setPointsExpireDays(e.target.value)}
                placeholder="0 (бессрочно)"
              />
            </FormField>
          </div>
        </div>
      </div>

      {/* ═══ Loyalty Tiers ═══ */}
      <div className="crm-card">
        <div className="crm-card__header">
          <div className="crm-card__header-left">
            <div className="crm-card__icon-badge crm-card__icon-badge--amber">
              <Trophy size={18} />
            </div>
            <div>
              <h3 className="crm-card__title">Уровни лояльности</h3>
              <p className="crm-card__subtitle">Автоматическое изменение % начисления от суммы покупок</p>
            </div>
          </div>
        </div>

        <TierPreview tiers={tiersConfig} />

        <div className="loyalty-tiers-list">
          {tiersConfig.map((tier, i) => (
            <div key={i} className="loyalty-tier-row">
              <FormField label={i === 0 ? 'Название' : undefined}>
                <input
                  type="text"
                  placeholder="Название"
                  value={tier.name}
                  onChange={(e) => {
                    const next = [...tiersConfig];
                    next[i] = { ...next[i], name: e.target.value };
                    setTiersConfig(next);
                  }}
                />
              </FormField>
              <FormField label={i === 0 ? 'От суммы ₽' : undefined}>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="От суммы ₽"
                  value={tier.min_total}
                  onChange={(e) => {
                    const next = [...tiersConfig];
                    next[i] = { ...next[i], min_total: Number(e.target.value) || 0 };
                    setTiersConfig(next);
                  }}
                />
              </FormField>
              <FormField label={i === 0 ? '% баллов' : undefined}>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="% баллов"
                  value={tier.points_percent}
                  onChange={(e) => {
                    const next = [...tiersConfig];
                    next[i] = { ...next[i], points_percent: Number(e.target.value) || 0 };
                    setTiersConfig(next);
                  }}
                />
              </FormField>
              <button
                type="button"
                className="loyalty-tier-remove"
                onClick={() => setTiersConfig(tiersConfig.filter((_, j) => j !== i))}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="loyalty-tier-add"
          onClick={() => setTiersConfig([...tiersConfig, { name: '', min_total: 0, points_percent: 0 }])}
        >
          <Plus size={14} /> Добавить уровень
        </button>
      </div>

      {/* Save button */}
      <button
        type="button"
        className="loyalty-save-btn"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? 'Сохранение...' : 'Сохранить настройки'}
      </button>
    </div>
  );
}
