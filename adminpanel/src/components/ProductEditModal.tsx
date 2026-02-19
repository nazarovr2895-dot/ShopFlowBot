import { useEffect, useState, useRef, useCallback } from 'react';
import { Plus, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  updateProduct,
  uploadProductPhoto,
  getProductImageUrl,
} from '../api/sellerClient';
import type { SellerProduct, CompositionItem } from '../api/sellerClient';
import { useToast, useConfirm, Modal, FormField, Toggle } from './ui';
import { CompositionEditor } from './CompositionEditor';
import { ImageCropModal } from './ImageCropModal';
import { ProductEditPreview } from './ProductEditPreview';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import './ProductEditModal.css';

/* ── Photo item discriminated union ────────── */
type PhotoItem =
  | { type: 'kept'; id: string }
  | { type: 'new'; file: File; preview: string };

interface ProductEditModalProps {
  product: SellerProduct | null;
  onClose: () => void;
  onSaved: () => void;
}

export function ProductEditModal({ product, onClose, onSaved }: ProductEditModalProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const formRef = useRef<HTMLFormElement>(null);

  // Form state
  const [form, setForm] = useState({ name: '', description: '', price: '', quantity: '' });
  const [composition, setComposition] = useState<CompositionItem[]>([]);
  const [isActive, setIsActive] = useState(true);

  // Photos — unified list
  const [photos, setPhotos] = useState<PhotoItem[]>([]);

  // UI state
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dragActive, setDragActive] = useState(false);
  const [showMobilePreview, setShowMobilePreview] = useState(false);

  // Crop modal
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const pendingCropFiles = useRef<File[]>([]);

  // Dirty tracking
  const { takeSnapshot, isDirty } = useUnsavedChanges();

  /* ── Init from product ──────────────────── */
  useEffect(() => {
    if (!product) return;

    const initial = {
      name: product.name,
      description: product.description || '',
      price: String(product.price),
      quantity: String(product.quantity),
    };
    setForm(initial);
    setIsActive(product.is_active !== false);
    setComposition(product.composition ?? []);
    setErrors({});
    setSaving(false);
    setUploadProgress(null);
    setShowMobilePreview(false);

    // Build photos list
    const ids = (product.photo_ids?.length) ? product.photo_ids : (product.photo_id ? [product.photo_id] : []);
    const photoItems: PhotoItem[] = ids.map((id) => ({ type: 'kept' as const, id }));
    setPhotos(photoItems);

    // Snapshot for dirty tracking
    takeSnapshot({
      ...initial,
      isActive: product.is_active !== false,
      photos: ids,
      composition: product.composition ?? [],
    });
  }, [product, takeSnapshot]);

  /* ── Cleanup blob URLs on unmount ───────── */
  useEffect(() => {
    return () => {
      photos.forEach((p) => {
        if (p.type === 'new') URL.revokeObjectURL(p.preview);
      });
    };
  }, []);

  /* ── Validation ─────────────────────────── */
  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Обязательное поле';
    if (form.description.length > 2000) errs.description = 'Максимум 2000 символов';

    const price = parseFloat(form.price);
    if (isNaN(price) || price <= 0) errs.price = 'Укажите цену больше 0';

    const qty = parseInt(form.quantity, 10);
    if (isNaN(qty) || qty < 0) errs.quantity = 'Укажите корректное количество';

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  /* ── Save handler ───────────────────────── */
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product || !validate()) return;

    setSaving(true);
    try {
      // Upload new photos
      const newPhotos = photos.filter((p): p is Extract<PhotoItem, { type: 'new' }> => p.type === 'new');
      const totalNew = newPhotos.length;
      const uploadedIds: string[] = [];

      for (let i = 0; i < totalNew; i++) {
        setUploadProgress(Math.round((i / totalNew) * 100));
        const res = await uploadProductPhoto(newPhotos[i].file);
        if (res.photo_id) uploadedIds.push(res.photo_id);
      }
      if (totalNew > 0) setUploadProgress(100);

      // Build final photo_ids in order
      let uploadIdx = 0;
      const photo_ids: string[] = [];
      for (const p of photos) {
        if (p.type === 'kept') {
          photo_ids.push(p.id);
        } else {
          if (uploadIdx < uploadedIds.length) {
            photo_ids.push(uploadedIds[uploadIdx]);
            uploadIdx++;
          }
        }
      }

      const validComposition = composition.filter((c) => c.name.trim());

      await updateProduct(product.id, {
        name: form.name.trim(),
        description: form.description,
        price: parseFloat(form.price),
        quantity: parseInt(form.quantity, 10),
        photo_ids: photo_ids.slice(0, 3),
        is_active: isActive,
        composition: validComposition,
      });

      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
      setUploadProgress(null);
    }
  };

  /* ── Close guard ────────────────────────── */
  const handleBeforeClose = useCallback(async (): Promise<boolean> => {
    const currentPhotos = photos.map((p) => p.type === 'kept' ? p.id : p.file.name + p.file.size);
    const currentValues = {
      ...form,
      isActive,
      photos: currentPhotos,
      composition,
    };

    if (!isDirty(currentValues)) return true;

    return confirm({
      title: 'Несохранённые изменения',
      message: 'Закрыть без сохранения? Все изменения будут потеряны.',
      confirmLabel: 'Закрыть',
      cancelLabel: 'Продолжить',
      danger: true,
    });
  }, [form, isActive, photos, composition, isDirty, confirm]);

  /* ── Photo management ───────────────────── */
  const totalPhotos = photos.length;
  const canAddPhoto = totalPhotos < 3;

  const movePhoto = (index: number, direction: -1 | 1) => {
    const to = index + direction;
    if (to < 0 || to >= photos.length) return;
    setPhotos((prev) => {
      const next = [...prev];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => {
      const removed = prev[index];
      if (removed.type === 'new') URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return;
    e.target.value = '';
    processFiles(files);
  };

  const processFiles = (files: File[]) => {
    const remaining = 3 - photos.length;
    if (remaining <= 0) return;
    const toProcess = files.slice(0, remaining);
    pendingCropFiles.current = toProcess.slice(1);
    setCropImageSrc(URL.createObjectURL(toProcess[0]));
  };

  const handleCropComplete = (blob: Blob) => {
    const file = new File([blob], `cropped-${Date.now()}.jpg`, { type: 'image/jpeg' });
    const preview = URL.createObjectURL(file);
    const newItem: PhotoItem = { type: 'new', file, preview };
    setPhotos((prev) => [...prev, newItem].slice(0, 3));

    if (cropImageSrc) URL.revokeObjectURL(cropImageSrc);
    setCropImageSrc(null);

    const nextFile = pendingCropFiles.current.shift();
    if (nextFile) {
      setCropImageSrc(URL.createObjectURL(nextFile));
    }
  };

  const handleCropClose = () => {
    if (cropImageSrc) URL.revokeObjectURL(cropImageSrc);
    setCropImageSrc(null);
    pendingCropFiles.current = [];
  };

  /* ── Drag & Drop ────────────────────────── */
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return;
    processFiles(files);
  };

  /* ── Preview photo URL ──────────────────── */
  const firstPhoto = photos[0];
  const firstPhotoUrl = firstPhoto
    ? firstPhoto.type === 'kept'
      ? getProductImageUrl(firstPhoto.id)
      : firstPhoto.preview
    : null;

  /* ── Footer ─────────────────────────────── */
  const footer = (
    <div className="pem-footer">
      <div className="pem-footer-left">
        {uploadProgress != null && (
          <div className="pem-progress">
            <div className="pem-progress-bar" style={{ width: `${uploadProgress}%` }} />
          </div>
        )}
      </div>
      <div className="pem-footer-right">
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
          Отмена
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving}
          onClick={() => formRef.current?.requestSubmit()}
        >
          {saving
            ? uploadProgress != null
              ? `Загрузка ${uploadProgress}%...`
              : 'Сохранение...'
            : 'Сохранить'}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <Modal
        isOpen={product != null}
        onClose={onClose}
        title="Редактировать товар"
        size="xl"
        beforeClose={handleBeforeClose}
        footer={footer}
      >
        <form onSubmit={handleSave} ref={formRef} className="pem-form">
          <div className="pem-layout">
            {/* ── Left column: form ──────────── */}
            <div className="pem-main">
              {/* Section: Photos */}
              <section className="pem-section">
                <h3 className="pem-section-title">Фотографии</h3>
                <div
                  className={`pem-photo-zone${dragActive ? ' pem-photo-zone--dragover' : ''}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  {photos.map((photo, i) => {
                    const src = photo.type === 'kept'
                      ? getProductImageUrl(photo.id) || ''
                      : photo.preview;
                    return (
                      <div key={photo.type === 'kept' ? photo.id : `new-${i}`} className="pem-photo-item">
                        <img src={src} alt="" />
                        {i === 0 && <span className="pem-photo-main-badge">Главное</span>}
                        <div className="pem-photo-actions">
                          <div className="pem-photo-actions-move">
                            {i > 0 && (
                              <button
                                type="button"
                                className="pem-photo-action-btn"
                                onClick={() => movePhoto(i, -1)}
                                aria-label="Переместить влево"
                              >
                                <ChevronLeft size={14} />
                              </button>
                            )}
                            {i < photos.length - 1 && (
                              <button
                                type="button"
                                className="pem-photo-action-btn"
                                onClick={() => movePhoto(i, 1)}
                                aria-label="Переместить вправо"
                              >
                                <ChevronRight size={14} />
                              </button>
                            )}
                          </div>
                          <button
                            type="button"
                            className="pem-photo-action-btn pem-photo-action-btn--danger"
                            onClick={() => removePhoto(i)}
                            aria-label="Удалить фото"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {canAddPhoto && (
                    <label className="pem-photo-add">
                      <Plus size={20} />
                      <span>Добавить</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        onChange={handleFileSelect}
                        multiple
                        hidden
                      />
                    </label>
                  )}
                </div>
                <div className="pem-photo-hint">
                  {totalPhotos} / 3 {canAddPhoto && '· Перетащите фото или нажмите +'}
                </div>
              </section>

              {/* Section: Info */}
              <section className="pem-section">
                <h3 className="pem-section-title">Информация</h3>
                <FormField label="Название" required error={errors.name}>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, name: e.target.value }));
                      if (errors.name) setErrors((prev) => { const { name: _, ...rest } = prev; return rest; });
                    }}
                    className="form-input"
                    placeholder="Название товара"
                  />
                </FormField>
                <FormField
                  label="Описание"
                  charCount={form.description.length}
                  maxChars={2000}
                  error={errors.description}
                >
                  <textarea
                    value={form.description}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, description: e.target.value }));
                      if (errors.description) setErrors((prev) => { const { description: _, ...rest } = prev; return rest; });
                    }}
                    className="form-input"
                    rows={5}
                    placeholder="Расскажите о товаре"
                  />
                </FormField>
                <CompositionEditor items={composition} onChange={setComposition} />
              </section>

              {/* Section: Price & Availability */}
              <section className="pem-section">
                <h3 className="pem-section-title">Цена и наличие</h3>
                <div className="pem-field-row">
                  <FormField label="Цена (₽)" required error={errors.price}>
                    <input
                      type="number"
                      min={1}
                      value={form.price}
                      onChange={(e) => {
                        setForm((f) => ({ ...f, price: e.target.value }));
                        if (errors.price) setErrors((prev) => { const { price: _, ...rest } = prev; return rest; });
                      }}
                      className="form-input"
                      placeholder="0"
                    />
                  </FormField>
                  <FormField label="Количество" error={errors.quantity}>
                    <input
                      type="number"
                      min={0}
                      value={form.quantity}
                      onChange={(e) => {
                        setForm((f) => ({ ...f, quantity: e.target.value }));
                        if (errors.quantity) setErrors((prev) => { const { quantity: _, ...rest } = prev; return rest; });
                      }}
                      className="form-input"
                      placeholder="0"
                    />
                  </FormField>
                </div>
                <div className="pem-toggle-row">
                  <Toggle
                    checked={isActive}
                    onChange={setIsActive}
                    label="Показывать в каталоге"
                  />
                </div>
              </section>

              {/* Mobile: preview toggle */}
              <button
                type="button"
                className="pem-preview-toggle"
                onClick={() => setShowMobilePreview((v) => !v)}
              >
                {showMobilePreview ? 'Скрыть превью' : 'Посмотреть как видит покупатель'}
              </button>
            </div>

            {/* ── Right column: preview ──────── */}
            <aside className={`pem-preview-col${showMobilePreview ? ' pem-preview-col--visible' : ''}`}>
              <ProductEditPreview
                name={form.name}
                price={form.price}
                description={form.description}
                photoUrl={firstPhotoUrl}
                composition={composition}
              />
            </aside>
          </div>
        </form>
      </Modal>

      {cropImageSrc && (
        <ImageCropModal
          isOpen={!!cropImageSrc}
          imageSrc={cropImageSrc}
          onCropComplete={handleCropComplete}
          onClose={handleCropClose}
        />
      )}
    </>
  );
}
