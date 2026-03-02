import { useRef, useState } from 'react';
import { updateMe, getLogoImageUrl, uploadLogoPhoto } from '../../../api/sellerClient';
import { useToast } from '@shared/components/ui';
import { ImageCropModal } from '../../../components/ImageCropModal';
import { Image, Upload, Trash2 } from 'lucide-react';
import type { SettingsTabProps } from './types';

export function LogoSettingsTab({ me, reload }: SettingsTabProps) {
  const toast = useToast();
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoRemoving, setLogoRemoving] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const logoFileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setCropImageSrc(url);
    e.target.value = '';
  };

  const handleCropComplete = async (blob: Blob) => {
    setCropImageSrc(null);
    const file = new File([blob], `logo-${Date.now()}.jpg`, { type: 'image/jpeg' });
    setLogoUploading(true);
    try {
      await uploadLogoPhoto(file);
      await reload();
      toast.success('Логотип загружен');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка загрузки логотипа');
    } finally {
      setLogoUploading(false);
    }
  };

  const handleCropClose = () => {
    if (cropImageSrc) URL.revokeObjectURL(cropImageSrc);
    setCropImageSrc(null);
  };

  const handleRemoveLogo = async () => {
    setLogoRemoving(true);
    try {
      await updateMe({ logo_url: null });
      await reload();
      toast.success('Логотип удалён');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLogoRemoving(false);
    }
  };

  return (
    <div className="settings-shop">
      <div className="shop-card">
        <div className="shop-card__header">
          <div className="shop-card__header-left">
            <div className="shop-card__icon-badge shop-card__icon-badge--teal">
              <Image size={18} />
            </div>
            <div>
              <h3 className="shop-card__title">Логотип магазина</h3>
              <p className="shop-card__subtitle">Квадратное изображение, рекомендуемый размер: 512 x 512 px</p>
            </div>
          </div>
        </div>

        {me.logo_url ? (
          <div className="shop-banner">
            <div className="shop-logo__preview">
              <img src={getLogoImageUrl(me.logo_url) ?? ''} alt="Логотип магазина" />
            </div>
            <div className="shop-banner__actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={logoUploading}
                onClick={() => logoFileInputRef.current?.click()}
              >
                <Upload size={14} />
                {logoUploading ? 'Загрузка...' : 'Заменить'}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm shop-banner__remove-btn"
                disabled={logoRemoving}
                onClick={handleRemoveLogo}
              >
                <Trash2 size={14} />
                {logoRemoving ? 'Удаление...' : 'Удалить'}
              </button>
            </div>
          </div>
        ) : (
          <div
            className="shop-banner__dropzone"
            onClick={() => logoFileInputRef.current?.click()}
          >
            <Upload size={24} className="shop-banner__dropzone-icon" />
            <span className="shop-banner__dropzone-text">
              {logoUploading ? 'Загрузка...' : 'Нажмите, чтобы загрузить логотип'}
            </span>
            <span className="shop-banner__dropzone-hint">JPG, PNG, WebP или GIF</span>
          </div>
        )}
        <input
          ref={logoFileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleFileSelect}
          className="shop-banner__file-input"
        />
      </div>

      {cropImageSrc && (
        <ImageCropModal
          isOpen
          imageSrc={cropImageSrc}
          onCropComplete={handleCropComplete}
          onClose={handleCropClose}
        />
      )}

      <style>{`
        .shop-logo__preview {
          display: flex;
          justify-content: center;
        }
        .shop-logo__preview img {
          width: 120px;
          height: 120px;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid var(--border);
        }
      `}</style>
    </div>
  );
}
