import { Modal } from '../../../components/ui';
import { getProductImageUrl } from '../../../api/sellerClient';
import type { SellerProduct } from '../../../api/sellerClient';
import './ProductPreviewModal.css';

interface ProductPreviewModalProps {
  product: SellerProduct | null;
  onClose: () => void;
}

export function ProductPreviewModal({ product, onClose }: ProductPreviewModalProps) {
  if (!product) return null;

  const photos = product.photo_ids?.length
    ? product.photo_ids
    : product.photo_id
      ? [product.photo_id]
      : [];

  return (
    <Modal isOpen={!!product} onClose={onClose} title={product.name} size="sm">
      <div className="pp">
        {/* Photos */}
        {photos.length > 0 && (
          <div className="pp__photos">
            {photos.map((pid, i) => {
              const url = getProductImageUrl(pid);
              return url ? (
                <img key={i} src={url} alt={product.name} className="pp__photo" />
              ) : null;
            })}
          </div>
        )}

        {/* Info */}
        <div className="pp__info">
          <div className="pp__row">
            <span className="pp__label">Цена</span>
            <span className="pp__value pp__value--price">{product.price} ₽</span>
          </div>

          {product.cost_price != null && (
            <div className="pp__row">
              <span className="pp__label">Себестоимость</span>
              <span className="pp__value">{product.cost_price} ₽</span>
            </div>
          )}

          <div className="pp__row">
            <span className="pp__label">На складе</span>
            <span className="pp__value">{product.quantity} шт.</span>
          </div>

          {product.is_preorder && (
            <div className="pp__row">
              <span className="pp__label">Тип</span>
              <span className="pp__value pp__badge--preorder">Предзаказ</span>
            </div>
          )}

          {product.is_active === false && (
            <div className="pp__row">
              <span className="pp__label">Статус</span>
              <span className="pp__value pp__badge--inactive">Неактивен</span>
            </div>
          )}
        </div>

        {/* Description */}
        {product.description && (
          <div className="pp__desc">
            <span className="pp__label">Описание</span>
            <p className="pp__desc-text">{product.description}</p>
          </div>
        )}

        {/* Composition */}
        {product.composition && product.composition.length > 0 && (
          <div className="pp__comp">
            <span className="pp__label">Состав</span>
            <ul className="pp__comp-list">
              {product.composition.map((c, i) => (
                <li key={i}>
                  {c.name}
                  {c.qty != null && <span className="pp__comp-qty"> × {c.qty}</span>}
                  {c.unit && <span className="pp__comp-unit"> {c.unit}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
