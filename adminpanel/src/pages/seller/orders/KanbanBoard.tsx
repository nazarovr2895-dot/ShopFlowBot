import { useMemo } from 'react';
import { OrderCardCompact } from './OrderCardCompact';
import { KANBAN_COLUMNS } from './constants';
import type { SellerOrder } from '../../../api/sellerClient';
import './KanbanBoard.css';

interface KanbanBoardProps {
  orders: SellerOrder[];
  editingPrice: number | null;
  newPrice: string;
  onAccept: (order: SellerOrder) => void;
  onReject: (orderId: number) => void;
  onStatusChange: (orderId: number, status: string) => void;
  onEditPrice: (orderId: number, currentPrice: number) => void;
  onSavePrice: (orderId: number) => void;
  onCancelPrice: () => void;
  onPriceChange: (value: string) => void;
  onProductClick?: (productId: number) => void;
}

function sortOrders(orders: SellerOrder[]): SellerOrder[] {
  return [...orders].sort((a, b) => {
    // Primary: delivery_slot_date (earlier first, no-slot at the end)
    const aSlot = a.delivery_slot_date ? new Date(a.delivery_slot_date).getTime() : Infinity;
    const bSlot = b.delivery_slot_date ? new Date(b.delivery_slot_date).getTime() : Infinity;
    if (aSlot !== bSlot) return aSlot - bSlot;
    // Secondary: created_at (older first)
    const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0;
    return aCreated - bCreated;
  });
}

export function KanbanBoard({
  orders,
  editingPrice,
  newPrice,
  onAccept,
  onReject,
  onStatusChange,
  onEditPrice,
  onSavePrice,
  onCancelPrice,
  onPriceChange,
  onProductClick,
}: KanbanBoardProps) {
  const columns = useMemo(() => {
    return KANBAN_COLUMNS.map((col) => {
      const colOrders = orders.filter((o) => col.statuses.includes(o.status));
      return { ...col, orders: sortOrders(colOrders) };
    });
  }, [orders]);

  return (
    <div className="kanban-board">
      {columns.map((col) => (
        <div key={col.key} className="kanban-col">
          <div className="kanban-col__header">
            <span className="kanban-col__dot" style={{ background: col.color }} />
            <span className="kanban-col__title">{col.label}</span>
            <span className="kanban-col__count">{col.orders.length}</span>
          </div>
          <div className="kanban-col__body">
            {col.orders.length === 0 ? (
              <div className="kanban-col__empty">Нет заказов</div>
            ) : (
              col.orders.map((order) => (
                <OrderCardCompact
                  key={order.id}
                  order={order}
                  context="active"
                  editingPrice={editingPrice}
                  newPrice={newPrice}
                  onAccept={onAccept}
                  onReject={onReject}
                  onStatusChange={onStatusChange}
                  onEditPrice={onEditPrice}
                  onSavePrice={onSavePrice}
                  onCancelPrice={onCancelPrice}
                  onPriceChange={onPriceChange}
                  onProductClick={onProductClick}
                />
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
