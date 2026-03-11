import { useRef, useState } from 'react';
import { updateMe, getLogoImageUrl, uploadLogoPhoto, getBannerImageUrl, uploadBannerPhoto } from '../../../api/sellerClient';
import { useToast } from '@shared/components/ui';
import { ImageCropModal } from '../../../components/ImageCropModal';
import { Image, GalleryHorizontal, Upload, Trash2 } from 'lucide-react';
import type { SettingsTabProps } from './types';
import './LogoSettingsTab.css';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function validateFile(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return 'Допустимые форматы: JPG, PNG, WebP, GIF';
  }
  if (file.size > MAX_FILE_SIZE) {
    return 'Файл слишком большой (макс. 10 МБ)';
  }
  return null;
}

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

  // Drag state
  const [logoDragActive, setLogoDragActive] = useState(false);
  const [bannerDragActive, setBannerDragActive] = useState(false);

  // ── Shared helpers ──

  const openCrop = (file: File, setter: (src: string) => void) => {
    const error = validateFile(file);
    if (error) {
      toast.error(error);
      return;
    }
    setter(URL.createObjectURL(file));
  };

  const makeDragHandlers = (
    setActive: (v: boolean) => void,
    setter: (src: string) => void,
  ) => ({
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setActive(true); },
    onDragLeave: (e: React.DragEvent) => { e.preventDefault(); setActive(false); },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setActive(false);
      const file = e.dataTransfer.files?.[0];
      if (file) openCrop(file, setter);
    },
  });

  // ── Logo handlers ──

  const handleLogoFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) openCrop(file, setCropImageSrc);
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
    if (file) openCrop(file, setBannerCropSrc);
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

  const logoDrag = makeDragHandlers(setLogoDragActive, setCropImageSrc);
  const bannerDrag = makeDragHandlers(setBannerDragActive, setBannerCropSrc);

  return (
    <div className="settings-shop">
      {/* ── Logo ── */}
      <section className="shop-section">
        <div className="shop-section__header">
          <div className="shop-section__header-left">
            <div className="shop-section__icon shop-section__icon--accent">
              <Image size={20} />
            </div>
            <div className="shop-section__titles">
              <h3 className="shop-section__title">Логотип магазина</h3>
              <p className="shop-section__subtitle">Квадратное изображение, 512 × 512 px</p>
            </div>
          </div>
        </div>

        <div className="shop-section__body">
          {me.logo_url ? (
            <div className="media-preview">
              <div className="media-preview__image media-preview__image--round">
                <img src={getLogoImageUrl(me.logo_url) ?? ''} alt="Логотип магазина" />
              </div>
              <div className="media-preview__actions">
                <button
                  type="button"
                  className="shop-action-link shop-action-link--primary"
                  disabled={logoUploading}
                  onClick={() => logoFileInputRef.current?.click()}
                >
                  <Upload size={14} />
                  {logoUploading ? 'Загрузка...' : 'Заменить'}
                </button>
                <button
                  type="button"
                  className="shop-action-link"
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
              className={`media-dropzone${logoDragActive ? ' media-dropzone--active' : ''}`}
              onClick={() => logoFileInputRef.current?.click()}
              {...logoDrag}
            >
              <div className="media-dropzone__icon">
                <Upload size={24} />
              </div>
              <span className="media-dropzone__text">
                {logoUploading ? 'Загрузка...' : 'Перетащите или нажмите для загрузки'}
              </span>
              <span className="media-dropzone__hint">JPG, PNG, WebP или GIF, до 10 МБ</span>
            </div>
          )}
        </div>

        <input
          ref={logoFileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleLogoFileSelect}
          className="media-file-input"
        />
      </section>

      {/* ── Banner ── */}
      <section className="shop-section">
        <div className="shop-section__header">
          <div className="shop-section__header-left">
            <div className="shop-section__icon shop-section__icon--amber">
              <GalleryHorizontal size={20} />
            </div>
            <div className="shop-section__titles">
              <h3 className="shop-section__title">Баннер магазина</h3>
              <p className="shop-section__subtitle">Широкое изображение, 2000 × 400 px (5:1)</p>
            </div>
          </div>
        </div>

        <div className="shop-section__body">
          {me.banner_url ? (
            <div className="media-preview">
              <div className="media-preview__image media-preview__image--banner">
                <img src={getBannerImageUrl(me.banner_url) ?? ''} alt="Баннер магазина" />
              </div>
              <div className="media-preview__actions">
                <button
                  type="button"
                  className="shop-action-link shop-action-link--primary"
                  disabled={bannerUploading}
                  onClick={() => bannerFileInputRef.current?.click()}
                >
                  <Upload size={14} />
                  {bannerUploading ? 'Загрузка...' : 'Заменить'}
                </button>
                <button
                  type="button"
                  className="shop-action-link"
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
              className={`media-dropzone media-dropzone--banner${bannerDragActive ? ' media-dropzone--active' : ''}`}
              onClick={() => bannerFileInputRef.current?.click()}
              {...bannerDrag}
            >
              <div className="media-dropzone__icon">
                <Upload size={24} />
              </div>
              <span className="media-dropzone__text">
                {bannerUploading ? 'Загрузка...' : 'Перетащите или нажмите для загрузки'}
              </span>
              <span className="media-dropzone__hint">JPG, PNG, WebP или GIF, до 10 МБ</span>
            </div>
          )}
        </div>

        <input
          ref={bannerFileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleBannerFileSelect}
          className="media-file-input"
        />
      </section>

      {/* Logo crop modal */}
      {cropImageSrc && (
        <ImageCropModal
          isOpen
          imageSrc={cropImageSrc}
          cropShape="round"
          title="Обрезать логотип"
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
          title="Обрезать баннер"
          onCropComplete={handleBannerCropComplete}
          onClose={handleBannerCropClose}
        />
      )}
    </div>
  );
}
