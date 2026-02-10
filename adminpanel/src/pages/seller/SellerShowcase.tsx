import { useEffect, useState } from 'react';
import {
  getMe,
  getProducts,
  getBouquets,
  createProduct,
  updateProduct,
  deleteProduct,
  uploadProductPhoto,
  getProductImageUrl,
} from '../../api/sellerClient';
import type { SellerMe, SellerProduct, BouquetDetail } from '../../api/sellerClient';
import './SellerShowcase.css';

type AddProductMode = 'choice' | 'manual' | 'bouquet';

type ShowcaseTab = 'regular' | 'preorder';

export function SellerShowcase() {
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
  const [productPhotoFiles, setProductPhotoFiles] = useState<File[]>([]);
  const [productPhotoPreviews, setProductPhotoPreviews] = useState<string[]>([]);

  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; description: string; price: string; quantity: string }>({ name: '', description: '', price: '', quantity: '0' });
  const [editKeptPhotoIds, setEditKeptPhotoIds] = useState<string[]>([]);
  const [editNewPhotoFiles, setEditNewPhotoFiles] = useState<File[]>([]);
  const [editNewPhotoPreviews, setEditNewPhotoPreviews] = useState<string[]>([]);
  const [editSaving, setEditSaving] = useState(false);

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
      alert(err instanceof Error ? err.message : 'Ошибка сохранения');
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
      alert('Проверьте цену и количество');
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
      if (selectedBouquetId != null) payload.bouquet_id = selectedBouquetId;
      await createProduct(payload);
      setNewProduct({ name: '', description: '', price: '', quantity: '1' });
      setProductPhotoFiles([]);
      setProductPhotoPreviews([]);
      setShowAddProduct(false);
      setAddProductMode('choice');
      setSelectedBouquetId(null);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  const handleProductPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith('image/'));
    const next = productPhotoFiles.concat(files).slice(0, 3);
    setProductPhotoFiles(next);
    setProductPhotoPreviews(next.map((f) => URL.createObjectURL(f)));
    e.target.value = '';
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
    setNewProduct({
      name: b.name,
      description: '',
      price: String(b.total_price ?? 0),
      quantity: String(canAssemble),
    });
  };

  const handleDeleteProduct = async (id: number) => {
    if (!confirm('Удалить товар?')) return;
    try {
      await deleteProduct(id);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Ошибка');
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
  };

  const closeEdit = () => {
    setEditingProductId(null);
    setEditForm({ name: '', description: '', price: '', quantity: '0' });
    setEditKeptPhotoIds([]);
    setEditNewPhotoFiles([]);
    editNewPhotoPreviews.forEach((url) => URL.revokeObjectURL(url));
    setEditNewPhotoPreviews([]);
  };

  const removeEditKeptPhoto = (index: number) => {
    setEditKeptPhotoIds((prev) => prev.filter((_, i) => i !== index));
  };

  const handleEditNewPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith('image/'));
    const next = editNewPhotoFiles.concat(files).slice(0, Math.max(0, 3 - editKeptPhotoIds.length));
    setEditNewPhotoFiles(next);
    setEditNewPhotoPreviews((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url));
      return next.map((f) => URL.createObjectURL(f));
    });
    e.target.value = '';
  };

  const removeEditNewPhoto = (index: number) => {
    setEditNewPhotoFiles((prev) => prev.filter((_, i) => i !== index));
    setEditNewPhotoPreviews((prev) => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingProductId == null) return;
    const price = parseFloat(editForm.price);
    const quantity = parseInt(editForm.quantity, 10);
    if (isNaN(price) || price < 0 || isNaN(quantity) || quantity < 0) {
      alert('Проверьте цену и количество');
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
      await updateProduct(editingProductId, {
        name: editForm.name,
        description: editForm.description,
        price,
        quantity,
        photo_ids,
      });
      closeEdit();
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Ошибка');
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
      <h1 className="page-title">Витрина</h1>
      <p className="seller-showcase-intro">
        Как видят ваш каталог в приложении. Добавляйте, редактируйте товары и управляйте показом в mini app.
      </p>

      <div className="seller-showcase-tabs">
        <button
          type="button"
          className={`seller-showcase-tab ${activeTab === 'regular' ? 'active' : ''}`}
          onClick={() => setActiveTab('regular')}
        >
          Мои товары в mini app
        </button>
        <button
          type="button"
          className={`seller-showcase-tab ${activeTab === 'preorder' ? 'active' : ''}`}
          onClick={() => setActiveTab('preorder')}
        >
          Товары по предзаказу
        </button>
      </div>

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
          <div className="seller-showcase-form-group">
            <label>Название</label>
            <input
              type="text"
              value={newProduct.name}
              onChange={(e) => setNewProduct((p) => ({ ...p, name: e.target.value }))}
              className="form-input"
              required
            />
          </div>
          <div className="seller-showcase-form-group">
            <label>Описание</label>
            <textarea
              value={newProduct.description}
              onChange={(e) => setNewProduct((p) => ({ ...p, description: e.target.value }))}
              className="form-input"
            />
          </div>
          <div className="seller-showcase-form-row-2">
            <div className="seller-showcase-form-group">
              <label>Цена (₽)</label>
              <input
                type="number"
                value={newProduct.price}
                onChange={(e) => setNewProduct((p) => ({ ...p, price: e.target.value }))}
                className="form-input"
                required
              />
            </div>
            <div className="seller-showcase-form-group">
              <label>Количество</label>
              {selectedBouquetId ? (
                <>
                  <input
                    type="number"
                    min={0}
                    value={newProduct.quantity}
                    readOnly
                    className="form-input seller-showcase-form-input-readonly"
                    title="По остаткам в приёмке"
                  />
                  <span className="seller-showcase-form-hint">По остаткам в приёмке</span>
                </>
              ) : (
                <input
                  type="number"
                  min={0}
                  value={newProduct.quantity}
                  onChange={(e) => setNewProduct((p) => ({ ...p, quantity: e.target.value }))}
                  className="form-input"
                />
              )}
            </div>
          </div>
          <div className="seller-showcase-form-group">
            <label>Фото товара (до 3 шт., JPG/PNG/WebP/GIF)</label>
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
          </div>
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

      {editingProductId != null && (
        <div className="seller-showcase-modal-overlay" onClick={closeEdit}>
          <div className="seller-showcase-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Редактировать товар</h3>
            <form onSubmit={handleSaveEdit}>
              <div className="seller-showcase-form-group">
                <label>Название</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  className="form-input"
                  required
                />
              </div>
              <div className="seller-showcase-form-group">
                <label>Описание</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                  className="form-input"
                />
              </div>
              <div className="seller-showcase-form-row-2">
                <div className="seller-showcase-form-group">
                  <label>Цена (₽)</label>
                  <input
                    type="number"
                    value={editForm.price}
                    onChange={(e) => setEditForm((f) => ({ ...f, price: e.target.value }))}
                    className="form-input"
                    required
                  />
                </div>
                <div className="seller-showcase-form-group">
                  <label>Количество</label>
                  <input
                    type="number"
                    min={0}
                    value={editForm.quantity}
                    onChange={(e) => setEditForm((f) => ({ ...f, quantity: e.target.value }))}
                    className="form-input"
                  />
                </div>
              </div>
              <div className="seller-showcase-form-group">
                <label>Фото (до 3 шт.)</label>
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
              </div>
              <div className="seller-showcase-form-actions">
                <button type="button" className="btn btn-secondary" onClick={closeEdit}>
                  Отмена
                </button>
                <button type="submit" className="btn btn-primary" disabled={editSaving}>
                  {editSaving ? 'Сохранение...' : 'Сохранить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {products.length === 0 ? (
        <p className="seller-showcase-empty">Нет товаров. Нажмите «Добавить товар» выше.</p>
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
                  <span className="seller-showcase-card-qty">В наличии: {p.quantity} шт.</span>
                  <div className="seller-showcase-card-switch">
                    <label className="seller-showcase-switch-label">
                      <input
                        type="checkbox"
                        id={`show-in-app-${p.id}`}
                        className="seller-showcase-switch-input"
                        checked={isActive}
                        disabled={togglingId === p.id}
                        onChange={() => handleToggleShowInApp(p)}
                        aria-label="Показывать в mini app"
                      />
                      <span className="seller-showcase-switch-track" aria-hidden />
                      <span className="seller-showcase-switch-text">Показывать в mini app</span>
                    </label>
                  </div>
                  <div className="seller-showcase-card-actions">
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
    </div>
  );
}
