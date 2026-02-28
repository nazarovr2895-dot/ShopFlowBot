import { updateMe } from '../../../api/sellerClient';
import { FormField, useToast } from '@shared/components/ui';
import { useEditMode } from '@shared/hooks/useEditMode';
import { Tag, Pencil } from 'lucide-react';
import type { SettingsTabProps } from './types';
import './HashtagsSettingsTab.css';

export function HashtagsSettingsTab({ me, reload }: SettingsTabProps) {
  const toast = useToast();

  const edit = useEditMode({
    hashtags: me.hashtags || '',
  });

  const handleSave = async () => {
    edit.setSaving(true);
    try {
      await updateMe({ hashtags: edit.draft.hashtags.trim() || '' });
      await reload();
      edit.setIsEditing(false);
      toast.success('Хештеги сохранены');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      edit.setSaving(false);
    }
  };

  return (
    <div className="settings-hashtags">
      <div className="card settings-hashtags-section">
        <div className="settings-hashtags-header">
          <div className="settings-hashtags-header-left">
            <Tag size={20} className="settings-hashtags-icon" />
            <h3>Хештеги для поиска</h3>
          </div>
          {!edit.isEditing && (
            <button className="btn btn-ghost btn-sm" onClick={edit.startEditing}>
              <Pencil size={14} />
              Изменить
            </button>
          )}
        </div>
        <p className="settings-hashtags-hint">
          Ключевые слова, по которым покупатели находят ваш магазин в каталоге.
        </p>

        {edit.isEditing ? (
          <div className="settings-hashtags-form">
            <FormField label="Хештеги" hint="Через запятую: букет из 101 розы, тюльпаны 25, гвоздики">
              <input
                type="text"
                value={edit.draft.hashtags}
                onChange={(e) => edit.updateField('hashtags', e.target.value)}
                placeholder="букет из 101 розы, тюльпаны 25, гвоздики"
                className="form-input"
              />
            </FormField>
            <div className="settings-hashtags-actions">
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={edit.saving}
              >
                {edit.saving ? 'Сохранение...' : 'Сохранить'}
              </button>
              <button className="btn btn-ghost" onClick={edit.cancelEditing}>
                Отмена
              </button>
            </div>
          </div>
        ) : (
          <div className="settings-hashtags-view">
            {me.hashtags ? (
              <div className="settings-hashtags-tags">
                {me.hashtags.split(',').map((tag) => tag.trim()).filter(Boolean).map((tag) => (
                  <span key={tag} className="settings-hashtags-chip">{tag}</span>
                ))}
              </div>
            ) : (
              <p className="settings-hashtags-empty">Хештеги не заданы</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
