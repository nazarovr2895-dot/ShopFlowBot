import { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { Modal, useToast } from '@shared/components/ui';
import { getCroppedImg } from '@shared/utils/cropImage';
import { ZoomIn, RotateCw, RotateCcw } from 'lucide-react';
import './ImageCropModal.css';

interface ImageCropModalProps {
  isOpen: boolean;
  imageSrc: string;
  onCropComplete: (croppedBlob: Blob) => void;
  onClose: () => void;
  cropShape?: 'rect' | 'round';
  aspect?: number;
  objectFit?: 'contain' | 'horizontal-cover' | 'vertical-cover' | 'cover';
  extraControls?: React.ReactNode;
  showRotation?: boolean;
  title?: string;
}

export function ImageCropModal({
  isOpen,
  imageSrc,
  onCropComplete,
  onClose,
  cropShape = 'rect',
  aspect = 1,
  objectFit,
  extraControls,
  showRotation = true,
  title = 'Обрезать фото',
}: ImageCropModalProps) {
  const toast = useToast();
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  const isLandscape = aspect >= 3;
  const effectiveObjectFit = objectFit ?? (isLandscape ? 'horizontal-cover' : undefined);
  const minZoom = effectiveObjectFit === 'contain' ? 0.5 : 1;
  const hasChanges = zoom !== 1 || rotation !== 0;

  const onCropAreaChange = useCallback((_croppedArea: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleReset = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
  };

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return;
    setSaving(true);
    try {
      const blob = await getCroppedImg(imageSrc, croppedAreaPixels, rotation);
      onCropComplete(blob);
    } catch {
      toast.error('Не удалось обрезать изображение. Попробуйте другой файл.');
    } finally {
      setSaving(false);
    }
  };

  const containerClass = [
    'image-crop-modal__container',
    isLandscape && 'image-crop-modal__container--landscape',
  ].filter(Boolean).join(' ');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="lg"
      footer={
        <div className="image-crop-modal__actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={saving}
          >
            {saving ? 'Обработка...' : 'Применить'}
          </button>
        </div>
      }
    >
      {extraControls}
      <div className={containerClass}>
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          rotation={rotation}
          aspect={aspect}
          cropShape={cropShape}
          objectFit={effectiveObjectFit}
          restrictPosition={effectiveObjectFit !== 'contain'}
          minZoom={minZoom}
          maxZoom={3}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onRotationChange={setRotation}
          onCropComplete={onCropAreaChange}
        />
      </div>

      <div className="image-crop-modal__controls">
        {/* Zoom */}
        <div className="image-crop-modal__slider-row">
          <label className="image-crop-modal__slider-label">
            <ZoomIn size={14} />
            Масштаб
          </label>
          <input
            type="range"
            min={minZoom}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="image-crop-modal__slider"
          />
          <span className="image-crop-modal__slider-value">{Math.round(zoom * 100)}%</span>
        </div>

        {/* Rotation */}
        {showRotation && (
          <div className="image-crop-modal__slider-row">
            <label className="image-crop-modal__slider-label">
              <RotateCw size={14} />
              Поворот
            </label>
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={rotation}
              onChange={(e) => setRotation(Number(e.target.value))}
              className="image-crop-modal__slider"
            />
            <span className="image-crop-modal__slider-value">{rotation}°</span>
          </div>
        )}

        {/* Footer: crop info + reset */}
        <div className="image-crop-modal__controls-footer">
          <span className="image-crop-modal__crop-info">
            {croppedAreaPixels
              ? `${Math.round(croppedAreaPixels.width)} × ${Math.round(croppedAreaPixels.height)} px`
              : '\u00A0'}
          </span>
          {hasChanges && (
            <button type="button" className="image-crop-modal__reset-btn" onClick={handleReset}>
              <RotateCcw size={12} />
              Сброс
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
