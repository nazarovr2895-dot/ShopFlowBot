import { useState, useEffect } from 'react';
import { api } from '../api/client';
import './DeliverySlotPicker.css';

export interface DeliverySlot {
  date: string;
  start: string;
  end: string;
}

interface SlotInfo {
  start: string;
  end: string;
  available: number;
}

interface DeliverySlotPickerProps {
  sellerId: number;
  selectedSlot: DeliverySlot | null;
  onSelect: (slot: DeliverySlot | null) => void;
}

const DAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTH_LABELS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateOnly = new Date(d);
  dateOnly.setHours(0, 0, 0, 0);

  if (dateOnly.getTime() === today.getTime()) return 'Сегодня';
  if (dateOnly.getTime() === tomorrow.getTime()) return 'Завтра';

  const dayOfWeek = DAY_LABELS[d.getDay() === 0 ? 6 : d.getDay() - 1];
  return `${dayOfWeek}, ${d.getDate()} ${MONTH_LABELS[d.getMonth()]}`;
}

export function DeliverySlotPicker({ sellerId, selectedSlot, onSelect }: DeliverySlotPickerProps) {
  const [loading, setLoading] = useState(true);
  const [slotsEnabled, setSlotsEnabled] = useState(false);
  const [slotsByDate, setSlotsByDate] = useState<Record<string, SlotInfo[]>>({});
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const today = new Date();
        const dateFrom = today.toISOString().split('T')[0];
        const futureDate = new Date(today);
        futureDate.setDate(futureDate.getDate() + 7);
        const dateTo = futureDate.toISOString().split('T')[0];

        const result = await api.getDeliverySlots(sellerId, dateFrom, dateTo);
        if (cancelled) return;

        setSlotsEnabled(result.slots_enabled);
        setSlotsByDate(result.slots);

        // Auto-select first available date
        const dates = Object.keys(result.slots).sort();
        if (dates.length > 0) {
          // If selected slot date is still available, keep it
          if (selectedSlot && result.slots[selectedSlot.date]) {
            setSelectedDate(selectedSlot.date);
          } else {
            setSelectedDate(dates[0]);
            onSelect(null); // Reset selection if date changed
          }
        }
      } catch {
        // Silently fail — slots just won't show
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [sellerId]);

  if (loading) {
    return (
      <div className="slot-picker">
        <div className="slot-picker__loading">Загрузка слотов...</div>
      </div>
    );
  }

  if (!slotsEnabled) return null;

  const dates = Object.keys(slotsByDate).sort();
  if (dates.length === 0) {
    return (
      <div className="slot-picker">
        <div className="slot-picker__label">Время доставки</div>
        <div className="slot-picker__empty">Нет доступных слотов</div>
      </div>
    );
  }

  const currentSlots = selectedDate ? slotsByDate[selectedDate] || [] : [];

  return (
    <div className="slot-picker">
      <div className="slot-picker__label">Время доставки</div>

      {/* Date pills */}
      <div className="slot-picker__dates">
        {dates.map(dateStr => (
          <button
            key={dateStr}
            type="button"
            className={`slot-picker__date-pill ${selectedDate === dateStr ? 'slot-picker__date-pill--active' : ''}`}
            onClick={() => {
              setSelectedDate(dateStr);
              // Clear slot selection when switching dates
              if (selectedSlot?.date !== dateStr) {
                onSelect(null);
              }
            }}
          >
            {formatDateLabel(dateStr)}
          </button>
        ))}
      </div>

      {/* Time slots */}
      {selectedDate && currentSlots.length > 0 && (
        <div className="slot-picker__times">
          {currentSlots.map(slot => {
            const isSelected = selectedSlot?.date === selectedDate
              && selectedSlot?.start === slot.start
              && selectedSlot?.end === slot.end;
            return (
              <button
                key={`${slot.start}-${slot.end}`}
                type="button"
                className={`slot-picker__time-chip ${isSelected ? 'slot-picker__time-chip--active' : ''}`}
                onClick={() => {
                  if (isSelected) {
                    onSelect(null);
                  } else {
                    onSelect({ date: selectedDate, start: slot.start, end: slot.end });
                  }
                }}
              >
                {slot.start}–{slot.end}
              </button>
            );
          })}
        </div>
      )}

      {selectedDate && currentSlots.length === 0 && (
        <div className="slot-picker__empty">Нет доступных слотов на эту дату</div>
      )}
    </div>
  );
}
