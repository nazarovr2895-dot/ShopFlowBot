import { useEffect, useState, useRef } from 'react';
import {
  Eye, EyeOff, Pencil, Trash2, ImageIcon, Plus, X, Tag,
} from 'lucide-react';
import {
  getMe,
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  uploadProductPhoto,
  getProductImageUrl,
  getCategories,
  createCategory,
  updateCategory as updateCategoryApi,
  deleteCategory as deleteCategoryApi,
} from '../../api/sellerClient';
import type { SellerMe, SellerProduct, CompositionItem, SellerCategory } from '../../api/sellerClient';
import { useToast, useConfirm, TabBar, FormField, EmptyState } from '@shared/components/ui';
import { ImageCropModal } from '../../components/ImageCropModal';
import { CompositionEditor } from '../../components/CompositionEditor';
import { ProductEditModal } from '../../components/ProductEditModal';
import './SellerShowcase.css';

type AddonTab = 'products' | 'categories';

export function SellerAddons() {
  const toast = useToast();
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState<AddonTab>('products');
  const [me, setMe] = useState<SellerMe | null>(null);
  const [allProducts, setAllProducts] = useState<SellerProduct[]>([]);
  const [allCategories, setAllCategories] = useState<SellerCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const [showAddProduct, setShowAddProduct] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: '', description: '', price: '', quantity: '1' });
  const [newProductComposition, setNewProductComposition] = useState<CompositionItem[]>([]);
  const [productPhotoFiles, setProductPhotoFiles] = useState<File[]>([]);
  const [productPhotoPreviews, setProductPhotoPreviews] = useState<string[]>([]);
  const [newProductCategoryId, setNewProductCategoryId] = useState<number | null>(null);
  const [isAddingProduct, setIsAddingProduct] = useState(false);

  const [editingProduct, setEditingProduct] = useState<SellerProduct | null>(null);

  // Categories
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [filterCategoryId, setFilterCategoryId] = useState<number | null>(null);

  // Crop modal
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const pendingCropFiles = useRef<File[]>([]);

  // Derived: addon categories & products only
  const addonCategories = allCategories.filter((c) => c.is_addon);
  const addonCategoryIds = new Set(addonCategories.map((c) => c.id));
  const products = allProducts.filter((p) => p.category_id != null && addonCategoryIds.has(p.category_id));
  const visibleCount = products.filter((p) => p.is_active !== false).length;

  const load = async () => {
    setLoading(true);
    try {
      const [meData, productsData, cats] = await Promise.all([
        getMe(),
        getProducts(),
        getCategories().catch(() => []),
      ]);
      setMe(meData);
      setAllProducts(productsData ?? []);
      setAllCategories(cats ?? []);
    } catch {
      setMe(null);
      setAllProducts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setFilterCategoryId(null);
    load();
  }, [activeTab]);

  const handleToggleShowInApp = async (product: SellerProduct) => {
    const nextActive = product.is_active === false;
    setTogglingId(product.id);
    const prev = product.is_active;
    setAllProducts((list) =>
      list.map((p) => (p.id === product.id ? { ...p, is_active: nextActive } : p))
    );
    try {
      await updateProduct(product.id, { is_active: nextActive });
    } catch (err) {
      setAllProducts((list) =>
        list.map((p) => (p.id === product.id ? { ...p, is_active: prev } : p))
      );
      toast.error(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setTogglingId(null);
    }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!me || isAddingProduct) return;
    const price = parseFloat(newProduct.price);
    const quantity = parseInt(newProduct.quantity, 10);
    if (isNaN(price) || price < 0 || isNaN(quantity) || quantity < 0) {
      toast.warning('Проверьте цену и количество');
      return;
    }
    if (newProductCategoryId == null) {
      toast.warning('Выберите категорию');
      return;
    }
    setIsAddingProduct(true);
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
        is_preorder: false,
        category_id: newProductCategoryId,
      };
      if (photo_ids.length) payload.photo_ids = photo_ids;
      const validComposition = newProductComposition.filter((c) => c.name.trim());
      if (validComposition.length) payload.composition = validComposition;
      await createProduct(payload);
      setNewProduct({ name: '', description: '', price: '', quantity: '1' });
      setNewProductComposition([]);
      setProductPhotoFiles([]);
      setProductPhotoPreviews([]);
      setShowAddProduct(false);
      setNewProductCategoryId(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setIsAddingProduct(false);
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
        Сопутствующие товары к букетам: игрушки, конфеты, открытки и другое. Покупатели увидят их в конце каталога и в корзине.
      </p>

      <TabBar
        tabs={[
          { key: 'products', label: 'Товары', count: products.length || undefined },
          { key: 'categories', label: 'Категории', count: addonCategories.length || undefined },
        ]}
        activeTab={activeTab}
        onChange={(key) => setActiveTab(key as AddonTab)}
      />

      {/* ====== Categories Tab ====== */}
      {activeTab === 'categories' && (
        <div className="sc-categories-tab">
          <div className="sc-categories-header">
            <h3>Категории сопутствующих товаров</h3>
            <p>Например: Игрушки, Конфеты, Открытки</p>
          </div>

          <div className="sc-categories-add-form">
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Название новой категории"
              className="form-input"
              maxLength={100}
              onKeyDown={async (e) => {
                if (e.key === 'Enter' && newCategoryName.trim()) {
                  try {
                    await createCategory({ name: newCategoryName.trim(), sort_order: addonCategories.length, is_addon: true });
                    setNewCategoryName('');
                    const cats = await getCategories();
                    setAllCategories(cats ?? []);
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : 'Ошибка');
                  }
                }
              }}
            />
            <button
              type="button"
              className="btn btn-primary"
              disabled={!newCategoryName.trim()}
              onClick={async () => {
                try {
                  await createCategory({ name: newCategoryName.trim(), sort_order: addonCategories.length, is_addon: true });
                  setNewCategoryName('');
                  const cats = await getCategories();
                  setAllCategories(cats ?? []);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : 'Ошибка');
                }
              }}
            >
              <Plus size={16} /> Добавить
            </button>
          </div>

          {addonCategories.length === 0 ? (
            <EmptyState
              icon={<Tag size={40} />}
              title="Нет категорий"
              message="Создайте первую категорию, например «Игрушки» или «Конфеты»"
            />
          ) : (
            <div className="sc-category-list">
              {addonCategories.map((cat) => (
                <div key={cat.id} className={`sc-category-row${cat.is_active === false ? ' sc-category-row--inactive' : ''}`}>
                  {editingCategoryId === cat.id ? (
                    <div className="sc-category-edit">
                      <input
                        type="text"
                        value={editingCategoryName}
                        onChange={(e) => setEditingCategoryName(e.target.value)}
                        className="form-input"
                        maxLength={100}
                        autoFocus
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter' && editingCategoryName.trim()) {
                            await updateCategoryApi(cat.id, { name: editingCategoryName.trim() });
                            setEditingCategoryId(null);
                            const cats = await getCategories();
                            setAllCategories(cats ?? []);
                          }
                          if (e.key === 'Escape') setEditingCategoryId(null);
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={async () => {
                          if (!editingCategoryName.trim()) return;
                          await updateCategoryApi(cat.id, { name: editingCategoryName.trim() });
                          setEditingCategoryId(null);
                          const cats = await getCategories();
                          setAllCategories(cats ?? []);
                        }}
                      >
                        OK
                      </button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditingCategoryId(null)}>
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="sc-category-info">
                        <Tag size={14} className="sc-category-icon" />
                        <span className="sc-category-name">{cat.name}</span>
                      </div>
                      <span className="sc-category-badge">
                        {products.filter((p) => p.category_id === cat.id).length} товаров
                      </span>
                      <div className="sc-category-actions">
                        <button
                          type="button"
                          className="sc-action-btn"
                          onClick={() => { setEditingCategoryId(cat.id); setEditingCategoryName(cat.name); }}
                          data-tooltip="Переименовать"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          className="sc-action-btn sc-action-btn--danger"
                          onClick={async () => {
                            if (!await confirm({ message: `Удалить категорию «${cat.name}»? Товары останутся без категории.` })) return;
                            try {
                              await deleteCategoryApi(cat.id);
                              const cats = await getCategories();
                              setAllCategories(cats ?? []);
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : 'Ошибка');
                            }
                          }}
                          data-tooltip="Удалить"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ====== Products Tab Content ====== */}
      {activeTab === 'products' && products.length > 0 && (
        <p className="seller-showcase-stats">
          В каталоге: {visibleCount} из {products.length}
        </p>
      )}

      {activeTab === 'products' && (
        <div className="seller-showcase-toolbar">
          {addonCategories.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              Сначала создайте категорию во вкладке «Категории»
            </p>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowAddProduct(true)}
            >
              Добавить товар
            </button>
          )}
        </div>
      )}

      {showAddProduct && activeTab === 'products' && (
        <form onSubmit={handleAddProduct} className="seller-showcase-add-form card">
          <h4>Новый сопутствующий товар</h4>
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
          <FormField label="Категория">
            <select
              value={newProductCategoryId ?? ''}
              onChange={(e) => setNewProductCategoryId(e.target.value ? Number(e.target.value) : null)}
              className="form-input"
              required
            >
              <option value="">Выберите категорию</option>
              {addonCategories.filter(c => c.is_active).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </FormField>
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
                setShowAddProduct(false);
              }}
            >
              Отмена
            </button>
            <button type="submit" className="btn btn-primary" disabled={isAddingProduct}>
              {isAddingProduct ? 'Добавление...' : 'Добавить'}
            </button>
          </div>
        </form>
      )}

      <ProductEditModal
        product={editingProduct}
        onClose={() => setEditingProduct(null)}
        onSaved={() => { setEditingProduct(null); load(); }}
        categories={addonCategories}
      />

      {activeTab === 'products' && addonCategories.length > 0 && products.length > 0 && (
        <div className="sc-filter-chips">
          <button
            type="button"
            className={`sc-filter-chip${filterCategoryId == null ? ' sc-filter-chip--active' : ''}`}
            onClick={() => setFilterCategoryId(null)}
          >
            Все
          </button>
          {addonCategories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`sc-filter-chip${filterCategoryId === cat.id ? ' sc-filter-chip--active' : ''}`}
              onClick={() => setFilterCategoryId(cat.id)}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {activeTab === 'products' && (products.length === 0 ? (
        <EmptyState
          title="Нет сопутствующих товаров"
          message={addonCategories.length === 0
            ? 'Сначала создайте категорию во вкладке «Категории»'
            : 'Нажмите «Добавить товар» чтобы начать'
          }
        />
      ) : (
        <div className="sc-product-list">
          {products.filter((p) => filterCategoryId == null || p.category_id === filterCategoryId).map((p) => {
            const firstPhotoId = (p.photo_ids && p.photo_ids[0]) || p.photo_id;
            const imageUrl = getProductImageUrl(firstPhotoId ?? null);
            const isActive = p.is_active !== false;

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
                  {p.description && (
                    <span className="sc-product-subtitle">{p.description}</span>
                  )}
                  {p.category_id && (() => {
                    const cat = addonCategories.find(c => c.id === p.category_id);
                    return cat ? (
                      <span style={{ fontSize: 11, color: 'var(--primary)', background: 'var(--primary-bg, rgba(99,102,241,0.1))', borderRadius: 4, padding: '1px 6px', marginTop: 2, display: 'inline-block' }}>
                        {cat.name}
                      </span>
                    ) : null;
                  })()}
                </div>

                <div className="sc-product-meta">
                  <span className={`sc-product-stock${p.quantity <= 2 ? ' sc-product-stock--low' : ''}`}>
                    {p.quantity} шт.
                  </span>
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
      ))}

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
