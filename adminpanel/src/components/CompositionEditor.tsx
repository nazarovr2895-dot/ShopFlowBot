import { Trash2 } from 'lucide-react';
import type { CompositionItem } from '../api/sellerClient';
import './CompositionEditor.css';

const UNITS = ['шт.', 'м', 'г', 'кг', 'упак.', 'мл', 'л'];

interface CompositionEditorProps {
  items: CompositionItem[];
  onChange: (items: CompositionItem[]) => void;
  className?: string;
}

export function CompositionEditor({ items, onChange, className }: CompositionEditorProps) {
  const update = (index: number, field: keyof CompositionItem, value: string) => {
    const next = items.map((item, i) => {
      if (i !== index) return item;
      if (field === 'qty') {
        const num = value === '' ? null : parseFloat(value);
        return { ...item, qty: num };
      }
      if (field === 'unit') {
        return { ...item, unit: value || null };
      }
      return { ...item, [field]: value };
    });
    onChange(next);
  };

  const add = () => {
    onChange([...items, { name: '', qty: null, unit: 'шт.' }]);
  };

  const remove = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  return (
    <div className={`ce${className ? ` ${className}` : ''}`}>
      <div className="ce__header">
        <label className="ce__title">Состав</label>
        <span className="ce__subtitle">Укажите цветы и материалы</span>
      </div>

      {items.map((item, i) => (
        <div key={i} className="ce-item">
          <div className="ce-item__top">
            <input
              type="text"
              className="ce-item__name"
              placeholder="Название ингредиента"
              value={item.name}
              onChange={(e) => update(i, 'name', e.target.value)}
            />
            <button
              type="button"
              className="ce-item__remove"
              onClick={() => remove(i)}
              aria-label="Удалить"
            >
              <Trash2 size={14} />
            </button>
          </div>
          <div className="ce-item__bottom">
            <div className="ce-item__field">
              <span className="ce-item__label">Кол-во</span>
              <input
                type="number"
                className="ce-item__qty"
                placeholder="—"
                min={0}
                step="any"
                value={item.qty ?? ''}
                onChange={(e) => update(i, 'qty', e.target.value)}
              />
            </div>
            <div className="ce-item__field">
              <span className="ce-item__label">Ед.</span>
              <select
                className="ce-item__unit"
                value={item.unit ?? ''}
                onChange={(e) => update(i, 'unit', e.target.value)}
              >
                <option value="">—</option>
                {UNITS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      ))}

      <button type="button" className="ce-add" onClick={add}>
        + Добавить ингредиент
      </button>
    </div>
  );
}
