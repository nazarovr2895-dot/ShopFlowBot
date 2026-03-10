import { useState } from 'react';

/**
 * Интерактивный калькулятор стоимости подписки.
 * Ползунок + числовое поле → расчёт стоимости.
 */
export function PricingCalculator() {
  const [sales, setSales] = useState(80000);

  const baseCost = 2000;
  const threshold = 100000;
  const extra = sales > threshold ? Math.round(sales * 0.01) : 0;
  const total = baseCost + extra;

  const formatNum = (n: number) => n.toLocaleString('ru-RU');

  const handleSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSales(Number(e.target.value));
  };

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/\D/g, '');
    const num = parseInt(v, 10);
    if (!isNaN(num) && num <= 2000000) setSales(num);
    else if (v === '') setSales(0);
  };

  // Процент ползунка для CSS gradient track
  const sliderPercent = (sales / 1000000) * 100;

  return (
    <div className="pricing-calc">
      <div className="pricing-calc__header">
        <h3 className="pricing-calc__title">Рассчитайте стоимость</h3>
        <p className="pricing-calc__subtitle">Укажите ожидаемый объём продаж через платформу</p>
      </div>

      <div className="pricing-calc__input-group">
        <label className="pricing-calc__label">Продажи в месяц</label>
        <div className="pricing-calc__input-wrapper">
          <input
            type="text"
            className="pricing-calc__input"
            value={formatNum(sales)}
            onChange={handleInput}
            inputMode="numeric"
          />
          <span className="pricing-calc__currency">₽</span>
        </div>
        <input
          type="range"
          className="pricing-calc__slider"
          min={0}
          max={1000000}
          step={10000}
          value={sales}
          onChange={handleSlider}
          style={{ '--slider-percent': `${sliderPercent}%` } as React.CSSProperties}
        />
        <div className="pricing-calc__range-labels">
          <span>0 ₽</span>
          <span>1 000 000 ₽</span>
        </div>
      </div>

      <div className="pricing-calc__result">
        <div className="pricing-calc__breakdown">
          <div className="pricing-calc__row">
            <span>Базовая подписка</span>
            <span>{formatNum(baseCost)} ₽</span>
          </div>
          {extra > 0 && (
            <div className="pricing-calc__row pricing-calc__row--extra">
              <span>1% от продаж ({formatNum(sales)} ₽)</span>
              <span>+ {formatNum(extra)} ₽</span>
            </div>
          )}
          <div className="pricing-calc__divider" />
          <div className="pricing-calc__row pricing-calc__row--total">
            <span>Итого в месяц</span>
            <span className="pricing-calc__total-value">{formatNum(total)} ₽</span>
          </div>
        </div>
        <p className="pricing-calc__note">
          {sales <= threshold
            ? 'При продажах до 100 000 ₽ — только базовая подписка'
            : `1% добавляется к подписке, это не комиссия с продаж`}
        </p>
      </div>
    </div>
  );
}
