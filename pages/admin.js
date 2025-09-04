import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth, useApi, useAdminShop } from '../hooks/useAuth';
import { useRouter } from 'next/router';
import RetryImage from '../components/RetryImage';
import { getProductImage } from '../utils/urls';


// 店铺状态卡片（打烊/营业）
const ShopStatusCard = () => {
  const { getStatus, updateStatus } = useAdminShop();
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(true);
  const [note, setNote] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const s = await getStatus();
        setIsOpen(!!s.data?.is_open);
        setNote(s.data?.note || '');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggle = async () => {
    const next = !isOpen;
    setIsOpen(next);
    try { await updateStatus(next, note); } catch (e) {}
  };

  const saveNote = async () => {
    try { await updateStatus(isOpen, note); alert('提示已更新'); } catch (e) {}
  };

  return (
    <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-4 flex items-center justify-between">
      <div>
        <div className="text-sm text-gray-600">店铺状态</div>
        <div className="mt-1 text-lg font-semibold">{isOpen ? '营业中' : '打烊中'}</div>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="text"
            placeholder="打烊提示语（可选）"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm w-64"
          />
          <button onClick={saveNote} className="text-sm px-3 py-1.5 bg-gray-100 rounded-md border">保存提示</button>
        </div>
      </div>
      <button
        onClick={toggle}
        className={isOpen ? 'px-4 py-2 rounded-md bg-red-600 text-white' : 'px-4 py-2 rounded-md bg-green-600 text-white'}
      >{isOpen ? '设为打烊' : '设为营业'}</button>
    </div>
  );
};

// 内联库存控制组件
const StockControl = ({ product, onUpdateStock }) => {
  const [stock, setStock] = useState(product.stock);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // 当商品库存发生变化时同步状态
  useEffect(() => {
    setStock(product.stock);
  }, [product.stock]);

  const handleStockChange = async (newStock) => {
    if (newStock < 0) return;
    
    setIsLoading(true);
    try {
      await onUpdateStock(product.id, newStock);
      setStock(newStock);
    } catch (error) {
      // 如果更新失败，恢复原值
      setStock(product.stock);
    } finally {
      setIsLoading(false);
    }
  };

  const handleIncrement = () => {
    const newStock = stock + 1;
    setStock(newStock);
    handleStockChange(newStock);
  };

  const handleDecrement = () => {
    if (stock > 0) {
      const newStock = stock - 1;
      setStock(newStock);
      handleStockChange(newStock);
    }
  };

  const handleInputChange = (e) => {
    const newValue = parseInt(e.target.value) || 0;
    setStock(newValue);
  };

  const handleInputBlur = () => {
    setIsEditing(false);
    if (stock !== product.stock) {
      handleStockChange(stock);
    }
  };

  const handleInputKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleInputBlur();
    }
  };

  return (
    <div className="flex items-center space-x-1">
      <button
        onClick={handleDecrement}
        disabled={isLoading || stock <= 0}
        className="w-6 h-6 flex items-center justify-center bg-red-500 hover:bg-red-600 text-white text-xs rounded-full disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        title="减少库存"
      >
        -
      </button>
      
      {isEditing ? (
        <input
          type="number"
          value={stock}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          onKeyPress={handleInputKeyPress}
          className="w-12 px-1 py-0.5 text-center text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
          min="0"
          autoFocus
        />
      ) : (
        <span 
          onClick={() => setIsEditing(true)}
          className="w-12 text-center text-sm cursor-pointer hover:bg-gray-100 px-1 py-0.5 rounded"
          title="点击编辑"
        >
          {isLoading ? '...' : stock}
        </span>
      )}
      
      <button
        onClick={handleIncrement}
        disabled={isLoading}
        className="w-6 h-6 flex items-center justify-center bg-green-500 hover:bg-green-600 text-white text-xs rounded-full disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        title="增加库存"
      >
        +
      </button>
    </div>
  );
};

// 商品表格组件
const ProductTable = ({ products, onRefresh, onEdit, onDelete, onUpdateStock, onBatchDelete, onBatchUpdateDiscount, selectedProducts, onSelectProduct, onSelectAll, onUpdateDiscount, onToggleActive, onOpenVariantStock }) => {
  const isAllSelected = products.length > 0 && selectedProducts.length === products.length;
  const isPartiallySelected = selectedProducts.length > 0 && selectedProducts.length < products.length;
  const [bulkZhe, setBulkZhe] = React.useState('');

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
        <h3 className="text-lg font-medium text-gray-900">商品列表</h3>
        {selectedProducts.length > 0 && (
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-600">已选择 {selectedProducts.length} 件商品</span>
            {/* 批量折扣设置 */}
            <div className="flex items-center space-x-2">
              <select
                className="text-xs border border-gray-300 rounded px-1 py-0.5"
                value={bulkZhe}
                onChange={(e) => {
                  const val = e.target.value;
                  setBulkZhe(val);
                  if (val === '') return; // 空白，不执行
                  const v = parseFloat(val);
                  onBatchUpdateDiscount(selectedProducts, v);
                  // 重置为空，便于再次选择相同折扣（例如10折恢复）
                  setBulkZhe('');
                }}
                title="批量设置折扣（单位：折）"
              >
                <option value=""></option>
                {Array.from({ length: 20 }).map((_, i) => {
                  const val = 10 - i * 0.5;
                  const v = Math.max(0.5, parseFloat(val.toFixed(1)));
                  return (
                    <option key={v} value={String(v)}>{v}折</option>
                  );
                })}
              </select>
            </div>
            <button
              onClick={() => onBatchDelete(selectedProducts)}
              className="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            >
              批量删除
            </button>
          </div>
        )}
      </div>
      
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  ref={input => {
                    if (input) input.indeterminate = isPartiallySelected;
                  }}
                  onChange={(e) => onSelectAll(e.target.checked)}
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                />
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                商品信息
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                分类
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                价格/折扣
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                库存
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                创建时间
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {products.map((product) => (
              <tr key={product.id} className={`hover:bg-gray-50 ${selectedProducts.includes(product.id) ? 'bg-blue-50' : ''}`}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={selectedProducts.includes(product.id)}
                    onChange={(e) => onSelectProduct(product.id, e.target.checked)}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                  />
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 h-10 w-10">
                      {getProductImage(product) ? (
                        <RetryImage
                          className="h-10 w-10 rounded-md object-cover"
                          src={getProductImage(product)}
                          alt={product.name}
                          maxRetries={3}
                          onFinalError={() => {
                            console.log(`管理员页面商品图片最终加载失败: ${product.name}`);
                          }}
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-md bg-gray-100 flex items-center justify-center">
                          <span className="text-gray-400 text-xs">图</span>
                        </div>
                      )}
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900">
                        {product.name}
                      </div>
                      <div className="text-sm text-gray-500 max-w-xs truncate">
                        {product.description}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                    {product.category}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  <div className="flex items-center gap-3">
                    {(() => {
                      const z = (typeof product.discount === 'number' && product.discount) ? product.discount : (product.discount ? parseFloat(product.discount) : 10);
                      const has = z && z > 0 && z < 10;
                      const finalPrice = has ? (Math.round(product.price * (z / 10) * 100) / 100) : product.price;
                      return (
                        <div className="flex items-center gap-2">
                          {has && (<span className="text-xs text-gray-400 line-through">¥{product.price}</span>)}
                          <span className="font-semibold">¥{finalPrice}</span>
                        </div>
                      );
                    })()}
                    <select
                      className="text-xs border border-gray-300 rounded px-1 py-0.5"
                      value={(typeof product.discount === 'number' && product.discount) ? product.discount : (product.discount ? parseFloat(product.discount) : 10)}
                      onChange={(e) => onUpdateDiscount(product.id, parseFloat(e.target.value))}
                      title="设置折扣（单位：折）"
                    >
                      {Array.from({ length: 20 }).map((_, i) => {
                        const val = 10 - i * 0.5;
                        const v = Math.max(0.5, parseFloat(val.toFixed(1)));
                        return (
                          <option key={v} value={v}>{v}折</option>
                        );
                      })}
                    </select>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {product.has_variants ? (
                    <button
                      onClick={() => onOpenVariantStock(product)}
                      className="px-3 py-1.5 rounded-md border text-sm hover:bg-gray-50"
                    >操作</button>
                  ) : (
                    <StockControl 
                      product={product} 
                      onUpdateStock={(productId, newStock) => onUpdateStock(productId, newStock)}
                    />
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(product.created_at).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <div className="flex space-x-2">
                    <button
                      onClick={() => onEdit(product)}
                      className="text-indigo-600 hover:text-indigo-900"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => onToggleActive(product)}
                      className={`${product.is_active === 0 ? 'text-green-600 hover:text-green-800' : 'text-gray-600 hover:text-gray-800'}`}
                    >
                      {product.is_active === 0 ? '上架' : '下架'}
                    </button>
                    <button
                      onClick={() => onDelete(product)}
                      className="text-red-600 hover:text-red-900"
                    >
                      删除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {products.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">暂无商品</p>
        </div>
      )}
    </div>
  );
};

// 统计卡片组件
const StatsCard = ({ title, value, icon, color = "indigo" }) => {
  const colorClasses = {
    indigo: "bg-indigo-500",
    green: "bg-green-500",
    yellow: "bg-yellow-500",
    purple: "bg-purple-500"
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center">
        <div className={`flex-shrink-0 ${colorClasses[color]} rounded-md p-3`}>
          <div className="text-white text-xl">{icon}</div>
        </div>
        <div className="ml-5 w-0 flex-1">
          <dl>
            <dt className="text-sm font-medium text-gray-500 truncate">{title}</dt>
            <dd className="text-lg font-medium text-gray-900">{value}</dd>
          </dl>
        </div>
      </div>
    </div>
  );
};

// 分类输入组件（支持选择和自定义输入）
const CategoryInput = ({ value, onChange, required = false, disabled = false }) => {
  const [categories, setCategories] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [inputValue, setInputValue] = useState(value || '');
  const { apiRequest } = useApi();

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const response = await apiRequest('/products/categories');
        const cats = response.data.categories || [];
        try {
          const collator = new Intl.Collator(['zh-Hans-u-co-pinyin', 'zh'], { sensitivity: 'base', numeric: true });
          cats.sort((a, b) => collator.compare(a.name || '', b.name || ''));
        } catch (e) {
          cats.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
        }
        setCategories(cats);
      } catch (error) {
        console.error('获取分类失败:', error);
      }
    };
    loadCategories();
  }, [apiRequest]);

  useEffect(() => {
    setInputValue(value || '');
  }, [value]);

  const handleInputChange = (e) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange(newValue);
    setShowSuggestions(true); // 始终显示建议
  };

  const handleSelectCategory = (categoryName) => {
    setInputValue(categoryName);
    onChange(categoryName);
    setShowSuggestions(false);
  };

  const filteredCategories = inputValue.trim() === '' 
    ? categories  // 如果输入为空，显示所有分类
    : categories.filter(cat => 
        cat.name.toLowerCase().includes(inputValue.toLowerCase())
      );

  return (
    <div className="relative">
      <input
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onFocus={() => setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
        required={required}
        disabled={disabled}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100"
        placeholder="输入或选择分类"
      />
      
      {showSuggestions && categories.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
          {filteredCategories.length > 0 ? (
            filteredCategories.map((category) => (
              <button
                key={category.id}
                type="button"
                className="w-full px-3 py-2 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
                onClick={() => handleSelectCategory(category.name)}
              >
                {category.name}
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-gray-500 text-sm">
              没有匹配的分类
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// 编辑商品表单组件
const EditProductForm = ({ product, onSubmit, isLoading, onCancel }) => {
  const [formData, setFormData] = useState({
    name: product.name || '',
    category: product.category || '',
    price: product.price || '',
    stock: product.stock || '',
    description: product.description || ''
  });
  const [imageFile, setImageFile] = useState(null);

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const compressImage = (file, { maxSize = 1280, quality = 0.8 } = {}) => new Promise((resolve, reject) => {
    try {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        const scale = Math.min(1, maxSize / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error('图片压缩失败'));
          const newFile = new File([blob], (file.name || 'image').replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
          resolve(newFile);
        }, 'image/jpeg', quality);
      };
      img.onerror = () => reject(new Error('图片加载失败'));
      img.src = URL.createObjectURL(file);
    } catch (err) { reject(err); }
  });

  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      // 压缩到最长边 <= 1280，质量 0.8，避免上传过大导致 413
      const compressed = await compressImage(file, { maxSize: 1280, quality: 0.8 });
      setImageFile(compressed);
    } catch (err) {
      // 退回原文件
      setImageFile(file);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // 验证必填字段
    if (!formData.name || !formData.category || !formData.price) {
      alert('请填写必填字段');
      return;
    }
    
    // 验证价格
    const price = parseFloat(formData.price);
    if (isNaN(price) || price <= 0) {
      alert('请输入有效的价格');
      return;
    }
    
    // 验证库存
    const stock = parseInt(formData.stock) || 0;
    if (stock < 0) {
      alert('库存不能为负数');
      return;
    }
    
    onSubmit({
      ...formData,
      price,
      stock,
      image: imageFile
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-medium text-gray-900">编辑商品</h3>
        <button
          onClick={onCancel}
          className="text-gray-400 hover:text-gray-600"
        >
          ×
        </button>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              商品名称 *
            </label>
            <input
              type="text"
              name="name"
              required
              value={formData.name}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="请输入商品名称"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              商品分类 *
            </label>
            <CategoryInput
              value={formData.category}
              onChange={(value) => setFormData({...formData, category: value})}
              required
            />
          </div>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              价格 *
            </label>
            <input
              type="number"
              name="price"
              required
              min="0"
              step="0.01"
              value={formData.price}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="0.00"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              库存
            </label>
            <input
              type="number"
              name="stock"
              min="0"
              value={formData.stock}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="0"
            />
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            更换商品图片
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            支持 JPG、PNG 格式，建议尺寸 400x400。留空则不更改图片。
          </p>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            商品描述
          </label>
          <textarea
            name="description"
            rows={3}
            value={formData.description}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="请输入商品描述"
          />
        </div>
        
        <div className="flex space-x-3 pt-4">
          <button
            type="submit"
            disabled={isLoading}
            className="flex-1 bg-indigo-600 text-white py-2 px-4 rounded-md font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? '更新中...' : '更新商品'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            取消
          </button>
        </div>
      </form>

      {/* 规格管理 */}
      <VariantManager productId={product.id} />
    </div>
  );
};

// 规格管理（每个商品独立）
const VariantManager = ({ productId }) => {
  const { apiRequest } = useApi();
  const [variants, setVariants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newStock, setNewStock] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiRequest(`/admin/products/${productId}/variants`);
      setVariants(res?.data?.variants || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [productId]);

  const addVariant = async () => {
    if (!newName) return;
    await apiRequest(`/admin/products/${productId}/variants`, { method: 'POST', body: JSON.stringify({ name: newName, stock: parseInt(newStock) || 0 })});
    setNewName(''); setNewStock(0); load();
  };
  const updateVariant = async (id, patch) => {
    await apiRequest(`/admin/variants/${id}`, { method: 'PUT', body: JSON.stringify(patch)});
    load();
  };
  const removeVariant = async (id) => {
    if (!confirm('确定删除该规格？')) return;
    await apiRequest(`/admin/variants/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="mt-6 border-t border-gray-200 pt-4">
      <h4 className="text-md font-medium text-gray-900 mb-3">商品规格</h4>
      <div className="flex items-center gap-2 mb-3">
        <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="规格名称（如：原味）" className="px-3 py-1.5 border rounded-md text-sm" />
        <input type="number" value={newStock} min={0} onChange={e=>setNewStock(e.target.value)} placeholder="库存" className="w-24 px-3 py-1.5 border rounded-md text-sm" />
        <button onClick={addVariant} className="px-3 py-1.5 bg-indigo-600 text-white rounded-md text-sm">添加规格</button>
      </div>
      {loading ? (
        <div className="text-sm text-gray-500">加载中...</div>
      ) : variants.length === 0 ? (
        <div className="text-sm text-gray-500">暂无规格。添加规格后，总库存以各规格库存为准。</div>
      ) : (
        <div className="space-y-2">
          {variants.map(v => (
            <div key={v.id} className="flex items-center justify-between bg-gray-50 rounded-md p-2 border">
              <div className="flex items-center gap-4">
                <input className="px-2 py-1 border rounded text-sm" defaultValue={v.name} onBlur={(e)=>updateVariant(v.id,{name:e.target.value})} />
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-600">库存</span>
                  <input type="number" min={0} className="w-20 px-2 py-1 border rounded text-sm" defaultValue={v.stock} onBlur={(e)=>updateVariant(v.id,{stock:parseInt(e.target.value)||0})} />
                </div>
              </div>
              <button onClick={()=>removeVariant(v.id)} className="text-xs text-red-600 hover:text-red-700">删除</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// 规格库存编辑弹窗（仅库存增减与编辑）
const VariantStockModal = ({ product, onClose }) => {
  const { apiRequest } = useApi();
  const [variants, setVariants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiRequest(`/admin/products/${product.id}/variants`);
      setVariants(res?.data?.variants || []);
    } catch (e) {
      alert(e.message || '加载规格失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [product?.id]);

  const updateStock = async (variantId, newStock) => {
    if (newStock < 0) newStock = 0;
    setSaving(true);
    try {
      await apiRequest(`/admin/variants/${variantId}`, { method: 'PUT', body: JSON.stringify({ stock: parseInt(newStock) || 0 }) });
      setVariants(prev => prev.map(v => v.id === variantId ? { ...v, stock: parseInt(newStock) || 0 } : v));
    } catch (e) {
      alert(e.message || '更新库存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-lg shadow-lg w-96 p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium text-gray-900">规格库存 - {product?.name}</h4>
          <button className="text-gray-500 hover:text-gray-700" onClick={onClose}>✕</button>
        </div>
        {loading ? (
          <div className="text-sm text-gray-500">加载中...</div>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {(variants || []).map(v => (
              <div key={v.id} className="flex items-center justify-between px-3 py-2 border rounded-md">
                <div className="text-sm text-gray-800">{v.name}</div>
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => updateStock(v.id, (parseInt(v.stock) || 0) - 1)}
                    disabled={saving || (parseInt(v.stock) || 0) <= 0}
                    className="w-6 h-6 flex items-center justify-center bg-red-500 hover:bg-red-600 text-white text-xs rounded-full disabled:bg-gray-300 disabled:cursor-not-allowed"
                    title="减少库存"
                  >-</button>
                  <input
                    type="number"
                    className="w-16 px-1 py-0.5 text-center text-sm border border-gray-300 rounded"
                    value={v.stock}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      setVariants(prev => prev.map(x => x.id === v.id ? { ...x, stock: val } : x));
                    }}
                    onBlur={(e) => updateStock(v.id, parseInt(e.target.value) || 0)}
                    min="0"
                  />
                  <button
                    onClick={() => updateStock(v.id, (parseInt(v.stock) || 0) + 1)}
                    disabled={saving}
                    className="w-6 h-6 flex items-center justify-center bg-green-500 hover:bg-green-600 text-white text-xs rounded-full disabled:bg-gray-300 disabled:cursor-not-allowed"
                    title="增加库存"
                  >+</button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 text-right">
          <button onClick={onClose} className="px-3 py-1.5 rounded-md border text-sm hover:bg-gray-50">关闭</button>
        </div>
      </div>
    </div>
  );
};


// 统一状态映射（显示）
const UNIFIED_STATUS_MAP = {
  '未付款': { text: '未付款', color: 'gray' },
  '待确认': { text: '待确认', color: 'yellow' },
  '待配送': { text: '待配送', color: 'blue' },
  '配送中': { text: '配送中', color: 'purple' },
  '已完成': { text: '已完成', color: 'green' }
};

const UNIFIED_STATUS_ORDER = ['未付款', '待确认', '待配送', '配送中', '已完成'];

// 将后端的 status/payment_status 映射为统一状态
const getUnifiedStatus = (order) => {
  const ps = order?.payment_status;
  const st = order?.status;
  if (!ps && !st) return '未付款';
  if (ps === 'processing') return '待确认';
  if (ps !== 'succeeded') return '未付款';
  // 已支付
  if (st === 'shipped') return '配送中';
  if (st === 'delivered') return '已完成';
  // 已支付但未发货/未送达
  return '待配送';
};

// 订单表格组件
const OrderTable = ({ orders, onUpdateUnifiedStatus, isLoading, selectedOrders = [], onSelectOrder, onSelectAllOrders, onBatchDeleteOrders }) => {
  const [expanded, setExpanded] = React.useState({});
  const getStatusBadge = (status) => {
    const statusInfo = UNIFIED_STATUS_MAP[status] || { text: status, color: 'gray' };
    const colorClasses = {
      yellow: 'bg-yellow-100 text-yellow-800',
      blue: 'bg-blue-100 text-blue-800',
      purple: 'bg-purple-100 text-purple-800',
      green: 'bg-green-100 text-green-800',
      red: 'bg-red-100 text-red-800',
      gray: 'bg-gray-100 text-gray-800'
    };
    
    return (
      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${colorClasses[statusInfo.color]}`}>
        {statusInfo.text}
      </span>
    );
  };

  const formatDate = (val) => {
    if (typeof val === 'number' && isFinite(val)) {
      return new Date(val * 1000).toLocaleString('zh-CN');
    }
    const t = Date.parse(val);
    return isNaN(t) ? '' : new Date(t).toLocaleString('zh-CN');
  };

  const allIds = orders.map(o => o.id);
  const isAllSelected = allIds.length > 0 && allIds.every(id => selectedOrders.includes(id));

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
        <h3 className="text-lg font-medium text-gray-900">订单列表</h3>
        {selectedOrders.length > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">已选择 {selectedOrders.length} 笔订单</span>
            <button
              onClick={() => onBatchDeleteOrders(selectedOrders)}
              className="bg-red-600 text-white px-3 py-1.5 rounded-md text-sm hover:bg-red-700"
            >批量删除</button>
          </div>
        )}
      </div>
      
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <input
                  type="checkbox"
                  className="h-4 w-4 text-indigo-600 border-gray-300 rounded"
                  checked={isAllSelected}
                  onChange={(e) => onSelectAllOrders(e.target.checked, allIds)}
                />
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                订单信息
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                客户信息
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                商品数量
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                订单金额
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                状态
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                创建时间
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {orders.map((order) => (
              <React.Fragment key={order.id}>
              <tr className={`hover:bg-gray-50 ${selectedOrders.includes(order.id) ? 'bg-blue-50' : ''}`}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <input
                    type="checkbox"
                    className="h-4 w-4 text-indigo-600 border-gray-300 rounded"
                    checked={selectedOrders.includes(order.id)}
                    onChange={(e) => onSelectOrder(order.id, e.target.checked)}
                  />
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div>
                    <div className="text-sm font-medium text-gray-900 font-mono">
                      {order.id}
                    </div>
                    <div className="text-sm text-gray-500">
                      {order.payment_method === 'wechat' ? '微信支付' : order.payment_method}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      学号: {order.student_id || '未知'}
                    </div>
                    <div className="text-sm text-gray-500">
                      姓名: {order.shipping_info?.name || order.customer_name || '未知'}
                    </div>
                    <div className="text-sm text-gray-500">
                      电话: {order.shipping_info?.phone}
                    </div>
                    <div className="text-sm text-gray-500">
                      地址: {order.shipping_info?.full_address}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {(order.items || []).reduce((sum, it) => sum + (parseInt(it.quantity) || 0), 0)} 件
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  ¥{order.total_amount}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {getStatusBadge(getUnifiedStatus(order))}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatDate(order.created_at_timestamp ?? order.created_at)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <div className="flex items-center gap-2">
                    <select
                      value={getUnifiedStatus(order)}
                      onChange={(e) => onUpdateUnifiedStatus(order, e.target.value)}
                      disabled={isLoading}
                      className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100"
                    >
                      {UNIFIED_STATUS_ORDER.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => setExpanded(prev => ({...prev, [order.id]: !prev[order.id]}))}
                      className="text-sm text-indigo-600 hover:underline"
                    >{expanded[order.id] ? '收起明细' : '查看明细'}</button>
                  </div>
                </td>
              </tr>
              {expanded[order.id] && (
                <tr key={order.id + '_details'} className="bg-gray-50">
                  <td colSpan={8} className="px-6 py-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <div className="text-sm font-medium text-gray-900 mb-2">商品明细</div>
                        <div className="divide-y divide-gray-200 border rounded-md">
                          {(order.items || []).map((it, idx) => (
                            <div key={idx} className="flex justify-between items-center px-3 py-2 text-sm">
                              <div className="truncate">
                                <div className="text-gray-900 truncate">
                                  {it.name}
                                  {it.variant_name && (
                                    <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{it.variant_name}</span>
                                  )}
                                </div>
                                <div className="text-gray-500">x{it.quantity} · 单价 ¥{it.unit_price}</div>
                              </div>
                              <div className="text-gray-900">¥{it.subtotal}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900 mb-2">收货信息</div>
                        <div className="text-sm text-gray-600 space-y-1 border rounded-md px-3 py-2">
                          <div>姓名：{order.shipping_info?.name}</div>
                          <div>电话：{order.shipping_info?.phone}</div>
                          <div>地址：{order.shipping_info?.full_address}</div>
                          {order.note && <div>备注：{order.note}</div>}
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      
      {orders.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">暂无订单</p>
        </div>
      )}
    </div>
  );
};

// 添加商品表单组件
const AddProductForm = ({ onSubmit, isLoading, onCancel }) => {
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    price: '',
    stock: '',
    description: ''
  });
  const [imageFile, setImageFile] = useState(null);

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const compressImage = (file, { maxSize = 1280, quality = 0.8 } = {}) => new Promise((resolve, reject) => {
    try {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        const scale = Math.min(1, maxSize / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error('图片压缩失败'));
          const newFile = new File([blob], (file.name || 'image').replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
          resolve(newFile);
        }, 'image/jpeg', quality);
      };
      img.onerror = () => reject(new Error('图片加载失败'));
      img.src = URL.createObjectURL(file);
    } catch (err) { reject(err); }
  });

  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file, { maxSize: 1280, quality: 0.8 });
      setImageFile(compressed);
    } catch (err) {
      setImageFile(file);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // 验证必填字段
    if (!formData.name || !formData.category || !formData.price) {
      alert('请填写必填字段');
      return;
    }
    
    // 验证价格
    const price = parseFloat(formData.price);
    if (isNaN(price) || price <= 0) {
      alert('请输入有效的价格');
      return;
    }
    
    // 验证库存
    const stock = parseInt(formData.stock) || 0;
    if (stock < 0) {
      alert('库存不能为负数');
      return;
    }
    
    onSubmit({
      ...formData,
      price,
      stock,
      image: imageFile
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-medium text-gray-900">添加新商品</h3>
        <button
          onClick={onCancel}
          className="text-gray-400 hover:text-gray-600"
        >
          ×
        </button>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              商品名称 *
            </label>
            <input
              type="text"
              name="name"
              required
              value={formData.name}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="请输入商品名称"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              商品分类 *
            </label>
            <CategoryInput
              value={formData.category}
              onChange={(value) => setFormData({...formData, category: value})}
              required
            />
          </div>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              价格 *
            </label>
            <input
              type="number"
              name="price"
              required
              min="0"
              step="0.01"
              value={formData.price}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="0.00"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              库存
            </label>
            <input
              type="number"
              name="stock"
              min="0"
              value={formData.stock}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="0"
            />
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            商品图片
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          />
          <p className="text-xs text-gray-500 mt-1">支持 JPG、PNG 格式，建议尺寸 400x400</p>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            商品描述
          </label>
          <textarea
            name="description"
            rows={3}
            value={formData.description}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="请输入商品描述"
          />
        </div>
        
        <div className="flex space-x-3 pt-4">
          <button
            type="submit"
            disabled={isLoading}
            className="flex-1 bg-indigo-600 text-white py-2 px-4 rounded-md font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? '添加中...' : '添加商品'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            取消
          </button>
        </div>
      </form>
    </div>
  );
};

export default function Admin() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { apiRequest } = useApi();
  
  const [stats, setStats] = useState({
    total_products: 0,
    categories: 0,
    total_stock: 0,
    recent_products: []
  });
  const [products, setProducts] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [productCategoryFilter, setProductCategoryFilter] = useState('全部');
  const [variantStockProduct, setVariantStockProduct] = useState(null);
  
  // 订单管理相关状态
  const [orders, setOrders] = useState([]);
  const [orderStats, setOrderStats] = useState({
    total_orders: 0,
    status_counts: {},
    today_orders: 0,
    total_revenue: 0
  });
  const [orderStatusFilter, setOrderStatusFilter] = useState('全部'); // 全部/未付款/待确认/待配送/配送中/已完成
  const [activeTab, setActiveTab] = useState('products'); // products, orders, addresses

  // 地址管理相关状态
  const [addresses, setAddresses] = useState([]);
  const [addrLoading, setAddrLoading] = useState(false);
  const [addrSubmitting, setAddrSubmitting] = useState(false);
  const [newAddrName, setNewAddrName] = useState('');
  // 合并视图用：每个地址下的楼栋列表、输入与拖拽状态
  const [buildingsByAddress, setBuildingsByAddress] = useState({}); // { [addrId]: [] }
  const [newBldNameMap, setNewBldNameMap] = useState({}); // { [addrId]: string }
  const [bldDragState, setBldDragState] = useState({ id: null, addressId: null });
  const [addrDragId, setAddrDragId] = useState(null);
  const [addrDragging, setAddrDragging] = useState(false);

  // 楼栋管理状态（已合并到地址列表）

  // 检查管理员权限
  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    
    if (user.type !== 'admin') {
      alert('需要管理员权限');
      router.push('/');
      return;
    }
  }, [user, router]);

  // 加载统计数据和商品列表
  const loadData = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      const [statsData, usersCountData, productsData, categoriesData, ordersData, addressesData] = await Promise.all([
        apiRequest('/admin/stats'),
        apiRequest('/admin/users/count'),
        apiRequest('/products'),
        apiRequest('/admin/categories'),
        apiRequest('/admin/orders'),
        apiRequest('/admin/addresses')
      ]);
      
      const mergedStats = { ...(statsData.data || {}), users_count: (usersCountData?.data?.count ?? 0) };
      setStats(mergedStats);
      setProducts(productsData.data.products || []);
      // 管理端分类按拼音排序
      const adminCats = categoriesData.data.categories || [];
      try {
        const collator = new Intl.Collator(['zh-Hans-u-co-pinyin', 'zh'], { sensitivity: 'base', numeric: true });
        adminCats.sort((a, b) => collator.compare(a.name || '', b.name || ''));
      } catch (e) {
        adminCats.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
      }
      setCategories(adminCats);
      setOrders(ordersData.data.orders || []);
      setOrderStats(ordersData.data.stats || {
        total_orders: 0,
        status_counts: {},
        today_orders: 0,
        total_revenue: 0
      });
      setAddresses(addressesData.data.addresses || []);
      setSelectedProducts([]); // 重新加载数据时清空选择
    } catch (err) {
      setError(err.message || '加载数据失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 地址操作
  const loadAddresses = async () => {
    setAddrLoading(true);
    try {
      const res = await apiRequest('/admin/addresses');
      const addrs = res.data.addresses || [];
      setAddresses(addrs);
      // 同时加载每个地址下的楼栋
      const entries = await Promise.all(
        addrs.map(async (a) => {
          try {
            const r = await apiRequest(`/admin/buildings?address_id=${encodeURIComponent(a.id)}`);
            return [a.id, r.data.buildings || []];
          } catch (e) {
            return [a.id, []];
          }
        })
      );
      const map = {};
      entries.forEach(([id, list]) => { map[id] = list; });
      setBuildingsByAddress(map);
    } catch (e) {
      alert(e.message || '获取地址失败');
    } finally {
      setAddrLoading(false);
    }
  };

  // 地址拖拽排序
  const onAddressDragStart = (id) => {
    setAddrDragId(id);
    setAddrDragging(true);
  };
  const onAddressDragOver = (e, overId) => {
    e.preventDefault();
    if (!addrDragging || addrDragId === overId) return;
    setAddresses((prev) => {
      const from = prev.findIndex(a => a.id === addrDragId);
      const to = prev.findIndex(a => a.id === overId);
      if (from === -1 || to === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };
  const onAddressDragEnd = async () => {
    if (!addrDragging) return;
    setAddrDragging(false);
    setAddrDragId(null);
    try {
      const order = addresses.map(a => a.id);
      await apiRequest('/admin/addresses/reorder', {
        method: 'POST',
        body: JSON.stringify({ order })
      });
    } catch (e) {
      alert(e.message || '保存地址排序失败');
      await loadAddresses();
    }
  };

  const handleAddAddress = async () => {
    const name = newAddrName.trim();
    if (!name) { alert('请输入地址名称'); return; }
    setAddrSubmitting(true);
    try {
      const payload = { name, enabled: true, sort_order: 0 };
      const res = await apiRequest('/admin/addresses', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      setNewAddrName('');
      await loadAddresses();
      alert('地址添加成功！');
    } catch (e) {
      alert(e.message || '添加地址失败');
    } finally {
      setAddrSubmitting(false);
    }
  };

  const handleUpdateAddress = async (addr, changes) => {
    setAddrSubmitting(true);
    try {
      await apiRequest(`/admin/addresses/${addr.id}`, {
        method: 'PUT',
        body: JSON.stringify(changes)
      });
      await loadAddresses();
    } catch (e) {
      alert(e.message || '更新地址失败');
    } finally {
      setAddrSubmitting(false);
    }
  };

  const handleDeleteAddress = async (addr) => {
    if (!confirm(`确定删除地址"${addr.name}"吗？`)) return;
    setAddrSubmitting(true);
    try {
      await apiRequest(`/admin/addresses/${addr.id}`, { method: 'DELETE' });
      await loadAddresses();
      alert('删除成功');
    } catch (e) {
      alert(e.message || '删除地址失败');
    } finally {
      setAddrSubmitting(false);
    }
  };

  // 楼栋：新增（合并视图）
  const handleAddBuilding = async (addrId) => {
    const name = (newBldNameMap[addrId] || '').trim();
    if (!name) { alert('请输入楼栋名称'); return; }
    try {
      await apiRequest('/admin/buildings', {
        method: 'POST',
        body: JSON.stringify({ address_id: addrId, name, enabled: true, sort_order: 0 })
      });
      setNewBldNameMap(prev => ({ ...prev, [addrId]: '' }));
      // 重新拉取该地址的楼栋列表
      const res = await apiRequest(`/admin/buildings?address_id=${encodeURIComponent(addrId)}`);
      setBuildingsByAddress(prev => ({ ...prev, [addrId]: res.data.buildings || [] }));
    } catch (e) {
      alert(e.message || '添加楼栋失败');
    }
  };

  // 旧楼栋管理逻辑已合并至地址列表中

  // 添加商品
  const handleAddProduct = async (productData) => {
    setIsSubmitting(true);
    
    try {
      const formData = new FormData();
      formData.append('name', productData.name);
      formData.append('category', productData.category);
      formData.append('price', productData.price);
      formData.append('stock', productData.stock);
      formData.append('description', productData.description);
      
      if (productData.image) {
        formData.append('image', productData.image);
      }
      
      await apiRequest('/admin/products', {
        method: 'POST',
        body: formData,
        headers: {} // 让浏览器自动设置Content-Type
      });
      
      alert('商品添加成功！');
      setShowAddForm(false);
      await loadData(); // 重新加载数据
      
    } catch (err) {
      alert(err.message || '添加商品失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 编辑商品
  const handleEditProduct = async (productData) => {
    setIsSubmitting(true);
    
    try {
      const updateData = {
        name: productData.name,
        category: productData.category,
        price: productData.price,
        stock: productData.stock,
        description: productData.description
      };
      
      await apiRequest(`/admin/products/${editingProduct.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData)
      });
      
      // 如果有图片更新，单独处理
      if (productData.image) {
        const formData = new FormData();
        formData.append('image', productData.image);
        await apiRequest(`/admin/products/${editingProduct.id}/image`, {
          method: 'POST',
          body: formData,
          headers: {}
        });
      }
      
      alert('商品更新成功！');
      setEditingProduct(null);
      await loadData(); // 重新加载数据
      
    } catch (err) {
      alert(err.message || '更新商品失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 设置商品折扣
  const handleUpdateDiscount = async (productId, zhe) => {
    try {
      await apiRequest(`/admin/products/${productId}`, {
        method: 'PUT',
        body: JSON.stringify({ discount: zhe })
      });
      await loadData();
    } catch (e) {
      alert(e.message || '更新折扣失败');
    }
  };

  // 批量设置折扣
  const handleBatchUpdateDiscount = async (productIds, zhe) => {
    if (!productIds || productIds.length === 0) { alert('请选择要设置折扣的商品'); return; }
    try {
      await apiRequest('/admin/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_ids: productIds, discount: zhe })
      });
      // 无提示，静默刷新
      await loadData();
    } catch (e) {
      alert(e.message || '批量设置折扣失败');
    }
  };

  // 上/下架切换
  const handleToggleActive = async (product) => {
    // 当前是否上架
    const currentActive = !(product.is_active === 0 || product.is_active === false);
    const target = !currentActive; // 目标状态
    try {
      await apiRequest(`/admin/products/${product.id}`, { method: 'PUT', body: JSON.stringify({ is_active: target }) });
      await loadData();
    } catch (e) {
      alert(e.message || '更新上下架状态失败');
    }
  };

  // 更新库存（内联版本）
  const handleUpdateStock = async (productId, newStock) => {
    try {
      // 改用已验证可用的通用更新接口，以避免个别路由兼容问题
      await apiRequest(`/admin/products/${productId}`, {
        method: 'PUT',
        body: JSON.stringify({ stock: newStock })
      });
      
      // 静默更新，不显示成功提示，因为是实时操作
      await loadData(); // 重新加载数据
      
    } catch (err) {
      alert(err.message || '更新库存失败');
      throw err; // 重新抛出错误让StockControl组件处理
    }
  };

  // 删除商品
  const handleDeleteProduct = async (product) => {
    if (!confirm(`确定要删除商品"${product.name}"吗？此操作不可恢复。`)) {
      return;
    }
    
    try {
      await apiRequest(`/admin/products/${product.id}`, {
        method: 'DELETE'
      });
      
      alert('商品删除成功！');
      await loadData(); // 重新加载数据
      
    } catch (err) {
      alert(err.message || '删除商品失败');
    }
  };

  // 选择商品
  const handleSelectProduct = (productId, checked) => {
    if (checked) {
      setSelectedProducts(prev => [...prev, productId]);
    } else {
      setSelectedProducts(prev => prev.filter(id => id !== productId));
    }
  };

  // 全选/取消全选（对当前筛选后的可见商品生效）
  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedProducts(visibleProducts.map(product => product.id));
    } else {
      setSelectedProducts([]);
    }
  };

  // 批量删除商品
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

    try {
      setIsSubmitting(true);
      
      // 使用同一个删除API，通过请求体传递多个商品ID
      await apiRequest('/admin/products/0', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ product_ids: productIds })
      });

      alert(`成功删除 ${productIds.length} 件商品！`);
      setSelectedProducts([]); // 清空选择
      await loadData(); // 重新加载数据

    } catch (err) {
      alert(err.message || '批量删除商品失败');
    } finally {
      setIsSubmitting(false);
    }
  };



  // 更新订单状态
  const handleUpdateOrderStatus = async (orderId, newStatus) => {
    try {
      await apiRequest(`/admin/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus })
      });
      
      // 重新加载订单数据
      await loadData();
    } catch (err) {
      alert(err.message || '更新订单状态失败');
    }
  };

  // 更新订单支付状态（管理员）
  const handleUpdatePaymentStatus = async (orderId, newPaymentStatus) => {
    try {
      await apiRequest(`/admin/orders/${orderId}/payment-status`, {
        method: 'PATCH',
        body: JSON.stringify({ payment_status: newPaymentStatus })
      });
      await loadData();
    } catch (err) {
      alert(err.message || '更新支付状态失败');
    }
  };

  // 选择订单
  const handleSelectOrder = (orderId, checked) => {
    if (checked) setSelectedOrders((prev) => [...prev, orderId]);
    else setSelectedOrders((prev) => prev.filter((id) => id !== orderId));
  };

  // 全选/取消全选订单
  const handleSelectAllOrders = (checked, ids) => {
    if (checked) setSelectedOrders(ids);
    else setSelectedOrders([]);
  };

  // 批量删除订单
  const handleBatchDeleteOrders = async (orderIds) => {
    if (!orderIds || orderIds.length === 0) { alert('请选择要删除的订单'); return; }
    if (!confirm(`确定删除选中的 ${orderIds.length} 笔订单吗？此操作不可恢复。`)) return;
    try {
      await apiRequest('/admin/orders/0', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_ids: orderIds })
      });
      setSelectedOrders([]);
      await loadData();
      alert('已删除所选订单');
    } catch (e) {
      alert(e.message || '批量删除订单失败');
    }
  };

  // 统一状态更新：根据选择自动映射到后端支付状态/订单状态
  const handleUpdateUnifiedStatus = async (order, newUnified) => {
    try {
      // 当前统一状态和目标统一状态
      const currentUnified = getUnifiedStatus(order);
      if (currentUnified === newUnified) return;

      // 操作顺序：先处理支付状态，再处理发货/完成状态
      if (newUnified === '未付款') {
        // 回退为未付款：支付状态 pending，订单状态 pending
        await handleUpdatePaymentStatus(order.id, 'pending');
        await handleUpdateOrderStatus(order.id, 'pending');
      } else if (newUnified === '待确认') {
        await handleUpdatePaymentStatus(order.id, 'processing');
        await handleUpdateOrderStatus(order.id, 'pending');
      } else if (newUnified === '待配送') {
        // 标记已支付（会扣库存），并设为已确认
        if (order.payment_status !== 'succeeded') {
          await handleUpdatePaymentStatus(order.id, 'succeeded');
        }
        await handleUpdateOrderStatus(order.id, 'confirmed');
      } else if (newUnified === '配送中') {
        // 需已支付
        if (order.payment_status !== 'succeeded') {
          alert('请先确认付款后再设为配送中');
          return;
        }
        await handleUpdateOrderStatus(order.id, 'shipped');
      } else if (newUnified === '已完成') {
        // 需已支付
        if (order.payment_status !== 'succeeded') {
          alert('请先确认付款后再设为已完成');
          return;
        }
        await handleUpdateOrderStatus(order.id, 'delivered');
      }
    } catch (err) {
      alert(err.message || '更新状态失败');
    }
  };

  // 登出
  const handleLogout = async () => {
    if (confirm('确定要退出登录吗？')) {
      await logout();
      router.push('/login');
    }
  };

  // 初始化加载
  useEffect(() => {
    if (user && user.type === 'admin') {
      loadData();
    }
  }, [user]);

  // 如果不是管理员，不渲染内容
  if (!user || user.type !== 'admin') {
    return null;
  }

  // 按分类筛选后的产品（用于当前页面显示）
  const visibleProducts = productCategoryFilter === '全部' ? products : products.filter(p => p.category === productCategoryFilter);

  return (
    <>
      <Head>
        <title>管理后台 - [商店名称]</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      <div className="min-h-screen bg-gray-50">
        {/* 导航栏 */}
        <nav className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center">
                <div className="h-8 w-8 bg-red-600 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold text-sm">A</span>
                </div>
                <span className="ml-2 text-xl font-bold text-gray-900">管理后台</span>
              </div>
              
              <div className="flex items-center space-x-4">
                <Link 
                  href="/"
                  className="text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
                >
                  前台首页
                </Link>
                <span className="text-sm text-gray-600">{user.name}</span>
                <button
                  onClick={handleLogout}
                  className="text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
                >
                  退出
                </button>
              </div>
            </div>
          </div>
        </nav>

        {/* 主要内容 */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900">管理后台</h1>
            <p className="text-gray-600 mt-1">管理商品和查看统计信息</p>
          </div>

          {/* 店铺状态开关 */}
          <ShopStatusCard />



          {/* 错误提示 */}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* 统计卡片 */}
          {!isLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-6 mb-8">
              <StatsCard
                title="商品总数"
                value={stats.total_products}
                icon="📦"
                color="indigo"
              />
              <StatsCard
                title="商品分类"
                value={stats.categories}
                icon="🏷️"
                color="green"
              />
              <StatsCard
                title="总库存"
                value={stats.total_stock}
                icon="📊"
                color="yellow"
              />
              <StatsCard
                title="订单总数"
                value={orderStats.total_orders}
                icon="📋"
                color="purple"
              />
              <StatsCard
                title="总销售额"
                value={`¥${orderStats.total_revenue}`}
                icon="💰"
                color="indigo"
              />
              <StatsCard
                title="注册人数"
                value={stats.users_count}
                icon="🧑‍💻"
                color="green"
              />
            </div>
          )}

          {/* 选项卡导航 */}
          <div className="mb-8">
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex space-x-8">
                <button
                  onClick={() => setActiveTab('products')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'products'
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  商品管理
                </button>
                <button
                  onClick={() => setActiveTab('orders')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'orders'
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  订单管理
                  {orderStats.status_counts?.pending > 0 && (
                    <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                      {orderStats.status_counts.pending}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => {
                    setActiveTab('addresses');
                    // 懒加载地址数据
                    loadAddresses();
                  }}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'addresses'
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  地址管理
                </button>
              </nav>
            </div>
          </div>

          {/* 商品管理 */}
          {activeTab === 'products' && (
            <>
              <div className="mb-6 flex justify-between items-center">
                <h2 className="text-lg font-medium text-gray-900">商品管理</h2>
                <button
                  onClick={() => setShowAddForm(!showAddForm)}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-md font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  {showAddForm ? '取消添加' : '添加商品'}
                </button>
              </div>

              {/* 分类筛选器 */}
              <div className="mb-4 flex flex-wrap gap-2">
                <button
                  onClick={() => setProductCategoryFilter('全部')}
                  className={`px-3 py-1 rounded-md text-sm border ${productCategoryFilter === '全部' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                >全部</button>
                {(categories || []).map(c => (
                  <button
                    key={c.id}
                    onClick={() => setProductCategoryFilter(c.name)}
                    className={`px-3 py-1 rounded-md text-sm border ${productCategoryFilter === c.name ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                  >{c.name}</button>
                ))}
              </div>

          {/* 添加商品表单 */}
          {showAddForm && (
            <div className="mb-6">
              <AddProductForm
                onSubmit={handleAddProduct}
                isLoading={isSubmitting}
                onCancel={() => setShowAddForm(false)}
              />
            </div>
          )}

          {/* 编辑商品表单 */}
          {editingProduct && (
            <div className="mb-6">
              <EditProductForm
                product={editingProduct}
                onSubmit={handleEditProduct}
                isLoading={isSubmitting}
                onCancel={() => setEditingProduct(null)}
              />
            </div>
          )}



          {/* 商品列表 */}
          {isLoading ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
              <div className="animate-pulse space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex space-x-4">
                    <div className="h-10 w-10 bg-gray-200 rounded-md"></div>
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                      <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
                 <ProductTable 
                  products={visibleProducts} 
                  onRefresh={loadData}
                  onEdit={setEditingProduct}
                  onDelete={handleDeleteProduct}
                  onUpdateStock={handleUpdateStock}
                  onBatchDelete={handleBatchDelete}
                  onBatchUpdateDiscount={handleBatchUpdateDiscount}
                  selectedProducts={selectedProducts}
                  onSelectProduct={handleSelectProduct}
                  onSelectAll={handleSelectAll}
                  onUpdateDiscount={handleUpdateDiscount}
                  onToggleActive={handleToggleActive}
              onOpenVariantStock={(p) => setVariantStockProduct(p)}
            />
          )}
            </>
          )}

          {/* 订单管理 */}
          {activeTab === 'orders' && (
            <>
              <div className="mb-6">
                <h2 className="text-lg font-medium text-gray-900">订单管理</h2>
                <p className="text-sm text-gray-600 mt-1">管理和跟踪用户订单</p>
              </div>

              {/* 订单状态统计 */}
              {(() => {
                // 基于订单列表计算统一状态统计
                const counts = orders.reduce((acc, o) => {
                  const k = getUnifiedStatus(o);
                  acc[k] = (acc[k] || 0) + 1;
                  return acc;
                }, {});
                const hasAny = Object.keys(counts).length > 0;
                return hasAny ? (
                <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <h3 className="text-md font-medium text-gray-900 mb-4">订单状态统计</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                    {UNIFIED_STATUS_ORDER.map((status) => (
                      <div key={status} className="text-center">
                        <div className="text-2xl font-bold text-gray-900">{counts[status] || 0}</div>
                        <div className="text-sm text-gray-600">{status}</div>
                      </div>
                    ))}
                  </div>
                </div>
                ) : null;
              })()}

              {/* 订单列表 */}
              {isLoading ? (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
                  <div className="animate-pulse space-y-4">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="flex space-x-4">
                        <div className="flex-1 space-y-2">
                          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                          <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {/* 筛选器 */}
                  <div className="mb-4 flex flex-wrap gap-2">
                    {['全部', ...UNIFIED_STATUS_ORDER].map((label) => (
                      <button
                        key={label}
                        onClick={() => setOrderStatusFilter(label)}
                        className={`px-3 py-1 rounded-md text-sm border ${orderStatusFilter === label ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <OrderTable 
                    orders={(orderStatusFilter === '全部' ? orders : orders.filter(o => getUnifiedStatus(o) === orderStatusFilter))}
                    onUpdateUnifiedStatus={handleUpdateUnifiedStatus}
                    isLoading={isSubmitting}
                    selectedOrders={selectedOrders}
                    onSelectOrder={handleSelectOrder}
                    onSelectAllOrders={handleSelectAllOrders}
                    onBatchDeleteOrders={handleBatchDeleteOrders}
                  />
                </>
              )}
            </>
          )}

          {/* 地址管理 */}
          {activeTab === 'addresses' && (
            <>
              <div className="mb-6">
                <h2 className="text-lg font-medium text-gray-900">地址管理</h2>
                <p className="text-sm text-gray-600 mt-1">配置用户下单可选地址（例如：宿舍区/园区/自提点）。</p>
              </div>

              {/* 新增地址 */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">地址名称 *</label>
                    <input
                      type="text"
                      value={newAddrName}
                      onChange={(e) => setNewAddrName(e.target.value)}
                      placeholder="例如：桃园"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                  <div className="flex sm:col-span-2">
                    <button
                      onClick={handleAddAddress}
                      disabled={addrSubmitting}
                      className="ml-auto bg-indigo-600 text-white px-4 py-2 rounded-md font-medium hover:bg-indigo-700 disabled:opacity-50"
                    >{addrSubmitting ? '提交中...' : '添加地址'}</button>
                  </div>
                </div>
              </div>

              {/* 地址列表（可拖拽排序） */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                  <h3 className="text-lg font-medium text-gray-900">地址列表</h3>
                  <button onClick={loadAddresses} className="text-sm text-indigo-600 hover:underline">刷新</button>
                </div>
                <div className="divide-y">
                  {addrLoading && (
                    <div className="px-6 py-4 text-gray-500">加载中...</div>
                  )}
                  {!addrLoading && addresses.length === 0 && (
                    <div className="px-6 py-8 text-center text-gray-500">暂无地址。默认会向用户展示“桃园”。</div>
                  )}
                  {!addrLoading && addresses.length > 0 && (
                    addresses.map(addr => (
                      <div key={addr.id} className="border-b last:border-b-0">
                        {/* 地址行 */}
                        <div
                          className={`px-6 py-3 flex items-center gap-4 ${addrDragId === addr.id && addrDragging ? 'bg-indigo-50' : ''}`}
                          draggable
                          onDragStart={() => onAddressDragStart(addr.id)}
                          onDragOver={(e) => onAddressDragOver(e, addr.id)}
                          onDragEnd={onAddressDragEnd}
                        >
                          <div className="text-gray-400 cursor-move select-none">≡</div>
                          <input
                            type="text"
                            defaultValue={addr.name}
                            onBlur={(e) => {
                              const val = e.target.value.trim();
                              if (val && val !== addr.name) {
                                handleUpdateAddress(addr, { name: val });
                              }
                            }}
                            className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                          />
                          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                            <input
                              type="checkbox"
                              defaultChecked={!!addr.enabled}
                              onChange={(e) => handleUpdateAddress(addr, { enabled: e.target.checked })}
                              className="h-4 w-4 text-indigo-600 border-gray-300 rounded"
                            />
                            启用
                          </label>
                          <button
                            onClick={() => handleDeleteAddress(addr)}
                            className="text-red-600 hover:text-red-800 text-sm px-2 py-1"
                          >删除</button>
                        </div>

                        {/* 楼栋列表（嵌套） */}
                        <div className="bg-white/60 px-6 pb-3">
                          {(buildingsByAddress[addr.id] || []).length === 0 ? (
                            <div className="text-sm text-gray-500 py-2">暂无楼栋（用户默认看到“六舍”）</div>
                          ) : (
                            <div className="divide-y border rounded-md bg-white">
                              {(buildingsByAddress[addr.id] || []).map((bld) => (
                                <div
                                  key={bld.id}
                                  className="flex items-center gap-3 px-3 py-2"
                                  draggable
                                  onDragStart={() => setBldDragState({ id: bld.id, addressId: addr.id })}
                                  onDragOver={(e) => {
                                    e.preventDefault();
                                    const dragging = bldDragState.id;
                                    if (!dragging || bldDragState.addressId !== addr.id || dragging === bld.id) return;
                                    setBuildingsByAddress(prev => {
                                      const list = prev[addr.id] || [];
                                      const from = list.findIndex(x => x.id === dragging);
                                      const to = list.findIndex(x => x.id === bld.id);
                                      if (from === -1 || to === -1) return prev;
                                      const next = [...list];
                                      const [moved] = next.splice(from, 1);
                                      next.splice(to, 0, moved);
                                      return { ...prev, [addr.id]: next };
                                    });
                                  }}
                                  onDragEnd={async () => {
                                    const dragging = bldDragState.id;
                                    if (!dragging || bldDragState.addressId !== addr.id) return;
                                    setBldDragState({ id: null, addressId: null });
                                    try {
                                      const order = (buildingsByAddress[addr.id] || []).map(x => x.id);
                                      await apiRequest('/admin/buildings/reorder', {
                                        method: 'POST',
                                        body: JSON.stringify({ address_id: addr.id, order })
                                      });
                                    } catch (e) {
                                      alert(e.message || '保存楼栋排序失败');
                                      // 回滚刷新
                                      try {
                                        const r = await apiRequest(`/admin/buildings?address_id=${encodeURIComponent(addr.id)}`);
                                        setBuildingsByAddress(prev => ({ ...prev, [addr.id]: r.data.buildings || [] }));
                                      } catch {}
                                    }
                                  }}
                                >
                                  <div className="text-gray-400 cursor-move select-none">≡</div>
                                  <input
                                    type="text"
                                    defaultValue={bld.name}
                                    onBlur={async (e) => {
                                      const val = e.target.value.trim();
                                      if (val && val !== bld.name) {
                                        try {
                                          await apiRequest(`/admin/buildings/${bld.id}`, { method: 'PUT', body: JSON.stringify({ name: val }) });
                                          // 同步本地
                                          setBuildingsByAddress(prev => ({
                                            ...prev,
                                            [addr.id]: (prev[addr.id] || []).map(x => x.id === bld.id ? { ...x, name: val } : x)
                                          }));
                                        } catch (e) {
                                          alert(e.message || '更新失败');
                                        }
                                      }
                                    }}
                                    className="flex-1 min-w-0 px-2 py-1 border border-gray-300 rounded"
                                  />
                                  <label className="inline-flex items-center gap-2 text-xs text-gray-700">
                                    <input
                                      type="checkbox"
                                      defaultChecked={!!bld.enabled}
                                      onChange={async (e) => {
                                        try {
                                          await apiRequest(`/admin/buildings/${bld.id}`, { method: 'PUT', body: JSON.stringify({ enabled: e.target.checked }) });
                                          setBuildingsByAddress(prev => ({
                                            ...prev,
                                            [addr.id]: (prev[addr.id] || []).map(x => x.id === bld.id ? { ...x, enabled: e.target.checked ? 1 : 0 } : x)
                                          }));
                                        } catch (er) {
                                          alert(er.message || '更新失败');
                                        }
                                      }}
                                      className="h-4 w-4 text-indigo-600 border-gray-300 rounded"
                                    />
                                    启用
                                  </label>
                                  <button
                                    onClick={async () => {
                                      if (!confirm(`确定删除楼栋"${bld.name}"吗？`)) return;
                                      try {
                                        await apiRequest(`/admin/buildings/${bld.id}`, { method: 'DELETE' });
                                        setBuildingsByAddress(prev => ({
                                          ...prev,
                                          [addr.id]: (prev[addr.id] || []).filter(x => x.id !== bld.id)
                                        }));
                                      } catch (er) {
                                        alert(er.message || '删除失败');
                                      }
                                    }}
                                    className="text-red-600 hover:text-red-800 text-xs px-2 py-1"
                                  >删除</button>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* 新增楼栋 */}
                          <div className="mt-2 flex items-center gap-2">
                            <input
                              type="text"
                              placeholder="新增楼栋名称（如：六舍）"
                              value={newBldNameMap[addr.id] || ''}
                              onChange={(e) => setNewBldNameMap(prev => ({ ...prev, [addr.id]: e.target.value }))}
                              className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                            />
                            <button
                              onClick={() => handleAddBuilding(addr.id)}
                              className="bg-indigo-600 text-white px-3 py-2 rounded-md text-sm hover:bg-indigo-700"
                            >添加楼栋</button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* 合并视图：楼栋已嵌入各地址下方 */}
            </>
          )}
        </main>

        {variantStockProduct && (
          <VariantStockModal
            product={variantStockProduct}
            onClose={() => setVariantStockProduct(null)}
          />
        )}
      </div>
    </>
  );
}
