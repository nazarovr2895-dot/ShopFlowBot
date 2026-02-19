import { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { Modal } from './ui';
import { getCroppedImg } from '../utils/cropImage';
import './ImageCropModal.css';

interface ImageCropModalProps {
  isOpen: boolean;
  imageSrc: string;
  onCropComplete: (croppedBlob: Blob) => void;
  onClose: () => void;
}

export function ImageCropModal({ isOpen, imageSrc, onCropComplete, onClose }: ImageCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  const onCropAreaChange = useCallback((_croppedArea: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return;
    setSaving(true);
    try {
      const blob = await getCroppedImg(imageSrc, croppedAreaPixels);
      onCropComplete(blob);
    } catch {
      // silently fail — user can retry
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Обрезать фото"
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
      <div className="image-crop-modal__container">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={1}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropAreaChange}
        />
      </div>
      <div className="image-crop-modal__zoom">
        <label className="image-crop-modal__zoom-label">Масштаб</label>
        <input
          type="range"
          min={1}
          max={3}
          step={0.1}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="image-crop-modal__zoom-slider"
        />
      </div>
    </Modal>
  );
}
