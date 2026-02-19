import { useEffect, useState, useRef } from 'react';
import {
  Eye, EyeOff, Pencil, Trash2, RefreshCw, ImageIcon,
} from 'lucide-react';
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
import { useToast, useConfirm, TabBar, FormField, EmptyState } from '../../components/ui';
import { ImageCropModal } from '../../components/ImageCropModal';
import { CompositionEditor } from '../../components/CompositionEditor';
import { ProductEditModal } from '../../components/ProductEditModal';
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

  const [editingProduct, setEditingProduct] = useState<SellerProduct | null>(null);

  // Crop modal state (for add product form)
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
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

  const handleCropComplete = (blob: Blob) => {
    const file = new File([blob], `cropped-${Date.now()}.jpg`, { type: 'image/jpeg' });
    const next = [...productPhotoFiles, file].slice(0, 3);
    setProductPhotoFiles(next);
    setProductPhotoPreviews((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url));
      return next.map((f) => URL.createObjectURL(f));
    });
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

      <ProductEditModal
        product={editingProduct}
        onClose={() => setEditingProduct(null)}
        onSaved={() => { setEditingProduct(null); load(); }}
      />

      {products.length === 0 ? (
        <EmptyState
          title="Нет товаров"
          message="Нажмите «Добавить товар» чтобы начать"
        />
      ) : (
        <div className="sc-product-list">
          {products.map((p) => {
            const firstPhotoId = (p.photo_ids && p.photo_ids[0]) || p.photo_id;
            const imageUrl = getProductImageUrl(firstPhotoId ?? null);
            const isActive = p.is_active !== false;
            const hasShortage = p.stock_shortage && p.stock_shortage.length > 0;
            const shortageTooltip = hasShortage
              ? p.stock_shortage!.map((s) => `${s.flower}: −${s.deficit}`).join('\n')
              : '';
            const costLabel = p.bouquet_id && p.cost_price != null
              ? `Себест. ${Number(p.cost_price).toFixed(0)} ₽ + ${Number(p.markup_percent ?? 0).toFixed(0)}%`
              : '';

            return (
              <div
                key={p.id}
                className={`sc-product-row${!isActive ? ' sc-product-row--hidden' : ''}`}
              >
                <div className="sc-product-thumb">
                  {imageUrl ? (
                    <img src={imageUrl} alt={p.name} loading="lazy" />
                  ) : (
                    <div className="sc-product-thumb-placeholder">
                      <ImageIcon size={20} />
                    </div>
                  )}
                </div>

                <div className="sc-product-info">
                  <div className="sc-product-info-top">
                    <span className="sc-product-name">{p.name}</span>
                    <span className="sc-product-price">{Number(p.price).toFixed(0)} ₽</span>
                  </div>
                  {(costLabel || p.description) && (
                    <span className="sc-product-subtitle">{costLabel || p.description}</span>
                  )}
                </div>

                <div className="sc-product-meta">
                  <span className={`sc-product-stock${p.quantity <= 2 ? ' sc-product-stock--low' : ''}`}>
                    {p.quantity} шт.
                  </span>
                  {hasShortage && (
                    <span
                      className="sc-product-shortage-dot"
                      data-tooltip={shortageTooltip}
                      aria-label="Не хватает цветов"
                    />
                  )}
                </div>

                <div className="sc-product-actions">
                  <button
                    type="button"
                    className={`sc-action-btn${!isActive ? ' sc-action-btn--vis-off' : ''}`}
                    onClick={() => handleToggleShowInApp(p)}
                    disabled={togglingId === p.id}
                    data-tooltip={isActive ? 'Скрыть' : 'Показать'}
                    aria-label={isActive ? 'Скрыть из mini app' : 'Показать в mini app'}
                  >
                    {isActive ? <Eye size={16} /> : <EyeOff size={16} />}
                  </button>

                  {p.bouquet_id && (
                    <button
                      type="button"
                      className="sc-action-btn"
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
                      data-tooltip="Пересчитать"
                      aria-label="Пересчитать цену"
                    >
                      <RefreshCw size={16} className={recalculating === p.id ? 'animate-spin' : ''} />
                    </button>
                  )}

                  <button
                    type="button"
                    className="sc-action-btn"
                    onClick={() => setEditingProduct(p)}
                    data-tooltip="Редактировать"
                    aria-label="Редактировать"
                  >
                    <Pencil size={16} />
                  </button>

                  <button
                    type="button"
                    className="sc-action-btn sc-action-btn--danger"
                    onClick={() => handleDeleteProduct(p.id)}
                    data-tooltip="Удалить"
                    aria-label="Удалить"
                  >
                    <Trash2 size={16} />
                  </button>
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
