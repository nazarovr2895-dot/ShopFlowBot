export interface DeliveryTypeToggleProps {
  supportsDelivery: boolean;
  supportsPickup: boolean;
  selected: string;
  onChange: (type: string) => void;
}

export function DeliveryTypeToggle({
  supportsDelivery,
  supportsPickup,
  selected,
  onChange,
}: DeliveryTypeToggleProps) {
  return (
    <div className="checkout-toggle">
      <span className="checkout-toggle__label">Способ получения</span>
      <div className="checkout-toggle__pills">
        {supportsPickup && (
          <button
            type="button"
            className={`checkout-toggle__pill ${selected === 'Самовывоз' ? 'checkout-toggle__pill--active' : ''}`}
            onClick={() => onChange('Самовывоз')}
          >
            Самовывоз
          </button>
        )}
        {supportsDelivery && (
          <button
            type="button"
            className={`checkout-toggle__pill ${selected === 'Доставка' ? 'checkout-toggle__pill--active' : ''}`}
            onClick={() => onChange('Доставка')}
          >
            Курьером
          </button>
        )}
      </div>
    </div>
  );
}
