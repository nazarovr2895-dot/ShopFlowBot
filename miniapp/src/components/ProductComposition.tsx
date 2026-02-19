import type { CompositionItem } from '../types';
import './ProductComposition.css';

interface ProductCompositionProps {
  items: CompositionItem[];
}

export function ProductComposition({ items }: ProductCompositionProps) {
  if (!items.length) return null;

  return (
    <div className="product-composition">
      <h3 className="product-composition__title">Состав</h3>
      <ul className="product-composition__list">
        {items.map((item, i) => (
          <li key={i} className="product-composition__item">
            <span className="product-composition__name">{item.name}</span>
            {item.qty != null && (
              <>
                <span className="product-composition__dots" />
                <span className="product-composition__qty">
                  {Number.isInteger(item.qty) ? item.qty : item.qty.toFixed(1)}
                  {item.unit ? ` ${item.unit}` : ''}
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
