import type { CompositionItem } from '../api/sellerClient';
import './CompositionEditor.css';

const UNITS = ['шт.', 'м', 'г', 'кг', 'упак.', 'мл', 'л'];

interface CompositionEditorProps {
  items: CompositionItem[];
  onChange: (items: CompositionItem[]) => void;
}

export function CompositionEditor({ items, onChange }: CompositionEditorProps) {
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
    <div className="composition-editor">
      <label className="form-field-label">Состав</label>
      {items.map((item, i) => (
        <div key={i} className="composition-editor__row">
          <input
            type="text"
            className="form-input composition-editor__name"
            placeholder="Название"
            value={item.name}
            onChange={(e) => update(i, 'name', e.target.value)}
          />
          <input
            type="number"
            className="form-input composition-editor__qty"
            placeholder="Кол-во"
            min={0}
            step="any"
            value={item.qty ?? ''}
            onChange={(e) => update(i, 'qty', e.target.value)}
          />
          <select
            className="form-input composition-editor__unit"
            value={item.unit ?? ''}
            onChange={(e) => update(i, 'unit', e.target.value)}
          >
            <option value="">—</option>
            {UNITS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-sm composition-editor__remove"
            onClick={() => remove(i)}
            aria-label="Удалить"
          >
            &times;
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-sm btn-secondary" onClick={add}>
        + Добавить
      </button>
    </div>
  );
}
