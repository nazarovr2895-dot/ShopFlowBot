import { useEffect, useState } from 'react';
import { getMe, getProducts, getBouquets, updateLimits, updateMe, createProduct, updateProduct, deleteProduct, uploadProductPhoto } from '../../api/sellerClient';
import type { SellerMe, SellerProduct, BouquetDetail } from '../../api/sellerClient';
import './SellerShop.css';

type AddProductMode = 'choice' | 'manual' | 'bouquet';

export function SellerShop() {
  const [me, setMe] = useState<SellerMe | null>(null);
  const [products, setProducts] = useState<SellerProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [limitValue, setLimitValue] = useState('');
  const [limitSaving, setLimitSaving] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [addProductMode, setAddProductMode] = useState<AddProductMode>('choice');
  const [bouquets, setBouquets] = useState<BouquetDetail[]>([]);
  const [selectedBouquetId, setSelectedBouquetId] = useState<number | null>(null);
  const [newProduct, setNewProduct] = useState({ name: '', description: '', price: '', quantity: '1' });
  const [productPhotoFiles, setProductPhotoFiles] = useState<File[]>([]);
  const [productPhotoPreviews, setProductPhotoPreviews] = useState<string[]>([]);
  const [editingQty, setEditingQty] = useState<{ id: number; value: string } | null>(null);
  const [hashtagsValue, setHashtagsValue] = useState('');
  const [hashtagsSaving, setHashtagsSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [meData, productsData] = await Promise.all([getMe(), getProducts()]);
      setMe(meData);
      setProducts(productsData || []);
      setLimitValue(String(meData?.max_orders ?? ''));
      setHashtagsValue(meData?.hashtags ?? '');
    } catch {
      setMe(null);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSaveHashtags = async () => {
    setHashtagsSaving(true);
    try {
      await updateMe({ hashtags: hashtagsValue.trim() || '' });
      setMe((m) => m ? { ...m, hashtags: hashtagsValue.trim() || '' } : null);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setHashtagsSaving(false);
    }
  };

  const handleSaveLimit = async () => {
    const num = parseInt(limitValue, 10);
    if (isNaN(num) || num < 1 || num > 100) {
      alert('Введите число от 1 до 100');
      return;
    }
    setLimitSaving(true);
    try {
      await updateLimits(num);
      setMe((m) => m ? { ...m, max_orders: num } : null);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLimitSaving(false);
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

  const handleUpdateQuantity = async (product: SellerProduct, newQty: number) => {
    if (newQty < 0) return;
    setEditingQty(null);
    try {
      await updateProduct(product.id, { quantity: newQty });
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  const startEditQty = (p: SellerProduct) => setEditingQty({ id: p.id, value: String(p.quantity) });

  if (loading) {
    return (
      <div className="seller-shop-loading">
        <div className="loader" />
      </div>
    );
  }

  return (
    <div className="seller-shop-page">
      <h1 className="page-title">Настройка магазина</h1>

      {/* Хештеги — в начале, чтобы покупатели находили магазин по поиску */}
      <div className="card shop-section">
        <h3>🏷️ Хештеги для поиска</h3>
        <p className="section-hint">
          Укажите через запятую ключевые слова, по которым покупатели будут находить ваш магазин в каталоге (например: букет из 101 розы, тюльпаны 25, гвоздики).
        </p>
        <input
          type="text"
          value={hashtagsValue}
          onChange={(e) => setHashtagsValue(e.target.value)}
          placeholder="букет из 101 розы, тюльпаны 25, гвоздики"
          className="form-input hashtags-input"
        />
        <button
          className="btn btn-primary"
          onClick={handleSaveHashtags}
          disabled={hashtagsSaving}
          style={{ marginTop: '0.5rem' }}
        >
          {hashtagsSaving ? 'Сохранение...' : 'Сохранить хештеги'}
        </button>
      </div>

      {/* Лимиты */}
      <div className="card shop-section">
        <h3>⚙️ Настройка лимитов</h3>
        <p className="section-hint">Лимит обнуляется каждый день в 6:00 (МСК). Укажите, сколько заказов сможете выполнить сегодня.</p>
        <div className="limit-row">
          <input
            type="number"
            min={1}
            max={100}
            value={limitValue}
            onChange={(e) => setLimitValue(e.target.value)}
            className="form-input"
            style={{ width: '100px' }}
          />
          <button
            className="btn btn-primary"
            onClick={handleSaveLimit}
            disabled={limitSaving}
          >
            {limitSaving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
        {me?.limit_set_for_today && (
          <p className="limit-info">
            Использовано сегодня: {me.orders_used_today ?? 0} / {me.max_orders ?? 0}
          </p>
        )}
      </div>

      {/* Ссылка на магазин */}
      <div className="card shop-section">
        <h3>🔗 Ссылка на магазин</h3>
        <p className="section-hint">Отправьте эту ссылку клиентам — они сразу попадут в каталог вашего магазина.</p>
        {me?.shop_link ? (
          <div className="link-box">
            <code>{me.shop_link}</code>
            <button
              className="btn btn-sm btn-secondary"
              onClick={() => {
                navigator.clipboard.writeText(me.shop_link!);
                alert('Ссылка скопирована');
              }}
            >
              Копировать
            </button>
          </div>
        ) : (
          <p className="empty-text">Ссылка генерируется автоматически. Обратитесь к администратору.</p>
        )}
      </div>

      {/* Мои товары */}
      <div className="card shop-section">
        <h3>📦 Мои товары</h3>
        <p className="section-hint">Товары, которые видят покупатели. Фото можно загрузить здесь или добавить через Telegram-бота.</p>
        <button className="btn btn-primary" onClick={() => { setShowAddProduct(true); setAddProductMode('choice'); }} style={{ marginBottom: '1rem' }}>
          ➕ Добавить товар
        </button>

        {showAddProduct && addProductMode === 'choice' && (
          <div className="add-product-choice card">
            <h4>Как добавить товар?</h4>
            <div className="choice-buttons">
              <button type="button" className="btn btn-primary" onClick={() => setAddProductMode('manual')}>
                Создать вручную
              </button>
              <button type="button" className="btn btn-secondary" onClick={openAddFromBouquet}>
                Из букета
              </button>
            </div>
          </div>
        )}

        {showAddProduct && addProductMode === 'bouquet' && !selectedBouquetId && (
          <div className="card add-form">
            <h4>Выберите букет</h4>
            {bouquets.length === 0 ? (
              <p className="empty-text">Нет букетов. Создайте букет в разделе «Конструктор букетов».</p>
            ) : (
              <ul className="bouquet-choice-list">
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
          <form onSubmit={handleAddProduct} className="add-product-form card">
            <h4>{selectedBouquetId ? 'Товар из букета' : 'Новый товар'}</h4>
            <div className="form-group">
              <label>Название</label>
              <input
                type="text"
                value={newProduct.name}
                onChange={(e) => setNewProduct((p) => ({ ...p, name: e.target.value }))}
                className="form-input"
                required
              />
            </div>
            <div className="form-group">
              <label>Описание</label>
              <textarea
                value={newProduct.description}
                onChange={(e) => setNewProduct((p) => ({ ...p, description: e.target.value }))}
                className="form-input"
              />
            </div>
            <div className="form-row-2">
              <div className="form-group">
                <label>Цена (₽)</label>
                <input
                  type="number"
                  value={newProduct.price}
                  onChange={(e) => setNewProduct((p) => ({ ...p, price: e.target.value }))}
                  className="form-input"
                  required
                />
              </div>
              <div className="form-group">
                <label>Количество</label>
                {selectedBouquetId ? (
                  <>
                    <input
                      type="number"
                      min={0}
                      value={newProduct.quantity}
                      readOnly
                      className="form-input form-input-readonly"
                      title="По остаткам в приёмке"
                    />
                    <span className="form-hint">По остаткам в приёмке</span>
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
            <div className="form-group">
              <label>Фото товара (до 3 шт., JPG/PNG/WebP/GIF)</label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleProductPhotoChange}
                className="form-input"
                multiple
              />
              {productPhotoPreviews.length > 0 && (
                <div className="product-photos-preview">
                  {productPhotoPreviews.map((src, i) => (
                    <div key={i} className="product-photo-preview-wrap">
                      <img src={src} alt={`Превью ${i + 1}`} />
                      <button type="button" className="product-photo-remove" onClick={() => removeProductPhoto(i)} aria-label="Удалить">×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="form-actions">
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

        {products.length === 0 ? (
          <p className="empty-text">Нет товаров</p>
        ) : (
          <div className="products-list">
            {products.map((p) => (
              <div key={p.id} className="product-card">
                <div className="product-info">
                  <strong>{p.name}</strong>
                  <p className="product-desc">{p.description || '—'}</p>
                  <p className="product-price">{p.price} ₽</p>
                  <div className="product-qty">
                    <span>В наличии: </span>
                    {editingQty?.id === p.id ? (
                      <>
                        <input
                          type="number"
                          min={0}
                          value={editingQty.value}
                          onChange={(e) => setEditingQty((x) => x ? { ...x, value: e.target.value } : null)}
                          onBlur={() => {
                            const v = parseInt(editingQty.value, 10);
                            if (!isNaN(v) && v >= 0) handleUpdateQuantity(p, v);
                            else setEditingQty(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const v = parseInt(editingQty.value, 10);
                              if (!isNaN(v) && v >= 0) handleUpdateQuantity(p, v);
                            }
                          }}
                          className="form-input"
                          style={{ width: '70px', display: 'inline-block' }}
                          autoFocus
                        />
                      </>
                    ) : (
                      <span onClick={() => startEditQty(p)} style={{ cursor: 'pointer', textDecoration: 'underline' }}>
                        {p.quantity} шт. (нажать для изменения)
                      </span>
                    )}
                  </div>
                </div>
                <button className="btn btn-sm btn-secondary" onClick={() => handleDeleteProduct(p.id)}>
                  🗑 Удалить
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
