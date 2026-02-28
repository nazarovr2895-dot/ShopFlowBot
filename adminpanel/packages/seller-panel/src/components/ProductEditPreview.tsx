import { ImageIcon } from 'lucide-react';
import type { CompositionItem } from '../api/sellerClient';
import './ProductEditPreview.css';

interface ProductEditPreviewProps {
  name: string;
  price: string;
  description: string;
  photoUrl: string | null;
  composition: CompositionItem[];
}

export function ProductEditPreview({ name, price, description, photoUrl, composition }: ProductEditPreviewProps) {
  const priceNum = parseFloat(price);
  const priceLabel = !isNaN(priceNum) && priceNum > 0 ? `${Math.round(priceNum)} ₽` : '— ₽';
  const validComposition = composition.filter((c) => c.name.trim());

  return (
    <div className="pem-preview">
      <div className="pem-preview-label">Как увидит покупатель</div>
      {photoUrl ? (
        <img className="pem-preview-image" src={photoUrl} alt="" />
      ) : (
        <div className="pem-preview-image-placeholder">
          <ImageIcon size={32} />
        </div>
      )}
      <div className="pem-preview-info">
        <div className="pem-preview-header">
          <span className="pem-preview-name">{name || 'Название товара'}</span>
          <span className="pem-preview-price">{priceLabel}</span>
        </div>
        {description && (
          <p className="pem-preview-desc">{description}</p>
        )}
        {validComposition.length > 0 && (
          <div className="pem-preview-composition">
            {validComposition.map((c, i) => (
              <span key={i} className="pem-preview-comp-item">
                {c.name}{c.qty != null ? ` ${c.qty}` : ''}{c.unit ? ` ${c.unit}` : ''}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
