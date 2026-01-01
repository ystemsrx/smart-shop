import { useMemo, useState } from 'react';
import { normalizeBooleanFlag } from '../helpers';

export function useProductManagement({
  apiRequest,
  staffPrefix,
  isAdmin,
  user,
  expectedRole,
  orderAgentFilter,
  orderSearch,
  loadOrders,
  setOrderStats,
  setAddresses,
  refreshAllWarnings,
}) {
  const [stats, setStats] = useState({
    total_products: 0,
    categories: 0,
    total_stock: 0,
    recent_products: []
  });
  const [products, setProducts] = useState([]);
  const [editingProduct, setEditingProduct] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [productCategoryFilter, setProductCategoryFilter] = useState('全部');
  const [showOnlyOutOfStock, setShowOnlyOutOfStock] = useState(false);
  const [showOnlyInactive, setShowOnlyInactive] = useState(false);
  const [showOnlyActive, setShowOnlyActive] = useState(false);
  const [variantStockProduct, setVariantStockProduct] = useState(null);
  const [sortBy, setSortBy] = useState(null);
  const [sortOrder, setSortOrder] = useState('asc');
  const [showInactiveInShop, setShowInactiveInShop] = useState(false);
  const [isLoadingShopSetting, setIsLoadingShopSetting] = useState(false);
  const [operatingProducts, setOperatingProducts] = useState(new Set());

  const safeSetAddresses = setAddresses || (() => {});
  const safeSetOrderStats = setOrderStats || (() => {});
  const safeLoadOrders = loadOrders || (() => Promise.resolve());
  const safeRefreshAllWarnings = refreshAllWarnings || (() => Promise.resolve());

  const updateShopInactiveSetting = async (showInactive) => {
    setIsLoadingShopSetting(true);
    try {
      const response = await apiRequest('/admin/shop-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          show_inactive_in_shop: !!showInactive
        })
      });

      if (response.success) {
        setShowInactiveInShop(showInactive);
      } else {
        throw new Error(response.message || '更新设置失败');
      }
    } catch (err) {
      console.error('更新商城设置失败:', err);
      alert('更新设置失败: ' + err.message);
    } finally {
      setIsLoadingShopSetting(false);
    }
  };

  const loadData = async (agentFilterValue = orderAgentFilter, shouldReloadOrders = true, forceRefresh = false) => {
    if (!user || user.type !== expectedRole) {
      return;
    }
    setIsLoading(true);
    setError('');

    if (forceRefresh) {
      setProducts([]);
      setStats({});
      setCategories([]);
    }

    try {
      const normalizedFilter = isAdmin ? (agentFilterValue || 'self').toString() : null;
      const buildQueryString = (key, value) => {
        const params = new URLSearchParams();
        params.set(key, value);
        if (forceRefresh) {
          params.set('_t', Date.now().toString());
        }
        const qs = params.toString();
        return qs ? `?${qs}` : '';
      };
      const ownerQuery = isAdmin ? buildQueryString('owner_id', normalizedFilter || 'self') : '';
      const agentQuery = isAdmin ? buildQueryString('agent_id', normalizedFilter || 'self') : '';

      const statsPromise = apiRequest(`/admin/stats${ownerQuery}`);
      const usersCountPromise = apiRequest(`/admin/users/count${agentQuery}`);
      const productsPromise = apiRequest(`${staffPrefix}/products${ownerQuery}`);
      const categoriesPromise = isAdmin
        ? apiRequest(`/admin/categories${ownerQuery}`)
        : Promise.resolve({ data: { categories: [] } });
      const orderStatsPromise = apiRequest(`/admin/order-stats${agentQuery}`);
      const addressesPromise = isAdmin
        ? apiRequest('/admin/addresses')
        : Promise.resolve({ data: { addresses: [] } });
      const shopSettingsPromise = isAdmin
        ? apiRequest('/admin/shop-settings')
        : Promise.resolve({ data: {} });

      const [statsData, usersCountData, productsData, categoriesData, orderStatsData, addressesData, shopSettingsData] = await Promise.all([
        statsPromise,
        usersCountPromise,
        productsPromise,
        categoriesPromise,
        orderStatsPromise,
        addressesPromise,
        shopSettingsPromise
      ]);

      const mergedStats = { ...(statsData.data || {}), users_count: (usersCountData?.data?.count ?? 0) };
      setStats(mergedStats);
      const productPayload = productsData.data || {};
      const normalizedProducts = (productPayload.products || []).map((product) => ({
        ...product,
        is_active: normalizeBooleanFlag(product.is_active, true),
        is_hot: normalizeBooleanFlag(product.is_hot, false),
        is_not_for_sale: normalizeBooleanFlag(product.is_not_for_sale, false),
        reservation_required: normalizeBooleanFlag(product.reservation_required, false)
      }));
      setProducts(normalizedProducts);
      const rawCategories = isAdmin
        ? (categoriesData.data.categories || [])
        : (productPayload.categories || []).map((name) => ({ id: name, name }));
      const adminCats = rawCategories.slice();
      const letters2 = Array.from({ length: 26 }, (_, i) => String.fromCharCode(97 + i));
      const firstSigChar2 = (s) => {
        const str = String(s || '');
        for (let i = 0; i < str.length; i++) {
          const ch = str[i];
          if (/[A-Za-z\u4e00-\u9fff]/.test(ch)) return ch;
        }
        return '';
      };
      const typeRank2 = (s) => {
        const ch = firstSigChar2(s);
        if (!ch) return 2;
        return /[A-Za-z]/.test(ch) ? 0 : 1;
      };
      const bucket2 = (s, collator) => {
        const name = String(s || '');
        if (!/[A-Za-z\u4e00-\u9fff]/.test(name)) return 26;
        let b = 25;
        for (let i = 0; i < 26; i++) {
          const cur = letters2[i];
          const next = i < 25 ? letters2[i + 1] : null;
          if (collator.compare(name, cur) < 0) { b = 0; break; }
          if (!next || (collator.compare(name, cur) >= 0 && collator.compare(name, next) < 0)) { b = i; break; }
        }
        return b;
      };
      try {
        const collator = new Intl.Collator(
          ['zh-Hans-u-co-pinyin', 'zh-Hans', 'zh', 'en', 'en-US'],
          { sensitivity: 'base', numeric: true }
        );
        adminCats.sort((a, b) => {
          const aName = String(a.name || '');
          const bName = String(b.name || '');
          const ab = bucket2(aName, collator);
          const bb = bucket2(bName, collator);
          if (ab !== bb) return ab - bb;
          const ar = typeRank2(aName);
          const br = typeRank2(bName);
          if (ar !== br) return ar - br;
          return collator.compare(aName, bName);
        });
      } catch (e) {
        adminCats.sort((a, b) => {
          const aName = String(a.name || '');
          const bName = String(b.name || '');
          const aCh = firstSigChar2(aName).toLowerCase();
          const bCh = firstSigChar2(bName).toLowerCase();
          const aIsEn = /^[a-z]$/.test(aCh);
          const bIsEn = /^[a-z]$/.test(bCh);
          const ab = aIsEn ? (aCh.charCodeAt(0) - 97) : 26;
          const bb = bIsEn ? (bCh.charCodeAt(0) - 97) : 26;
          if (ab !== bb) return ab - bb;
          const ar = aIsEn ? 0 : 1;
          const br = bIsEn ? 0 : 1;
          if (ar !== br) return ar - br;
          return aName.localeCompare(bName, 'en', { sensitivity: 'base', numeric: true });
        });
      }
      setCategories(adminCats);
      safeSetOrderStats(orderStatsData.data || {
        total_orders: 0,
        status_counts: {},
        today_orders: 0,
        total_revenue: 0
      });
      safeSetAddresses(addressesData.data.addresses || []);

      if (isAdmin && shopSettingsData.data) {
        const showInactive = normalizeBooleanFlag(shopSettingsData.data.show_inactive_in_shop, false);
        setShowInactiveInShop(showInactive);
      }

      if (shouldReloadOrders) {
        await safeLoadOrders(0, orderSearch, agentFilterValue);
      }
    } catch (err) {
      setError(err.message || '加载数据失败');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshStats = async () => {
    try {
      const normalizedFilter = isAdmin ? (orderAgentFilter || 'self').toString() : null;
      const buildQueryString = (key, value) => {
        const params = new URLSearchParams();
        params.set(key, value);
        params.set('_t', Date.now().toString());
        return `?${params.toString()}`;
      };
      const ownerQuery = isAdmin ? buildQueryString('owner_id', normalizedFilter || 'self') : '';
      const agentQuery = isAdmin ? buildQueryString('agent_id', normalizedFilter || 'self') : '';

      const [statsData, usersCountData, orderStatsData] = await Promise.all([
        apiRequest(`/admin/stats${ownerQuery}`),
        apiRequest(`/admin/users/count${agentQuery}`),
        apiRequest(`/admin/order-stats${agentQuery}`)
      ]);

      const mergedStats = { ...(statsData.data || {}), users_count: (usersCountData?.data?.count ?? 0) };
      setStats(mergedStats);
      safeSetOrderStats(orderStatsData.data || {
        total_orders: 0,
        status_counts: {},
        today_orders: 0,
        total_revenue: 0
      });
    } catch (err) {
      console.error('刷新统计数据失败:', err);
    }
  };

  const handleAddProduct = async (productData) => {
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('name', productData.name);
      formData.append('category', productData.category);
      formData.append('price', productData.price);
      formData.append('stock', productData.stock);
      formData.append('description', productData.description);
      formData.append('cost', productData.cost || '0');
      formData.append('is_hot', productData.is_hot ? 'true' : 'false');
      formData.append('is_not_for_sale', productData.is_not_for_sale ? 'true' : 'false');
      formData.append('reservation_required', productData.reservation_required ? 'true' : 'false');
      formData.append('reservation_cutoff', productData.reservation_cutoff || '');
      formData.append('reservation_note', productData.reservation_note || '');

      if (productData.image) {
        formData.append('image', productData.image);
      }

      if (productData.discount !== undefined && productData.discount !== null) {
        formData.append('discount', productData.discount);
      }

      if (productData.variants && productData.variants.length > 0) {
        formData.append('variants', JSON.stringify(productData.variants));
      }

      const response = await apiRequest(`${staffPrefix}/products`, {
        method: 'POST',
        body: formData,
        headers: {}
      });

      if (response && response.product) {
        const raw = response.product;
        const normalizedNewProduct = {
          ...raw,
          is_active: normalizeBooleanFlag(raw.is_active, true),
          is_hot: normalizeBooleanFlag(raw.is_hot, false),
          is_not_for_sale: normalizeBooleanFlag(raw.is_not_for_sale, false),
          reservation_required: normalizeBooleanFlag(raw.reservation_required, false)
        };
        setProducts(prevProducts => [normalizedNewProduct, ...prevProducts]);
        setShowAddModal(false);
        await refreshStats();
        safeRefreshAllWarnings().catch(err => console.error('刷新警告状态失败:', err));
      } else {
        setShowAddModal(false);
        await loadData();
        safeRefreshAllWarnings().catch(err => console.error('刷新警告状态失败:', err));
      }

    } catch (err) {
      alert(err.message || '添加商品失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditProduct = async (productData) => {
    setIsSubmitting(true);

    try {
      const updateData = {
        name: productData.name,
        category: productData.category,
        price: productData.price,
        stock: productData.stock,
        description: productData.description,
        cost: productData.cost || 0,
        discount: productData.discount !== undefined && productData.discount !== null ? productData.discount : 10,
        is_hot: !!productData.is_hot,
        is_not_for_sale: !!productData.is_not_for_sale,
        reservation_required: !!productData.reservation_required,
        reservation_cutoff: productData.reservation_cutoff || '',
        reservation_note: productData.reservation_note || ''
      };

      const hasImageUpdate = !!productData.image;
      const hasStockStructureChange = productData.stock !== editingProduct.stock;
      const hasCategoryChange = productData.category !== editingProduct.category;
      const hasNameChange = productData.name !== editingProduct.name;
      const skipCloseModal = productData.skipCloseModal;

      await apiRequest(`${staffPrefix}/products/${editingProduct.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData)
      });

      if (productData.image) {
        const formData = new FormData();
        formData.append('image', productData.image);
        await apiRequest(`${staffPrefix}/products/${editingProduct.id}/image`, {
          method: 'POST',
          body: formData,
          headers: {}
        });
      }

      if (!skipCloseModal) {
        setEditingProduct(null);
        setShowEditModal(false);
      }

      const needsFullRefresh = hasImageUpdate || hasStockStructureChange || hasCategoryChange || hasNameChange;

      if (!skipCloseModal) {
        if (needsFullRefresh) {
          await loadData();
          safeRefreshAllWarnings().catch(err => console.error('刷新警告状态失败:', err));
        } else {
          try {
            const refreshedProduct = await apiRequest(`${staffPrefix}/products/${editingProduct.id}`);
            const latest = refreshedProduct?.data?.product || null;
            const normalizedLatest = latest ? {
              ...latest,
              is_active: normalizeBooleanFlag(latest.is_active, true),
              is_hot: normalizeBooleanFlag(latest.is_hot, false),
              is_not_for_sale: normalizeBooleanFlag(latest.is_not_for_sale, false),
              reservation_required: normalizeBooleanFlag(latest.reservation_required, false)
            } : null;
            const updatedProducts = products.map(p => {
              if (p.id === editingProduct.id) {
                return {
                  ...p,
                  ...updateData,
                  ...(normalizedLatest || {})
                };
              }
              return p;
            });
            setProducts(updatedProducts);
            await refreshStats();
            safeRefreshAllWarnings().catch(err => console.error('刷新警告状态失败:', err));
          } catch (refreshErr) {
            console.error('重新获取商品数据失败，执行完整刷新:', refreshErr);
            await loadData();
            safeRefreshAllWarnings().catch(err => console.error('刷新警告状态失败:', err));
          }
        }
      }

    } catch (err) {
      alert(err.message || '更新商品失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  const refreshSingleProduct = async (productId) => {
    try {
      const refreshedProduct = await apiRequest(`${staffPrefix}/products/${productId}`);
      if (refreshedProduct.data?.product) {
        const latest = refreshedProduct.data.product;
        const normalizedLatest = {
          ...latest,
          is_active: normalizeBooleanFlag(latest.is_active, true),
          is_hot: normalizeBooleanFlag(latest.is_hot, false),
          is_not_for_sale: normalizeBooleanFlag(latest.is_not_for_sale, false),
          reservation_required: normalizeBooleanFlag(latest.reservation_required, false)
        };
        const updatedProducts = products.map(p => {
          if (p.id === productId) {
            return {
              ...p,
              ...normalizedLatest
            };
          }
          return p;
        });
        setProducts(updatedProducts);
      }
    } catch (err) {
      console.error('刷新商品数据失败:', err);
    }
  };

  const handleUpdateDiscount = async (productId, zhe) => {
    if (operatingProducts.has(productId)) return;
    setOperatingProducts(prev => new Set(prev).add(productId));
    const updatedProducts = products.map(p =>
      p.id === productId ? { ...p, discount: zhe } : p
    );
    setProducts(updatedProducts);

    try {
      await apiRequest(`${staffPrefix}/products/${productId}`, {
        method: 'PUT',
        body: JSON.stringify({ discount: zhe })
      });
    } catch (e) {
      const originalProduct = products.find(p => p.id === productId);
      const revertedProducts = products.map(p =>
        p.id === productId ? { ...p, discount: originalProduct?.discount || 10 } : p
      );
      setProducts(revertedProducts);
      alert(e.message || '更新折扣失败');
    } finally {
      setOperatingProducts(prev => {
        const newSet = new Set(prev);
        newSet.delete(productId);
        return newSet;
      });
    }
  };

  const handleBatchUpdateDiscount = async (productIds, zhe) => {
    if (!productIds || productIds.length === 0) { alert('请选择要设置折扣的商品'); return; }

    const originalProducts = [...products];
    const updatedProducts = products.map(p =>
      productIds.includes(p.id) ? { ...p, discount: zhe } : p
    );
    setProducts(updatedProducts);

    try {
      await apiRequest(`${staffPrefix}/products`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_ids: productIds, discount: zhe })
      });
    } catch (e) {
      setProducts(originalProducts);
      alert(e.message || '批量设置折扣失败');
    }
  };

  const handleToggleActive = async (product) => {
    if (operatingProducts.has(product.id)) return;
    const currentActive = !(product.is_active === 0 || product.is_active === false);
    const target = currentActive ? 0 : 1;
    setOperatingProducts(prev => new Set(prev).add(product.id));
    const updatedProducts = products.map(p =>
      p.id === product.id ? { ...p, is_active: target } : p
    );
    setProducts(updatedProducts);

    try {
      await apiRequest(`${staffPrefix}/products/${product.id}`, { method: 'PUT', body: JSON.stringify({ is_active: target }) });
      safeRefreshAllWarnings().catch(err => console.error('刷新警告状态失败:', err));
    } catch (e) {
      const revertedProducts = products.map(p =>
        p.id === product.id ? { ...p, is_active: product.is_active } : p
      );
      setProducts(revertedProducts);
      alert(e.message || '更新上下架状态失败');
    } finally {
      setOperatingProducts(prev => {
        const newSet = new Set(prev);
        newSet.delete(product.id);
        return newSet;
      });
    }
  };

  const handleToggleHot = async (product, nextHot) => {
    if (operatingProducts.has(product.id)) return;
    setOperatingProducts(prev => new Set(prev).add(product.id));
    const updatedProducts = products.map(p =>
      p.id === product.id ? { ...p, is_hot: !!nextHot } : p
    );
    setProducts(updatedProducts);

    try {
      await apiRequest(`${staffPrefix}/products/${product.id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_hot: !!nextHot })
      });
    } catch (e) {
      const revertedProducts = products.map(p =>
        p.id === product.id ? { ...p, is_hot: !nextHot } : p
      );
      setProducts(revertedProducts);
      alert(e.message || '更新热销状态失败');
    } finally {
      setOperatingProducts(prev => {
        const newSet = new Set(prev);
        newSet.delete(product.id);
        return newSet;
      });
    }
  };

  const normalizeStockValue = (value) => {
    if (value === null || value === undefined || value === '') return 0;
    const parsed = typeof value === 'number' ? value : parseInt(value, 10);
    if (!Number.isFinite(parsed)) return 0;
    return parsed < 0 ? 0 : parsed;
  };

  const handleUpdateStock = async (productId, change = {}) => {
    const { mode = 'set', delta, target, optimisticStock } = change || {};
    const safeDeltaRaw = Number.isFinite(delta) ? delta : parseInt(delta, 10);
    const safeDelta = Number.isNaN(safeDeltaRaw) ? 0 : safeDeltaRaw;

    const existingProduct = products.find(p => p.id === productId);
    if (!existingProduct) {
      alert('未找到要更新的商品');
      return;
    }

    const previousStock = normalizeStockValue(existingProduct.stock);

    const optimisticValue = (() => {
      if (typeof optimisticStock === 'number') {
        return normalizeStockValue(optimisticStock);
      }
      if (mode === 'delta') {
        return normalizeStockValue(previousStock + safeDelta);
      }
      if (target !== undefined) {
        return normalizeStockValue(target);
      }
      return previousStock;
    })();

    setProducts(prev => prev.map(p =>
      p.id === productId ? { ...p, stock: optimisticValue } : p
    ));

    try {
      const latestResponse = await apiRequest(`${staffPrefix}/products/${productId}`);
      const latestProduct = latestResponse?.data?.product;
      if (!latestProduct) {
        throw new Error('未获取到最新的商品信息');
      }

      const latestStock = normalizeStockValue(latestProduct.stock);

      const nextStock = (() => {
        if (mode === 'delta') {
          return normalizeStockValue(latestStock + safeDelta);
        }
        if (mode === 'set') {
          const normalizedTarget = target !== undefined ? normalizeStockValue(target) : optimisticValue;
          return normalizedTarget;
        }
        return normalizeStockValue(optimisticValue);
      })();

      const applyLatestSnapshot = (baseProduct, stockValue) => {
        const next = { ...baseProduct, stock: stockValue };
        if (Array.isArray(latestProduct.variants)) {
          next.variants = latestProduct.variants;
          next.has_variants = latestProduct.has_variants;
          if (typeof latestProduct.total_variant_stock !== 'undefined') {
            next.total_variant_stock = latestProduct.total_variant_stock;
          }
        }
        return next;
      };

      if (nextStock === latestStock) {
        setProducts(prev => prev.map(p =>
          p.id === productId ? applyLatestSnapshot(p, latestStock) : p
        ));
        return nextStock;
      }

      await apiRequest(`${staffPrefix}/products/${productId}`, {
        method: 'PUT',
        body: JSON.stringify({ stock: nextStock })
      });

      setProducts(prev => prev.map(p =>
        p.id === productId ? applyLatestSnapshot(p, nextStock) : p
      ));

      refreshStats().catch(err => console.error('刷新统计数据失败:', err));
      safeRefreshAllWarnings().catch(err => console.error('刷新警告状态失败:', err));

      return nextStock;
    } catch (err) {
      setProducts(prev => prev.map(p =>
        p.id === productId ? { ...p, stock: previousStock } : p
      ));
      alert(err.message || '更新库存失败');
      throw err;
    }
  };

  const handleProductVariantsSync = (productId, payload = {}) => {
    const variantList = Array.isArray(payload.variants) ? payload.variants : [];
    const computedTotal = typeof payload.totalStock === 'number'
      ? payload.totalStock
      : variantList.reduce((sum, item) => sum + normalizeStockValue(item?.stock), 0);
    const safeTotal = normalizeStockValue(computedTotal);

    setProducts(prev => prev.map(p => {
      if (p.id !== productId) return p;
      return {
        ...p,
        variants: variantList,
        has_variants: variantList.length > 0,
        total_variant_stock: safeTotal
      };
    }));

    setVariantStockProduct(prev => {
      if (!prev || prev.id !== productId) return prev;
      return {
        ...prev,
        variants: variantList,
        has_variants: variantList.length > 0,
        total_variant_stock: safeTotal
      };
    });
  };

  const handleDeleteProduct = async (product) => {
    if (!confirm(`确定要删除商品\"${product.name}\"吗？此操作不可恢复。`)) {
      return;
    }

    const originalProducts = [...products];
    const updatedProducts = products.filter(p => p.id !== product.id);
    setProducts(updatedProducts);

    try {
      await apiRequest(`${staffPrefix}/products/${product.id}`, {
        method: 'DELETE'
      });

      alert('商品删除成功！');
      safeRefreshAllWarnings().catch(err => console.error('刷新警告状态失败:', err));
    } catch (err) {
      setProducts(originalProducts);
      alert(err.message || '删除商品失败');
    }
  };

  const handleSelectProduct = (productId, checked) => {
    if (checked) {
      setSelectedProducts(prev => [...prev, productId]);
    } else {
      setSelectedProducts(prev => prev.filter(id => id !== productId));
    }
  };

  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedProducts(visibleProducts.map(product => product.id));
    } else {
      setSelectedProducts([]);
    }
  };

  const handleBatchDelete = async (productIds) => {
    if (productIds.length === 0) {
      alert('请选择要删除的商品');
      return;
    }

    const productNames = products
      .filter(product => productIds.includes(product.id))
      .map(product => product.name)
      .join('、');

    if (!confirm(`确定要删除以下 ${productIds.length} 件商品吗？\n\n${productNames}\n\n此操作不可恢复。`)) {
      return;
    }

    const originalProducts = [...products];
    const updatedProducts = products.filter(product => !productIds.includes(product.id));
    setProducts(updatedProducts);
    setSelectedProducts([]);

    try {
      setIsSubmitting(true);
      await apiRequest(`${staffPrefix}/products/0`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ product_ids: productIds })
      });

      alert(`成功删除 ${productIds.length} 件商品！`);
      safeRefreshAllWarnings().catch(err => console.error('刷新警告状态失败:', err));

    } catch (err) {
      setProducts(originalProducts);
      setSelectedProducts(productIds);
      alert(err.message || '批量删除商品失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBatchToggleActive = async (productIds, isActive) => {
    if (productIds.length === 0) {
      return;
    }

    const originalProducts = [...products];
    const updatedProducts = products.map(p =>
      productIds.includes(p.id) ? { ...p, is_active: isActive } : p
    );
    setProducts(updatedProducts);

    try {
      setIsSubmitting(true);
      const promises = productIds.map(productId =>
        apiRequest(`${staffPrefix}/products/${productId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ is_active: isActive })
        })
      );

      await Promise.all(promises);
      safeRefreshAllWarnings().catch(err => console.error('刷新警告状态失败:', err));
    } catch (err) {
      setProducts(originalProducts);
      console.error('批量操作失败:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSortClick = (column) => {
    if (sortBy === column) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      if (column === 'category') {
        setSortOrder('asc');
      } else if (column === 'price') {
        setSortOrder('asc');
      } else if (column === 'stock') {
        setSortOrder('desc');
      } else if (column === 'created_at') {
        setSortOrder('desc');
      }
    }
  };

  const filteredByCategory = productCategoryFilter === '全部'
    ? products
    : products.filter(p => p.category === productCategoryFilter);
  const isProductInactive = (product) => (product.is_active === 0 || product.is_active === false);
  const isProductOutOfStock = (product) => {
    if (normalizeBooleanFlag(product.is_not_for_sale, false)) {
      return false;
    }
    if (product.has_variants) {
      if (Array.isArray(product.variants) && product.variants.length > 0) {
        return product.variants.every(variant => (variant.stock || 0) <= 0);
      }
      if (typeof product.total_variant_stock === 'number') {
        return product.total_variant_stock <= 0;
      }
      return false;
    }
    return (product.stock || 0) <= 0;
  };

  const getFirstSignificantChar = (str) => {
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (/[A-Za-z0-9\u4e00-\u9fff]/.test(ch) || /[\u{1F000}-\u{1F9FF}]/u.test(ch)) {
        return ch;
      }
    }
    return '';
  };

  const getCharType = (ch) => {
    if (!ch) return 4;
    if (/[\u{1F000}-\u{1F9FF}]/u.test(ch)) return 0;
    if (/[A-Za-z]/.test(ch)) return 1;
    if (/[0-9]/.test(ch)) return 2;
    if (/[\u4e00-\u9fff]/.test(ch)) return 3;
    return 4;
  };

  const getProductStock = (product) => {
    if (normalizeBooleanFlag(product.is_not_for_sale, false)) {
      return Number.POSITIVE_INFINITY;
    }
    if (product.has_variants) {
      if (Array.isArray(product.variants) && product.variants.length > 0) {
        return product.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
      }
      if (typeof product.total_variant_stock === 'number') {
        return product.total_variant_stock;
      }
      return 0;
    }
    return product.stock || 0;
  };

  const getDiscountedPrice = (product) => {
    const discount = (typeof product.discount === 'number' && product.discount)
      ? product.discount
      : (product.discount ? parseFloat(product.discount) : 10);
    const hasDiscount = discount && discount > 0 && discount < 10;
    return hasDiscount ? (Math.round(product.price * (discount / 10) * 100) / 100) : product.price;
  };

  const compareCategoryName = (a, b) => {
    const aName = String(a.category || '');
    const bName = String(b.category || '');

    const aChar = getFirstSignificantChar(aName);
    const bChar = getFirstSignificantChar(bName);

    const aType = getCharType(aChar);
    const bType = getCharType(bChar);

    if (aType !== bType) {
      return aType - bType;
    }

    try {
      const collator = new Intl.Collator(
        ['zh-Hans-u-co-pinyin', 'zh-Hans', 'zh', 'en', 'en-US'],
        { sensitivity: 'base', numeric: true }
      );
      return collator.compare(aName, bName);
    } catch (e) {
      return aName.localeCompare(bName, 'zh-Hans-u-co-pinyin');
    }
  };

  const visibleProducts = useMemo(() => {
    let result = filteredByCategory.filter((product) => {
      if (showOnlyOutOfStock && !isProductOutOfStock(product)) return false;
      if (showOnlyInactive && !isProductInactive(product)) return false;
      if (showOnlyActive && isProductInactive(product)) return false;
      return true;
    });

    if (sortBy === null) {
      result = [...result].sort((a, b) => {
        const aActive = !isProductInactive(a);
        const bActive = !isProductInactive(b);
        if (aActive !== bActive) {
          return aActive ? -1 : 1;
        }
        const aIsHot = Boolean(a.is_hot);
        const bIsHot = Boolean(b.is_hot);

        if (aIsHot !== bIsHot) {
          return bIsHot ? 1 : -1;
        }

        return compareCategoryName(a, b);
      });
    } else {
      result = [...result].sort((a, b) => {
        const aActive = !isProductInactive(a);
        const bActive = !isProductInactive(b);
        if (aActive !== bActive) {
          return aActive ? -1 : 1;
        }
        let orderResult = 0;

        if (sortBy === 'category') {
          orderResult = compareCategoryName(a, b);
        } else if (sortBy === 'price') {
          const aPrice = getDiscountedPrice(a);
          const bPrice = getDiscountedPrice(b);
          orderResult = aPrice - bPrice;
        } else if (sortBy === 'stock') {
          const aStock = getProductStock(a);
          const bStock = getProductStock(b);
          orderResult = aStock - bStock;
        } else if (sortBy === 'created_at') {
          const aTime = new Date(a.created_at.replace(' ', 'T') + 'Z').getTime();
          const bTime = new Date(b.created_at.replace(' ', 'T') + 'Z').getTime();
          orderResult = aTime - bTime;
        }

        return sortOrder === 'desc' ? -orderResult : orderResult;
      });
    }

    return result;
  }, [filteredByCategory, showOnlyOutOfStock, showOnlyInactive, showOnlyActive, sortBy, sortOrder]);

  return {
    stats,
    categories,
    products,
    isLoading,
    isSubmitting,
    error,
    showAddModal,
    setShowAddModal,
    showEditModal,
    setShowEditModal,
    editingProduct,
    setEditingProduct,
    variantStockProduct,
    setVariantStockProduct,
    selectedProducts,
    productCategoryFilter,
    setProductCategoryFilter,
    showOnlyOutOfStock,
    setShowOnlyOutOfStock,
    showOnlyInactive,
    setShowOnlyInactive,
    showOnlyActive,
    setShowOnlyActive,
    sortBy,
    sortOrder,
    showInactiveInShop,
    isLoadingShopSetting,
    operatingProducts,
    updateShopInactiveSetting,
    loadData,
    handleAddProduct,
    handleEditProduct,
    refreshSingleProduct,
    refreshStats,
    handleUpdateDiscount,
    handleBatchUpdateDiscount,
    handleToggleActive,
    handleToggleHot,
    handleUpdateStock,
    handleProductVariantsSync,
    handleDeleteProduct,
    handleSelectProduct,
    handleSelectAllProducts: handleSelectAll,
    handleBatchDelete,
    handleBatchToggleActive,
    handleSortClick,
    visibleProducts,
  };
}
