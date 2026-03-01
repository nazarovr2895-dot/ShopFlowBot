import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Modal } from '@shared/components/ui';
import { parseItemsInfo, formatPhone, formatAddress, getDaysUntil } from '@shared/utils/formatters';
import { STATUS_LABELS, getStatusColor, isPickup } from './constants';
import type { CardContext } from './constants';
import type { SellerOrder, SellerProduct } from '../../../api/sellerClient';
import { getProductImageUrl } from '../../../api/sellerClient';
import './OrderInfoModal.css';

interface OrderInfoModalProps {
  order: SellerOrder;
  context: CardContext;
  editingPrice: number | null;
  newPrice: string;
  onEditPrice: (orderId: number, currentPrice: number) => void;
  onSavePrice: (orderId: number) => void;
  onCancelPrice: () => void;
  onPriceChange: (value: string) => void;
  loadProducts?: () => Promise<SellerProduct[]>;
  onClose: () => void;
}

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return '—'; }
}

export function OrderInfoModal({
  order,
  context,
  editingPrice,
  newPrice,
  onEditPrice,
  onSavePrice,
  onCancelPrice,
  onPriceChange,
  loadProducts,
  onClose,
}: OrderInfoModalProps) {
  const [copiedAddr, setCopiedAddr] = useState(false);
  const [products, setProducts] = useState<SellerProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);

  // Load products on mount for inline cards
  useEffect(() => {
    if (!loadProducts) return;
    setProductsLoading(true);
    loadProducts()
      .then(setProducts)
      .catch(() => setProducts([]))
      .finally(() => setProductsLoading(false));
  }, [loadProducts]);

  const pickup = isPickup(order.delivery_type);
  const items = parseItemsInfo(order.items_info);
  const showPriceEdit = context === 'pending' || context === 'preorder_requests';
  const sc = getStatusColor(order.status);
  const hasOriginalPrice =
    order.original_price != null &&
    Math.abs((order.original_price ?? 0) - (order.total_price ?? 0)) > 0.01;

  const handleCopyAddress = () => {
    const text = formatAddress(order.address);
    if (text && text !== '—') {
      navigator.clipboard.writeText(text);
      setCopiedAddr(true);
      setTimeout(() => setCopiedAddr(false), 1500);
    }
  };

  const handleBeforeClose = () => {
    if (editingPrice === order.id) onCancelPrice();
    return true;
  };

  const paymentLabel = order.payment_method === 'on_pickup' ? 'При получении (наличные)' : 'Онлайн';
  const paymentStatusLabel =
    order.payment_status === 'succeeded' ? 'Оплачено'
      : order.payment_status === 'pending' ? 'Ожидает оплаты'
        : order.payment_status === 'cancelled' ? 'Отменён'
          : order.payment_status || '—';

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Заказ #${order.id}`}
      size="md"
      beforeClose={handleBeforeClose}
      footer={
        <Link to={`/orders/${order.id}`} className="oim__full-link" onClick={onClose}>
          Открыть полную страницу
        </Link>
      }
    >
      <div className="oim">
        {/* ── Секция: Заказ ──────────────── */}
        <section className="oim__section">
          <h3 className="oim__section-title">Заказ</h3>
          <div className="oim__rows">
            <div className="oim__row">
              <span className="oim__label">Статус</span>
              <span
                className="oim__badge"
                style={{ background: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}
              >
                {STATUS_LABELS[order.status] || order.status}
              </span>
            </div>
            <div className="oim__row">
              <span className="oim__label">Дата</span>
              <span className="oim__value">{formatDate(order.created_at)}</span>
            </div>
            {order.completed_at && (
              <div className="oim__row">
                <span className="oim__label">Завершён</span>
                <span className="oim__value">{formatDate(order.completed_at)}</span>
              </div>
            )}
            <div className="oim__row">
              <span className="oim__label">Сумма</span>
              <span className="oim__value oim__value--price">{order.total_price} ₽</span>
            </div>
            {hasOriginalPrice && (
              <div className="oim__row">
                <span className="oim__label">Было</span>
                <span className="oim__value oim__value--old">{order.original_price} ₽</span>
              </div>
            )}
            {(order.points_discount ?? 0) > 0 && (
              <div className="oim__row">
                <span className="oim__label">Бонусы</span>
                <span className="oim__value oim__value--bonus">−{order.points_discount} ₽</span>
              </div>
            )}
            {showPriceEdit && editingPrice !== order.id && (
              <div className="oim__row">
                <span className="oim__label" />
                <button className="oim__edit-price-btn" onClick={() => onEditPrice(order.id, order.total_price ?? 0)}>
                  Изменить цену
                </button>
              </div>
            )}
            {editingPrice === order.id && (
              <div className="oim__row">
                <span className="oim__label">Новая цена</span>
                <div className="oim__price-edit">
                  <input type="number" value={newPrice} onChange={(e) => onPriceChange(e.target.value)} className="form-input oim__price-input" />
                  <button className="btn btn-sm btn-primary" onClick={() => onSavePrice(order.id)}>OK</button>
                  <button className="btn btn-sm btn-secondary" onClick={onCancelPrice}>✕</button>
                </div>
              </div>
            )}
            <div className="oim__row">
              <span className="oim__label">Доставка</span>
              <span className={`oim__pill ${pickup ? 'oim__pill--pickup' : 'oim__pill--delivery'}`}>
                {pickup ? 'Самовывоз' : 'Доставка'}
              </span>
            </div>
            {order.delivery_slot_date && order.delivery_slot_start && (
              <div className="oim__row">
                <span className="oim__label">Слот</span>
                <span className="oim__value">
                  {new Date(order.delivery_slot_date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}{' '}
                  {order.delivery_slot_start}–{order.delivery_slot_end}
                </span>
              </div>
            )}
            {!pickup && order.address && (
              <div className="oim__row oim__row--top">
                <span className="oim__label">Адрес</span>
                <div className="oim__addr-wrap">
                  <span className="oim__value">{formatAddress(order.address)}</span>
                  <button className="oim__copy-btn" onClick={handleCopyAddress}>
                    {copiedAddr ? 'Скопировано!' : 'Копировать'}
                  </button>
                </div>
              </div>
            )}
            {order.is_preorder && order.preorder_delivery_date && (
              <div className="oim__row">
                <span className="oim__label">Предзаказ</span>
                <span className="oim__value">
                  Поставка: {new Date(order.preorder_delivery_date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
                  {context === 'preorder_waiting' && (() => {
                    const cd = getDaysUntil(order.preorder_delivery_date);
                    return <span className={cd.className}> {cd.label}</span>;
                  })()}
                </span>
              </div>
            )}
            <div className="oim__row">
              <span className="oim__label">Оплата</span>
              <span className="oim__value">{paymentLabel} · {paymentStatusLabel}</span>
            </div>
          </div>
        </section>

        {/* ── Секция: Состав — product mini-cards ── */}
        <section className="oim__section">
          <h3 className="oim__section-title">Состав</h3>
          {productsLoading ? (
            <div className="oim__products-loading">Загрузка товаров...</div>
          ) : (
            <div className="oim__products">
              {items.map((item, i) => {
                const product = item.id ? products.find(p => p.id === item.id) : null;
                const photoUrl = product ? getProductImageUrl(product.photo_id ?? (product.photo_ids?.[0] ?? null)) : null;
                return (
                  <div key={i} className="oim__product-card">
                    <div className="oim__product-thumb">
                      {photoUrl ? (
                        <img src={photoUrl} alt={item.name} className="oim__product-img" />
                      ) : (
                        <span className="oim__product-placeholder">🌸</span>
                      )}
                    </div>
                    <div className="oim__product-info">
                      <span className="oim__product-name">{product?.name || item.name}</span>
                      {product?.description && (
                        <span className="oim__product-desc">{product.description}</span>
                      )}
                      <span className="oim__product-meta">
                        {product && (
                          <>
                            <span className="oim__product-meta-price">{product.price} ₽</span>
                            <span className="oim__product-meta-dot">·</span>
                            <span className="oim__product-meta-stock">на складе: {product.quantity} шт</span>
                          </>
                        )}
                      </span>
                    </div>
                    <span className="oim__product-qty">× {item.qty}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Секция: Покупатель ─────────── */}
        <section className="oim__section">
          <h3 className="oim__section-title">Покупатель</h3>
          <div className="oim__rows">
            {order.buyer_fio && (
              <div className="oim__row">
                <span className="oim__label">ФИО</span>
                <span className="oim__value">{order.buyer_fio}</span>
              </div>
            )}
            {order.buyer_phone && (
              <div className="oim__row">
                <span className="oim__label">Телефон</span>
                <a href={`tel:${order.buyer_phone}`} className="oim__value oim__value--link">
                  {formatPhone(order.buyer_phone)}
                </a>
              </div>
            )}
            {order.recipient_name && (
              <>
                <div className="oim__row">
                  <span className="oim__label">Получатель</span>
                  <span className="oim__value">{order.recipient_name}</span>
                </div>
                {order.recipient_phone && (
                  <div className="oim__row">
                    <span className="oim__label">Тел. получателя</span>
                    <a href={`tel:${order.recipient_phone}`} className="oim__value oim__value--link">
                      {formatPhone(order.recipient_phone)}
                    </a>
                  </div>
                )}
              </>
            )}
            {order.gift_note && (
              <div className="oim__gift-note">
                <span className="oim__label">Записка к цветам</span>
                <blockquote className="oim__quote">{order.gift_note}</blockquote>
              </div>
            )}
            {order.customer_id && (
              <div className="oim__row">
                <span className="oim__label" />
                <Link to={`/customers/${order.customer_id}`} className="oim__value oim__value--link" onClick={onClose}>
                  Профиль клиента →
                </Link>
              </div>
            )}
          </div>
        </section>
      </div>
    </Modal>
  );
}
