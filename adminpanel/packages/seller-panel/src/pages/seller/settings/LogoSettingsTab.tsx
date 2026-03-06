import { useRef, useState } from 'react';
import { updateMe, getLogoImageUrl, uploadLogoPhoto, getBannerImageUrl, uploadBannerPhoto } from '../../../api/sellerClient';
import { useToast } from '@shared/components/ui';
import { ImageCropModal } from '../../../components/ImageCropModal';
import { Image, GalleryHorizontal, Upload, Trash2 } from 'lucide-react';
import type { SettingsTabProps } from './types';

export function LogoSettingsTab({ me, reload }: SettingsTabProps) {
  const toast = useToast();

  // Logo state
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoRemoving, setLogoRemoving] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const logoFileInputRef = useRef<HTMLInputElement>(null);

  // Banner state
  const [bannerUploading, setBannerUploading] = useState(false);
  const [bannerRemoving, setBannerRemoving] = useState(false);
  const [bannerCropSrc, setBannerCropSrc] = useState<string | null>(null);
  const bannerFileInputRef = useRef<HTMLInputElement>(null);

  // ── Logo handlers ──
  const handleLogoFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCropImageSrc(URL.createObjectURL(file));
    e.target.value = '';
  };

  const handleLogoCropComplete = async (blob: Blob) => {
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

  const handleLogoCropClose = () => {
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

  // ── Banner handlers ──
  const handleBannerFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBannerCropSrc(URL.createObjectURL(file));
    e.target.value = '';
  };

  const handleBannerCropComplete = async (blob: Blob) => {
    setBannerCropSrc(null);
    const file = new File([blob], `banner-${Date.now()}.jpg`, { type: 'image/jpeg' });
    setBannerUploading(true);
    try {
      await uploadBannerPhoto(file);
      await reload();
      toast.success('Баннер загружен');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка загрузки баннера');
    } finally {
      setBannerUploading(false);
    }
  };

  const handleBannerCropClose = () => {
    if (bannerCropSrc) URL.revokeObjectURL(bannerCropSrc);
    setBannerCropSrc(null);
  };

  const handleRemoveBanner = async () => {
    setBannerRemoving(true);
    try {
      await updateMe({ banner_url: null });
      await reload();
      toast.success('Баннер удалён');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBannerRemoving(false);
    }
  };

  return (
    <div className="settings-shop">
      {/* ── Logo ── */}
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
          onChange={handleLogoFileSelect}
          className="shop-banner__file-input"
        />
      </div>

      {/* ── Banner ── */}
      <div className="shop-card">
        <div className="shop-card__header">
          <div className="shop-card__header-left">
            <div className="shop-card__icon-badge shop-card__icon-badge--teal">
              <GalleryHorizontal size={18} />
            </div>
            <div>
              <h3 className="shop-card__title">Баннер магазина</h3>
              <p className="shop-card__subtitle">Рекомендуемый размер: 2000 x 400 px (5:1)</p>
            </div>
          </div>
        </div>

        {me.banner_url ? (
          <div className="shop-banner">
            <div className="shop-banner__preview">
              <img src={getBannerImageUrl(me.banner_url) ?? ''} alt="Баннер магазина" />
            </div>
            <div className="shop-banner__actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={bannerUploading}
                onClick={() => bannerFileInputRef.current?.click()}
              >
                <Upload size={14} />
                {bannerUploading ? 'Загрузка...' : 'Заменить'}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm shop-banner__remove-btn"
                disabled={bannerRemoving}
                onClick={handleRemoveBanner}
              >
                <Trash2 size={14} />
                {bannerRemoving ? 'Удаление...' : 'Удалить'}
              </button>
            </div>
          </div>
        ) : (
          <div
            className="shop-banner__dropzone"
            onClick={() => bannerFileInputRef.current?.click()}
          >
            <Upload size={24} className="shop-banner__dropzone-icon" />
            <span className="shop-banner__dropzone-text">
              {bannerUploading ? 'Загрузка...' : 'Нажмите, чтобы загрузить баннер'}
            </span>
            <span className="shop-banner__dropzone-hint">JPG, PNG, WebP или GIF</span>
          </div>
        )}
        <input
          ref={bannerFileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleBannerFileSelect}
          className="shop-banner__file-input"
        />
      </div>

      {/* Logo crop modal */}
      {cropImageSrc && (
        <ImageCropModal
          isOpen
          imageSrc={cropImageSrc}
          cropShape="round"
          onCropComplete={handleLogoCropComplete}
          onClose={handleLogoCropClose}
        />
      )}

      {/* Banner crop modal */}
      {bannerCropSrc && (
        <ImageCropModal
          isOpen
          imageSrc={bannerCropSrc}
          aspect={5}
          objectFit="contain"
          onCropComplete={handleBannerCropComplete}
          onClose={handleBannerCropClose}
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
