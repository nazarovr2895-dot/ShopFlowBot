import { useEffect, useState, useRef } from 'react';
import {
  getMe,
  getProducts,
  getBouquets,
  createProduct,
  updateProduct,
  deleteProduct,
  uploadProductPhoto,
  getProductImageUrl,
  recalculateProductPrice,
} from '../../api/sellerClient';
import type { SellerMe, SellerProduct, BouquetDetail, CompositionItem } from '../../api/sellerClient';
import { useToast, useConfirm, TabBar, Modal, Toggle, FormField, EmptyState } from '../../components/ui';
import { ImageCropModal } from '../../components/ImageCropModal';
import { CompositionEditor } from '../../components/CompositionEditor';
import './SellerShowcase.css';

type AddProductMode = 'choice' | 'manual' | 'bouquet';

type ShowcaseTab = 'regular' | 'preorder';

export function SellerShowcase() {
  const toast = useToast();
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState<ShowcaseTab>('regular');
  const [me, setMe] = useState<SellerMe | null>(null);
  const [products, setProducts] = useState<SellerProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const [showAddProduct, setShowAddProduct] = useState(false);
  const [addProductMode, setAddProductMode] = useState<AddProductMode>('choice');
  const [bouquets, setBouquets] = useState<BouquetDetail[]>([]);
  const [selectedBouquetId, setSelectedBouquetId] = useState<number | null>(null);
  const [newProduct, setNewProduct] = useState({ name: '', description: '', price: '', quantity: '1' });
  const [newProductComposition, setNewProductComposition] = useState<CompositionItem[]>([]);
  const [productPhotoFiles, setProductPhotoFiles] = useState<File[]>([]);
  const [productPhotoPreviews, setProductPhotoPreviews] = useState<string[]>([]);

  const [markupPercent, setMarkupPercent] = useState('50');
  const [selectedBouquetCost, setSelectedBouquetCost] = useState(0);
  const [recalculating, setRecalculating] = useState<number | null>(null);

  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; description: string; price: string; quantity: string }>({ name: '', description: '', price: '', quantity: '0' });
  const [editComposition, setEditComposition] = useState<CompositionItem[]>([]);
  const [editKeptPhotoIds, setEditKeptPhotoIds] = useState<string[]>([]);
  const [editNewPhotoFiles, setEditNewPhotoFiles] = useState<File[]>([]);
  const [editNewPhotoPreviews, setEditNewPhotoPreviews] = useState<string[]>([]);
  const [editSaving, setEditSaving] = useState(false);

  // Crop modal state
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [cropTarget, setCropTarget] = useState<'add' | 'edit'>('add');
  const pendingCropFiles = useRef<File[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const isPreorder = activeTab === 'preorder';
      const [meData, productsData] = await Promise.all([
        getMe(),
        getProducts({ preorder: isPreorder }),
      ]);
      setMe(meData);
      setProducts(productsData ?? []);
    } catch {
      setMe(null);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [activeTab]);

  const visibleCount = products.filter((p) => p.is_active !== false).length;

  const handleToggleShowInApp = async (product: SellerProduct) => {
    const nextActive = product.is_active === false;
    setTogglingId(product.id);
    const prev = product.is_active;
    setProducts((list) =>
      list.map((p) => (p.id === product.id ? { ...p, is_active: nextActive } : p))
    );
    try {
      await updateProduct(product.id, { is_active: nextActive });
    } catch (err) {
      setProducts((list) =>
        list.map((p) => (p.id === product.id ? { ...p, is_active: prev } : p))
      );
      toast.error(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setTogglingId(null);
    }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!me) return;
    const price = parseFloat(newProduct.price);
    const quantity = parseInt(newProduct.quantity, 10);
    if (isNaN(price) || price < 0 || isNaN(quantity) || quantity < 0) {
      toast.warning('Проверьте цену и количество');
      return;
    }
    try {
      const photo_ids: string[] = [];
      for (const file of productPhotoFiles.slice(0, 3)) {
        const res = await uploadProductPhoto(file);
        if (res.photo_id) photo_ids.push(res.photo_id);
      }
      const payload: Parameters<typeof createProduct>[0] = {
        seller_id: me.seller_id,
        name: newProduct.name,
        description: newProduct.description,
        price,
        quantity,
        is_preorder: activeTab === 'preorder',
      };
      if (photo_ids.length) payload.photo_ids = photo_ids;
      const validComposition = newProductComposition.filter((c) => c.name.trim());
      if (validComposition.length) payload.composition = validComposition;
      if (selectedBouquetId != null) {
        payload.bouquet_id = selectedBouquetId;
        payload.cost_price = selectedBouquetCost;
        payload.markup_percent = parseFloat(markupPercent) || 0;
      }
      await createProduct(payload);
      setNewProduct({ name: '', description: '', price: '', quantity: '1' });
      setNewProductComposition([]);
      setProductPhotoFiles([]);
      setProductPhotoPreviews([]);
      setShowAddProduct(false);
      setAddProductMode('choice');
      setSelectedBouquetId(null);
      setSelectedBouquetCost(0);
      setMarkupPercent('50');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  const handleProductPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return;
    e.target.value = '';
    const remaining = 3 - productPhotoFiles.length;
    if (remaining <= 0) return;
    const toProcess = files.slice(0, remaining);
    pendingCropFiles.current = toProcess.slice(1);
    setCropTarget('add');
    setCropImageSrc(URL.createObjectURL(toProcess[0]));
  };

  const removeProductPhoto = (index: number) => {
    setProductPhotoFiles((prev) => prev.filter((_, i) => i !== index));
    setProductPhotoPreviews((prev) => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
  };

  const openAddFromBouquet = async () => {
    try {
      const list = await getBouquets();
      setBouquets(list || []);
      setAddProductMode('bouquet');
    } catch {
      setBouquets([]);
      setAddProductMode('bouquet');
    }
  };

  const selectBouquetForProduct = (b: BouquetDetail) => {
    setSelectedBouquetId(b.id);
    const canAssemble = Math.max(0, b.can_assemble_count ?? 0);
    const costPrice = b.total_price ?? 0;
    setSelectedBouquetCost(costPrice);
    const defaultMarkup = 50;
    setMarkupPercent(String(defaultMarkup));
    setNewProduct({
      name: b.name,
      description: '',
      price: String(Math.round(costPrice * (1 + defaultMarkup / 100))),
      quantity: String(canAssemble),
    });
  };

  const handleDeleteProduct = async (id: number) => {
    if (!await confirm({ message: 'Удалить товар?' })) return;
    try {
      await deleteProduct(id);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  const openEdit = (p: SellerProduct) => {
    setEditingProductId(p.id);
    setEditForm({
      name: p.name,
      description: p.description || '',
      price: String(p.price),
      quantity: String(p.quantity),
    });
    const ids = (p.photo_ids && p.photo_ids.length) ? p.photo_ids : (p.photo_id ? [p.photo_id] : []);
    setEditKeptPhotoIds(ids);
    setEditNewPhotoFiles([]);
    setEditNewPhotoPreviews([]);
    setEditComposition(p.composition ?? []);
  };

  const closeEdit = () => {
    setEditingProductId(null);
    setEditForm({ name: '', description: '', price: '', quantity: '0' });
    setEditKeptPhotoIds([]);
    setEditNewPhotoFiles([]);
    editNewPhotoPreviews.forEach((url) => URL.revokeObjectURL(url));
    setEditNewPhotoPreviews([]);
    setEditComposition([]);
  };

  const removeEditKeptPhoto = (index: number) => {
    setEditKeptPhotoIds((prev) => prev.filter((_, i) => i !== index));
  };

  const handleEditNewPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return;
    e.target.value = '';
    const remaining = 3 - editKeptPhotoIds.length - editNewPhotoFiles.length;
    if (remaining <= 0) return;
    const toProcess = files.slice(0, remaining);
    pendingCropFiles.current = toProcess.slice(1);
    setCropTarget('edit');
    setCropImageSrc(URL.createObjectURL(toProcess[0]));
  };

  const removeEditNewPhoto = (index: number) => {
    setEditNewPhotoFiles((prev) => prev.filter((_, i) => i !== index));
    setEditNewPhotoPreviews((prev) => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleCropComplete = (blob: Blob) => {
    const file = new File([blob], `cropped-${Date.now()}.jpg`, { type: 'image/jpeg' });
    if (cropTarget === 'add') {
      const next = [...productPhotoFiles, file].slice(0, 3);
      setProductPhotoFiles(next);
      setProductPhotoPreviews((prev) => {
        prev.forEach((url) => URL.revokeObjectURL(url));
        return next.map((f) => URL.createObjectURL(f));
      });
    } else {
      const next = [...editNewPhotoFiles, file].slice(0, Math.max(0, 3 - editKeptPhotoIds.length));
      setEditNewPhotoFiles(next);
      setEditNewPhotoPreviews((prev) => {
        prev.forEach((url) => URL.revokeObjectURL(url));
        return next.map((f) => URL.createObjectURL(f));
      });
    }
    if (cropImageSrc) URL.revokeObjectURL(cropImageSrc);
    setCropImageSrc(null);

    // Process next pending file
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

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingProductId == null) return;
    const price = parseFloat(editForm.price);
    const quantity = parseInt(editForm.quantity, 10);
    if (isNaN(price) || price < 0 || isNaN(quantity) || quantity < 0) {
      toast.warning('Проверьте цену и количество');
      return;
    }
    setEditSaving(true);
    try {
      const newIds: string[] = [];
      for (const file of editNewPhotoFiles) {
        const res = await uploadProductPhoto(file);
        if (res.photo_id) newIds.push(res.photo_id);
      }
      const photo_ids = [...editKeptPhotoIds, ...newIds].slice(0, 3);
      const validComposition = editComposition.filter((c) => c.name.trim());
      await updateProduct(editingProductId, {
        name: editForm.name,
        description: editForm.description,
        price,
        quantity,
        photo_ids,
        composition: validComposition,
      });
      closeEdit();
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setEditSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="seller-showcase-loading">
        <div className="loader" />
      </div>
    );
  }

  return (
    <div className="seller-showcase-page">
      <p className="seller-showcase-intro">
        Как видят ваш каталог в приложении. Добавляйте, редактируйте товары и управляйте показом в mini app.
      </p>

      <TabBar
        tabs={[
          { key: 'regular', label: 'Товары в mini app', count: activeTab === 'regular' ? products.length : undefined },
          { key: 'preorder', label: 'Товары по предзаказу' },
        ]}
        activeTab={activeTab}
        onChange={(key) => setActiveTab(key as ShowcaseTab)}
      />

      {products.length > 0 && (
        <p className="seller-showcase-stats">
          В каталоге: {visibleCount} из {products.length}
        </p>
      )}

      <div className="seller-showcase-toolbar">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setShowAddProduct(true);
            setAddProductMode('choice');
          }}
        >
          {activeTab === 'preorder' ? 'Добавить товар для предзаказа' : 'Добавить товар'}
        </button>
      </div>

      {showAddProduct && addProductMode === 'choice' && (
        <div className="seller-showcase-add-choice card">
          <h4>Как добавить товар?</h4>
          <div className="seller-showcase-choice-buttons">
            <button type="button" className="btn btn-primary" onClick={() => setAddProductMode('manual')}>
              Создать вручную
            </button>
            <button type="button" className="btn btn-secondary" onClick={openAddFromBouquet}>
              Из букета
            </button>
          </div>
          <button type="button" className="btn btn-secondary" onClick={() => setShowAddProduct(false)}>
            Отмена
          </button>
        </div>
      )}

      {showAddProduct && addProductMode === 'bouquet' && !selectedBouquetId && (
        <div className="seller-showcase-add-form card">
          <h4>Выберите букет</h4>
          {bouquets.length === 0 ? (
            <p className="seller-showcase-empty-text">Нет букетов. Создайте букет в разделе «Конструктор букетов».</p>
          ) : (
            <ul className="seller-showcase-bouquet-list">
              {bouquets.map((b) => (
                <li key={b.id}>
                  <button type="button" className="btn btn-secondary" onClick={() => selectBouquetForProduct(b)}>
                    {b.name} — {b.total_price != null ? `${b.total_price.toFixed(0)} ₽` : '—'}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="btn btn-secondary" onClick={() => { setShowAddProduct(false); setAddProductMode('choice'); }}>
            Назад
          </button>
        </div>
      )}

      {showAddProduct && (addProductMode === 'manual' || (addProductMode === 'bouquet' && selectedBouquetId)) && (
        <form onSubmit={handleAddProduct} className="seller-showcase-add-form card">
          <h4>{selectedBouquetId ? 'Товар из букета' : 'Новый товар'}</h4>
          <FormField label="Название">
            <input
              type="text"
              value={newProduct.name}
              onChange={(e) => setNewProduct((p) => ({ ...p, name: e.target.value }))}
              className="form-input"
              required
            />
          </FormField>
          <FormField label="Описание">
            <textarea
              value={newProduct.description}
              onChange={(e) => setNewProduct((p) => ({ ...p, description: e.target.value }))}
              className="form-input"
            />
          </FormField>
          <CompositionEditor items={newProductComposition} onChange={setNewProductComposition} />
          {selectedBouquetId && (
            <div className="seller-showcase-cost-info">
              <span>Себестоимость букета: <strong>{selectedBouquetCost.toFixed(0)} ₽</strong></span>
            </div>
          )}
          {selectedBouquetId ? (
            <div className="seller-showcase-form-row-3">
              <FormField label="Наценка (%)">
                <input
                  type="number"
                  min={0}
                  step={5}
                  value={markupPercent}
                  onChange={(e) => {
                    const pct = parseFloat(e.target.value) || 0;
                    setMarkupPercent(e.target.value);
                    setNewProduct((p) => ({
                      ...p,
                      price: String(Math.round(selectedBouquetCost * (1 + pct / 100))),
                    }));
                  }}
                  className="form-input"
                />
              </FormField>
              <FormField label="Цена (₽)" hint="Авто или введите вручную">
                <input
                  type="number"
                  value={newProduct.price}
                  onChange={(e) => setNewProduct((p) => ({ ...p, price: e.target.value }))}
                  className="form-input"
                  required
                />
              </FormField>
              <FormField label="Количество" hint="По остаткам в приёмке">
                <input
                  type="number"
                  min={0}
                  value={newProduct.quantity}
                  readOnly
                  className="form-input seller-showcase-form-input-readonly"
                  title="По остаткам в приёмке"
                />
              </FormField>
            </div>
          ) : (
            <div className="seller-showcase-form-row-2">
              <FormField label="Цена (₽)">
                <input
                  type="number"
                  value={newProduct.price}
                  onChange={(e) => setNewProduct((p) => ({ ...p, price: e.target.value }))}
                  className="form-input"
                  required
                />
              </FormField>
              <FormField label="Количество">
                <input
                  type="number"
                  min={0}
                  value={newProduct.quantity}
                  onChange={(e) => setNewProduct((p) => ({ ...p, quantity: e.target.value }))}
                  className="form-input"
                />
              </FormField>
            </div>
          )}
          <FormField label="Фото товара (до 3 шт., JPG/PNG/WebP/GIF)">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleProductPhotoChange}
              className="form-input"
              multiple
            />
            {productPhotoPreviews.length > 0 && (
              <div className="seller-showcase-photos-preview">
                {productPhotoPreviews.map((src, i) => (
                  <div key={i} className="seller-showcase-photo-preview-wrap">
                    <img src={src} alt={`Превью ${i + 1}`} />
                    <button type="button" className="seller-showcase-photo-remove" onClick={() => removeProductPhoto(i)} aria-label="Удалить">×</button>
                  </div>
                ))}
              </div>
            )}
          </FormField>
          <div className="seller-showcase-form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setProductPhotoFiles([]);
                setProductPhotoPreviews([]);
                if (selectedBouquetId) {
                  setAddProductMode('bouquet');
                  setSelectedBouquetId(null);
                } else {
                  setShowAddProduct(false);
                  setAddProductMode('choice');
                }
              }}
            >
              Отмена
            </button>
            <button type="submit" className="btn btn-primary">Добавить</button>
          </div>
        </form>
      )}

      <Modal
        isOpen={editingProductId != null}
        onClose={closeEdit}
        title="Редактировать товар"
        size="lg"
        footer={
          <div className="seller-showcase-form-actions">
            <button type="button" className="btn btn-secondary" onClick={closeEdit}>Отмена</button>
            <button type="button" className="btn btn-primary" disabled={editSaving} onClick={(e) => { const form = (e.target as HTMLElement).closest('.ui-modal')?.querySelector('form'); form?.requestSubmit(); }}>
              {editSaving ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        }
      >
        <form onSubmit={handleSaveEdit}>
          <FormField label="Название">
            <input
              type="text"
              value={editForm.name}
              onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              className="form-input"
              required
            />
          </FormField>
          <FormField label="Описание">
            <textarea
              value={editForm.description}
              onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
              className="form-input"
            />
          </FormField>
          <CompositionEditor items={editComposition} onChange={setEditComposition} />
          <div className="seller-showcase-form-row-2">
            <FormField label="Цена (₽)">
              <input
                type="number"
                value={editForm.price}
                onChange={(e) => setEditForm((f) => ({ ...f, price: e.target.value }))}
                className="form-input"
                required
              />
            </FormField>
            <FormField label="Количество">
              <input
                type="number"
                min={0}
                value={editForm.quantity}
                onChange={(e) => setEditForm((f) => ({ ...f, quantity: e.target.value }))}
                className="form-input"
              />
            </FormField>
          </div>
          <FormField label="Фото (до 3 шт.)">
            {editKeptPhotoIds.length > 0 && (
              <div className="seller-showcase-photos-preview">
                {editKeptPhotoIds.map((id, i) => (
                  <div key={id} className="seller-showcase-photo-preview-wrap">
                    <img src={getProductImageUrl(id) || ''} alt="" />
                    <button type="button" className="seller-showcase-photo-remove" onClick={() => removeEditKeptPhoto(i)} aria-label="Удалить">×</button>
                  </div>
                ))}
              </div>
            )}
            {editNewPhotoPreviews.length > 0 && (
              <div className="seller-showcase-photos-preview">
                {editNewPhotoPreviews.map((src, i) => (
                  <div key={`new-${i}`} className="seller-showcase-photo-preview-wrap">
                    <img src={src} alt="" />
                    <button type="button" className="seller-showcase-photo-remove" onClick={() => removeEditNewPhoto(i)} aria-label="Удалить">×</button>
                  </div>
                ))}
              </div>
            )}
            {editKeptPhotoIds.length + editNewPhotoFiles.length < 3 && (
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleEditNewPhotoChange}
                className="form-input"
                multiple
              />
            )}
          </FormField>
        </form>
      </Modal>

      {products.length === 0 ? (
        <EmptyState
          title="Нет товаров"
          message="Нажмите «Добавить товар» чтобы начать"
        />
      ) : (
        <div className="seller-showcase-grid">
          {products.map((p) => {
            const firstPhotoId = (p.photo_ids && p.photo_ids[0]) || p.photo_id;
            const imageUrl = getProductImageUrl(firstPhotoId ?? null);
            const isActive = p.is_active !== false;

            return (
              <div
                key={p.id}
                className={`seller-showcase-card ${!isActive ? 'seller-showcase-card--hidden' : ''}`}
              >
                <div className="seller-showcase-card-image-wrap">
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt={p.name}
                      className="seller-showcase-card-image"
                    />
                  ) : (
                    <div className="seller-showcase-card-image-placeholder">📷</div>
                  )}
                  {!isActive && (
                    <span className="seller-showcase-card-badge">Скрыт</span>
                  )}
                </div>
                <div className="seller-showcase-card-info">
                  <span className="seller-showcase-card-name">{p.name}</span>
                  {p.description && (
                    <span className="seller-showcase-card-desc">{p.description}</span>
                  )}
                  <span className="seller-showcase-card-price">{Number(p.price).toFixed(0)} ₽</span>
                  {p.bouquet_id && p.cost_price != null && (
                    <span className="seller-showcase-card-cost">
                      Себест.: {Number(p.cost_price).toFixed(0)} ₽
                      {p.markup_percent != null && ` | Наценка: ${Number(p.markup_percent).toFixed(0)}%`}
                    </span>
                  )}
                  <span className={`seller-showcase-card-qty${p.stock_shortage?.length ? ' seller-showcase-card-qty--shortage' : ''}`}>
                    В наличии: {p.quantity} шт.
                  </span>
                  {p.stock_shortage && p.stock_shortage.length > 0 && (
                    <div className="seller-showcase-card-shortage">
                      Не хватает цветов:
                      {p.stock_shortage.map((s, i) => (
                        <div key={i}>
                          {s.flower} — нужно {s.need}, есть {s.have} (−{s.deficit})
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="seller-showcase-card-switch">
                    <Toggle
                      checked={isActive}
                      disabled={togglingId === p.id}
                      onChange={() => handleToggleShowInApp(p)}
                      label="Показывать в mini app"
                    />
                  </div>
                  <div className="seller-showcase-card-actions">
                    {p.bouquet_id && (
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        disabled={recalculating === p.id}
                        onClick={async () => {
                          setRecalculating(p.id);
                          try {
                            await recalculateProductPrice(p.id);
                            load();
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : 'Ошибка пересчёта');
                          } finally {
                            setRecalculating(null);
                          }
                        }}
                      >
                        {recalculating === p.id ? 'Пересчёт...' : 'Пересчитать'}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={() => openEdit(p)}
                    >
                      Редактировать
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary seller-showcase-btn-delete"
                      onClick={() => handleDeleteProduct(p.id)}
                    >
                      Удалить
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {cropImageSrc && (
        <ImageCropModal
          isOpen={!!cropImageSrc}
          imageSrc={cropImageSrc}
          onCropComplete={handleCropComplete}
          onClose={handleCropClose}
        />
      )}
    </div>
  );
}
