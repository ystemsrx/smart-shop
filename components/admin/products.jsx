import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import RetryImage from '../RetryImage';
import { useApi } from '../../hooks/useAuth';
import { getProductImage } from '../../utils/urls';
import { formatReservationCutoff, normalizeBooleanFlag } from './helpers';

// iOS风格开关组件
export const IOSToggle = ({ enabled, onChange, disabled = false, size = 'md' }) => {
  const sizeClasses = {
    sm: 'w-10 h-6',
    md: 'w-12 h-7',
    lg: 'w-14 h-8'
  };
  
  const thumbSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6'
  };
  
  const translateX = {
    sm: enabled ? 'translate-x-5' : 'translate-x-1',
    md: enabled ? 'translate-x-7' : 'translate-x-1', 
    lg: enabled ? 'translate-x-8' : 'translate-x-1'
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={() => !disabled && onChange(!enabled)}
      className={`${sizeClasses[size]} relative inline-flex items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      } ${
        enabled 
          ? 'bg-gradient-to-r from-green-400 to-green-500 shadow-lg' 
          : 'bg-gray-300 hover:bg-gray-400'
      }`}
    >
      <span className="sr-only">切换开关</span>
      <span
        className={`${thumbSizes[size]} ${translateX[size]} inline-block rounded-full bg-white shadow-lg transform transition-transform duration-200 ease-in-out`}
      />
    </button>
  );
};

// 内联库存控制组件
export const StockControl = ({ product, onUpdateStock }) => {
  const normalizeStock = (value) => {
    if (value === '' || value === null || value === undefined) {
      return 0;
    }
    const parsed = typeof value === 'number' ? value : parseInt(value, 10);
    if (Number.isNaN(parsed)) {
      return 0;
    }
    return parsed < 0 ? 0 : parsed;
  };

  const isNonSellable = normalizeBooleanFlag(product.is_not_for_sale, false);
  const [stock, setStock] = useState(() => normalizeStock(product.stock));
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setStock(normalizeStock(product.stock));
  }, [product.stock]);

  if (isNonSellable) {
    return (
      <div className="flex items-center text-purple-600 font-semibold">
        <i className="fas fa-infinity"></i>
      </div>
    );
  }

  const submitChange = async (changePayload) => {
    const { optimisticStock } = changePayload;
    if (typeof optimisticStock === 'number' && optimisticStock < 0) {
      return;
    }

    setIsLoading(true);
    try {
      await onUpdateStock(product.id, changePayload);
    } catch (error) {
      setStock(normalizeStock(product.stock));
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const handleIncrement = () => {
    if (isLoading) return;
    const newStock = normalizeStock(stock + 1);
    setStock(newStock);
    submitChange({
      mode: 'delta',
      delta: 1,
      optimisticStock: newStock
    }).catch(() => {});
  };

  const handleDecrement = () => {
    if (isLoading) return;
    const current = normalizeStock(stock);
    if (current <= 0) return;
    const newStock = Math.max(0, current - 1);
    setStock(newStock);
    submitChange({
      mode: 'delta',
      delta: -1,
      optimisticStock: newStock
    }).catch(() => {});
  };

  const handleInputChange = (e) => {
    const newValue = parseInt(e.target.value, 10);
    setStock(Number.isNaN(newValue) ? 0 : Math.max(0, newValue));
  };

  const handleInputBlur = () => {
    setIsEditing(false);
    const normalizedProductStock = normalizeStock(product.stock);
    const normalizedInput = normalizeStock(stock);
    if (normalizedInput !== normalizedProductStock) {
      setStock(normalizedInput);
      submitChange({
        mode: 'set',
        target: normalizedInput,
        optimisticStock: normalizedInput
      }).catch(() => {});
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
        disabled={isLoading || normalizeStock(stock) <= 0}
        className="w-6 h-6 flex items-center justify-center bg-red-500 hover:bg-red-600 text-white text-xs rounded-full disabled:bg-gray-300 disabled:cursor-not-allowed transition-all duration-200"
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
          className="w-12 px-1 py-0.5 text-center text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all duration-200"
          min="0"
          autoFocus
        />
      ) : (
        <span 
          onClick={() => setIsEditing(true)}
          className={`w-12 text-center text-sm cursor-pointer hover:bg-gray-100 px-1 py-0.5 rounded transition-all duration-200 ${isLoading ? 'opacity-50' : ''}`}
          title="点击编辑"
        >
          {isLoading ? (
            <div className="inline-block w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin"></div>
          ) : (
            normalizeStock(stock)
          )}
        </span>
      )}
      
      <button
        onClick={handleIncrement}
        disabled={isLoading}
        className="w-6 h-6 flex items-center justify-center bg-green-500 hover:bg-green-600 text-white text-xs rounded-full disabled:bg-gray-300 disabled:cursor-not-allowed transition-all duration-200"
        title="增加库存"
      >
        +
      </button>
    </div>
  );
};

// 商品表格组件
export const ProductTable = ({
  products,
  onRefresh,
  onEdit,
  onDelete,
  onUpdateStock,
  onBatchDelete,
  onBatchUpdateDiscount,
  onBatchToggleActive,
  selectedProducts,
  onSelectProduct,
  onSelectAll,
  onUpdateDiscount,
  onToggleActive,
  onOpenVariantStock,
  onToggleHot,
  showOnlyOutOfStock,
  showOnlyInactive,
  onToggleOutOfStockFilter,
  onToggleInactiveFilter,
  operatingProducts,
  sortBy,
  sortOrder,
  onSortClick
}) => {
  const isAllSelected = products.length > 0 && selectedProducts.length === products.length;
  const isPartiallySelected = selectedProducts.length > 0 && selectedProducts.length < products.length;
  const [bulkZhe, setBulkZhe] = useState('');
  
  const SortIndicator = ({ column, label }) => {
    const isActive = sortBy === column;
    const isAsc = sortOrder === 'asc';
    
    return (
      <button
        onClick={() => onSortClick && onSortClick(column)}
        className="flex items-center gap-1 hover:text-gray-700 transition-colors group"
      >
        <span>{label}</span>
        <div className="flex flex-col items-center">
          <i className={`fas fa-caret-up text-xs -mb-1 transition-colors ${
            isActive && isAsc ? 'text-indigo-600' : 'text-gray-300 group-hover:text-gray-400'
          }`}></i>
          <i className={`fas fa-caret-down text-xs transition-colors ${
            isActive && !isAsc ? 'text-indigo-600' : 'text-gray-300 group-hover:text-gray-400'
          }`}></i>
        </div>
      </button>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-medium text-gray-900">商品列表</h3>
          {operatingProducts && operatingProducts.size > 0 && (
            <div className="inline-flex items-center gap-2 text-sm text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">
              <div className="w-3 h-3 border border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
              <span>正在处理 {operatingProducts.size} 项操作...</span>
            </div>
          )}
        </div>
        
        <div className="flex items-center space-x-4">
          {selectedProducts.length > 0 && (
            <div className="flex items-center gap-3 text-sm text-gray-700">
              <span className="font-medium whitespace-nowrap">已选{selectedProducts.length}件</span>
              
              <span className="text-gray-400">|</span>
              
              <select
                className="text-sm border border-gray-300 rounded px-2 py-1 min-w-0"
                value={bulkZhe}
                onChange={(e) => {
                  const val = e.target.value;
                  setBulkZhe(val);
                  if (val === '') return;
                  const v = parseFloat(val);
                  onBatchUpdateDiscount(selectedProducts, v);
                  setBulkZhe('');
                }}
                title="批量设置折扣（单位：折）"
              >
                <option value="">折扣</option>
                {Array.from({ length: 20 }).map((_, i) => {
                  const val = 10 - i * 0.5;
                  const v = Math.max(0.5, parseFloat(val.toFixed(1)));
                  return (
                    <option key={v} value={String(v)}>{v}折</option>
                  );
                })}
              </select>

              <span className="text-gray-400">|</span>

              {(() => {
                const selectedProductsData = products.filter(product => selectedProducts.includes(product.id));
                const activeCount = selectedProductsData.filter(product => product.is_active !== 0 && product.is_active !== false).length;
                const inactiveCount = selectedProductsData.length - activeCount;
                
                const isOn = activeCount >= inactiveCount;
                const action = isOn ? '下架' : '上架';
                const targetState = !isOn ? 1 : 0;
                
                return (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">下架</span>
                    <div 
                      onClick={() => onBatchToggleActive && onBatchToggleActive(selectedProducts, targetState)}
                      className="relative inline-flex items-center cursor-pointer"
                      title={`点击批量${action}`}
                    >
                      <div className={`
                        relative w-10 h-5 rounded-full transition-colors duration-200 ease-in-out
                        ${isOn 
                          ? 'bg-green-500 shadow-inner' 
                          : 'bg-gray-300 shadow-inner'
                        }
                      `}>
                        <div className={`
                          absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-lg
                          transform transition-transform duration-200 ease-in-out
                          ${isOn ? 'translate-x-[19px]' : 'translate-x-0'}
                        `}>
                        </div>
                      </div>
                    </div>
                    <span className="text-sm text-gray-600">上架</span>
                  </div>
                );
              })()}
              
              <span className="text-gray-400">|</span>
              
              <button
                onClick={() => onBatchDelete(selectedProducts)}
                className="inline-flex items-center px-3 py-2 border border-red-600 rounded-md text-sm font-medium text-red-600 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                title="批量删除选中商品"
              >
                删除
              </button>
            </div>
          )}
          
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={showOnlyOutOfStock}
              onChange={(e) => onToggleOutOfStockFilter(e.target.checked)}
              className="h-4 w-4 text-orange-500 border-gray-300 rounded focus:ring-orange-400"
            />
            <span>仅显示缺货</span>
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={showOnlyInactive}
              onChange={(e) => onToggleInactiveFilter(e.target.checked)}
              className="h-4 w-4 text-indigo-500 border-gray-300 rounded focus:ring-indigo-400"
            />
            <span>仅显示下架</span>
          </label>
          <button
            onClick={onRefresh}
            className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            <i className="fas fa-sync-alt mr-2"></i>
            刷新
          </button>
        </div>
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
                <SortIndicator column="category" label="分类" />
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                热销
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <SortIndicator column="price" label="价格/折扣" />
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <SortIndicator column="stock" label="库存" />
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-40">
                <SortIndicator column="created_at" label="创建时间" />
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-48">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {products.map((product) => {
              const isHot = Boolean(product.is_hot);
              const isNonSellable = normalizeBooleanFlag(product.is_not_for_sale, false);
              const isSelected = selectedProducts.includes(product.id);
              const isActive = !(product.is_active === 0 || product.is_active === false);
              
              return (
                <tr key={product.id} className={`transition-all duration-200 ease-in-out hover:bg-gray-50 ${isSelected ? 'bg-blue-50 shadow-sm' : ''}`}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => onSelectProduct(product.id, e.target.checked)}
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded transition-all duration-200"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10">
                        {getProductImage(product) ? (
                          <RetryImage
                            className="h-10 w-10 rounded-md object-cover transition-all duration-200 hover:scale-105"
                            src={getProductImage(product)}
                            alt={product.name}
                            maxRetries={3}
                            onFinalError={() => {
                              console.log(`管理员页面商品图片最终加载失败: ${product.name}`);
                            }}
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-md bg-gray-100 flex items-center justify-center transition-all duration-200 hover:bg-gray-200">
                            <span className="text-gray-400 text-xs">图</span>
                          </div>
                        )}
                      </div>
                      <div className="ml-4">
                        <div className="flex items-center gap-2">
                          <div className={`text-sm font-medium transition-all duration-200 ${
                            isNonSellable 
                              ? 'text-purple-600' 
                              : (!product.has_variants && (product.stock === 0 || product.stock < 0))
                                ? 'text-red-600'
                                : (isActive ? 'text-gray-900' : 'text-gray-500')
                          }`} title={product.name}>
                            {product.name && product.name.length > 10 ? product.name.slice(0, 10) + '...' : product.name}
                            {!isActive && <span className="ml-2 text-xs text-red-500">(已下架)</span>}
                          </div>
                          {isHot && (
                            <span className="px-2 py-0.5 text-xs font-semibold text-orange-600 bg-orange-50 border border-orange-200 rounded-full transition-all duration-200 animate-pulse">
                              热销
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-500 max-w-xs truncate" title={product.description}>
                          {product.description && product.description.length > 10 
                            ? product.description.slice(0, 10) + '...' 
                            : product.description}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800 transition-all duration-200">
                      {product.category}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={isHot}
                        onChange={(e) => onToggleHot(product, e.target.checked)}
                        disabled={operatingProducts?.has(product.id)}
                        className={`h-4 w-4 text-orange-500 border-gray-300 rounded focus:ring-orange-400 transition-all duration-200 ${
                          operatingProducts?.has(product.id) ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      />
                      {operatingProducts?.has(product.id) && (
                        <div className="w-3 h-3 border border-orange-400 border-t-transparent rounded-full animate-spin ml-1"></div>
                      )}
                    </label>
                  </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  <div className="flex items-center gap-3">
                    {(() => {
                      const z = (typeof product.discount === 'number' && product.discount) ? product.discount : (product.discount ? parseFloat(product.discount) : 10);
                      const has = z && z > 0 && z < 10;
                      const finalPrice = has ? (Math.round(product.price * (z / 10) * 100) / 100) : product.price;
                      return (
                        <div className="flex flex-col">
                          <span className="font-semibold">¥{finalPrice}</span>
                          {has && (<span className="text-xs text-gray-400 line-through">¥{product.price}</span>)}
                        </div>
                      );
                    })()}
                    <select
                      className={`text-xs border border-gray-300 rounded px-1 py-0.5 transition-all duration-200 hover:border-indigo-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 ${
                        operatingProducts?.has(product.id) ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                      value={(typeof product.discount === 'number' && product.discount) ? product.discount : (product.discount ? parseFloat(product.discount) : 10)}
                      onChange={(e) => onUpdateDiscount(product.id, parseFloat(e.target.value))}
                      disabled={operatingProducts?.has(product.id)}
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
                      className="px-3 py-1.5 rounded-md border text-sm hover:bg-gray-50 transition-all duration-200"
                    >操作</button>
                  ) : (
                    <StockControl 
                      product={product} 
                      onUpdateStock={onUpdateStock}
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
                      className="text-indigo-600 hover:text-indigo-900 transition-all duration-200"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => onToggleActive(product)}
                      disabled={operatingProducts?.has(product.id)}
                      className={`transition-all duration-200 ${
                        operatingProducts?.has(product.id) 
                          ? 'text-gray-400 cursor-not-allowed' 
                          : (product.is_active === 0 || product.is_active === false)
                            ? 'text-green-600 hover:text-green-800' 
                            : 'text-gray-600 hover:text-gray-800'
                      }`}
                    >
                      {operatingProducts?.has(product.id) ? (
                        <div className="inline-flex items-center gap-1">
                          <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                          <span>处理中...</span>
                        </div>
                      ) : (
                        (product.is_active === 0 || product.is_active === false) ? '上架' : '下架'
                      )}
                    </button>
                    <button
                      onClick={() => onDelete(product)}
                      className="text-red-600 hover:text-red-900 transition-all duration-200"
                    >
                      删除
                    </button>
                  </div>
                </td>
              </tr>
              );
            })}
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

// 分类输入组件
export const CategoryInput = ({ value, onChange, required = false, disabled = false, adminMode = false, apiPrefix = null }) => {
  const [categories, setCategories] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [inputValue, setInputValue] = useState(value || '');
  const [isLoading, setIsLoading] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const inputRef = useRef(null);
  const { apiRequest } = useApi();

  useEffect(() => {
    let isMounted = true;
    
    const loadCategories = async () => {
      if (isLoading) return;
      setIsLoading(true);
      try {
        let url;
        if (adminMode) {
          url = '/admin/categories';
        } else if (apiPrefix === '/agent') {
          url = '/agent/categories';
        } else {
          url = '/products/categories';
        }
        const response = await apiRequest(url);
        if (!isMounted) return;
        const cats = response.data.categories || [];
        const letters = Array.from({ length: 26 }, (_, i) => String.fromCharCode(97 + i));
        const firstSigChar = (s) => {
          const str = String(s || '');
          for (let i = 0; i < str.length; i++) {
            const ch = str[i];
            if (/[A-Za-z\u4e00-\u9fff]/.test(ch)) return ch;
          }
          return '';
        };
        const typeRank = (s) => {
          const ch = firstSigChar(s);
          if (!ch) return 2;
          return /[A-Za-z]/.test(ch) ? 0 : 1;
        };
        const bucket = (s, collator) => {
          const name = String(s || '');
          if (!/[A-Za-z\u4e00-\u9fff]/.test(name)) return 26;
          let b = 25;
          for (let i = 0; i < 26; i++) {
            const cur = letters[i];
            const next = i < 25 ? letters[i + 1] : null;
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
          cats.sort((a, b) => {
            const aName = String(a.name || '');
            const bName = String(b.name || '');
            const ab = bucket(aName, collator);
            const bb = bucket(bName, collator);
            if (ab !== bb) return ab - bb;
            const ar = typeRank(aName);
            const br = typeRank(bName);
            if (ar !== br) return ar - br;
            return collator.compare(aName, bName);
          });
        } catch (e) {
          cats.sort((a, b) => {
            const aName = String(a.name || '');
            const bName = String(b.name || '');
            const aCh = firstSigChar(aName).toLowerCase();
            const bCh = firstSigChar(bName).toLowerCase();
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
        setCategories(cats);
      } catch (error) {
        console.error('获取分类失败:', error);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadCategories();

    return () => {
      isMounted = false;
    };
  }, [adminMode, apiPrefix]);

  useEffect(() => {
    setInputValue(value || '');
  }, [value]);

  useEffect(() => {
    if (showSuggestions && inputRef.current) {
      const updatePosition = () => {
        const rect = inputRef.current.getBoundingClientRect();
        const dropdownMaxHeight = 240;
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        
        const shouldShowAbove = spaceBelow < dropdownMaxHeight && spaceAbove > spaceBelow;
        
        setDropdownPosition({
          top: shouldShowAbove ? rect.top - 4 : rect.bottom + 4,
          left: rect.left,
          width: rect.width,
          showAbove: shouldShowAbove
        });
      };
      
      updatePosition();
      
      const handleScroll = () => updatePosition();
      const handleResize = () => updatePosition();
      
      window.addEventListener('scroll', handleScroll, true);
      window.addEventListener('resize', handleResize);
      
      return () => {
        window.removeEventListener('scroll', handleScroll, true);
        window.removeEventListener('resize', handleResize);
      };
    }
  }, [showSuggestions]);

  const handleInputChange = (e) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange(newValue);
    setShowSuggestions(true);
  };

  const handleSelectCategory = (categoryName) => {
    setInputValue(categoryName);
    onChange(categoryName);
    setShowSuggestions(false);
  };

  const filteredCategories = inputValue.trim() === '' 
    ? categories
    : categories.filter(cat => 
        cat.name.toLowerCase().includes(inputValue.toLowerCase())
      );

  return (
    <>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          required={required}
          disabled={disabled}
          className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200 transition-all disabled:bg-gray-100"
          placeholder="输入或选择分类"
        />
      </div>
      
      {showSuggestions && categories.length > 0 && typeof document !== 'undefined' && (
        ReactDOM.createPortal(
          <div 
            className="bg-white border border-gray-300 rounded-lg shadow-xl max-h-60 overflow-auto"
            style={{
              position: 'fixed',
              [dropdownPosition.showAbove ? 'bottom' : 'top']: dropdownPosition.showAbove 
                ? `${window.innerHeight - dropdownPosition.top}px`
                : `${dropdownPosition.top}px`,
              left: `${dropdownPosition.left}px`,
              width: `${dropdownPosition.width}px`,
              zIndex: 9999
            }}
          >
            {filteredCategories.length > 0 ? (
              filteredCategories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className="w-full px-3 py-2 text-left hover:bg-emerald-50 focus:bg-emerald-50 focus:outline-none transition-colors text-sm"
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
          </div>,
          document.body
        )
      )}
    </>
  );
};

// 本地规格管理器
export const LocalVariantManager = ({ variants, loading, onChange }) => {
  const [newName, setNewName] = useState('');
  const [newStock, setNewStock] = useState(0);

  const addVariant = () => {
    if (!newName.trim()) {
      alert('请输入规格名称');
      return;
    }
    
    if (variants.some(v => v.name === newName.trim())) {
      alert('规格名称已存在');
      return;
    }
    
    const newVariant = {
      id: `temp_${Date.now()}`,
      name: newName.trim(),
      stock: parseInt(newStock) || 0
    };
    
    onChange([...variants, newVariant]);
    setNewName('');
    setNewStock(0);
  };
  
  const removeVariant = (id) => {
    onChange(variants.filter(v => v.id !== id));
  };
  
  const updateVariant = (id, field, value) => {
    onChange(variants.map(v => {
      if (v.id === id) {
        return { ...v, [field]: field === 'stock' ? (parseInt(value) || 0) : value };
      }
      return v;
    }));
  };

  return (
    <div className="bg-white rounded-2xl border-2 border-gray-200 overflow-hidden">
      <div className="bg-gradient-to-r from-teal-50 to-cyan-50 px-5 py-4 border-b-2 border-gray-200">
        <div className="flex items-center gap-2">
          <i className="fas fa-layer-group text-teal-600"></i>
          <div>
            <h3 className="text-base font-bold text-gray-900">规格</h3>
            <p className="text-xs text-gray-600 mt-0.5">多规格库存管理</p>
          </div>
        </div>
      </div>
      
      <div className="p-5 space-y-4">
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-700 mb-1.5 block">规格名称</label>
              <input 
                value={newName} 
                onChange={e => setNewName(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && (e.preventDefault(), addVariant())}
                placeholder="例如：原味、中杯" 
                className="w-full px-3 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 mb-1.5 block">库存数量</label>
              <input 
                type="number" 
                value={newStock} 
                min={0} 
                onChange={e => setNewStock(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && (e.preventDefault(), addVariant())}
                placeholder="0" 
                className="w-full px-3 py-2.5 bg-gray-50 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all"
              />
            </div>
          </div>
          <button 
            type="button"
            onClick={addVariant} 
            className="w-full px-4 py-2.5 bg-gradient-to-r from-teal-500 to-cyan-500 text-white rounded-lg text-sm font-semibold hover:from-teal-600 hover:to-cyan-600 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 transition-all shadow-md hover:shadow-lg transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <i className="fas fa-plus"></i>
            添加规格
          </button>
        </div>
        
        {loading ? (
          <div className="flex items-center justify-center py-6 text-gray-500">
            <i className="fas fa-spinner fa-spin mr-2"></i>
            <span className="text-sm">加载中...</span>
          </div>
        ) : variants.length === 0 ? (
          <div className="text-center py-6 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
            <i className="fas fa-cube text-gray-400 text-3xl mb-2"></i>
            <p className="text-sm font-medium text-gray-600">暂无规格</p>
            <p className="text-xs text-gray-500 mt-1">添加规格后可独立管理库存</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[400px] overflow-y-auto overflow-x-hidden pt-3 pb-1 px-1">
              {variants.map((v) => (
                <div key={v.id} className="relative group rounded-xl border-2 border-teal-200 bg-teal-50/30 hover:bg-teal-50 p-3 transition-all hover:shadow-md">
                  <button
                    type="button"
                    onClick={() => removeVariant(v.id)}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg transition-all hover:scale-110 z-10"
                    title="删除规格"
                  >
                    <i className="fas fa-times text-xs"></i>
                  </button>
                  
                  <div className="pr-2">
                    <div className="mb-2">
                      <label className="text-xs text-gray-600 mb-1 block">名称</label>
                      <input 
                        className="w-full px-2 py-1.5 bg-white border border-gray-300 rounded text-xs font-medium focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-200 transition-all" 
                        value={v.name} 
                        onChange={(e) => updateVariant(v.id, 'name', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 mb-1 block">库存数量</label>
                      <input 
                        type="number" 
                        min={0} 
                        className="w-full px-2 py-1.5 bg-white border border-gray-300 rounded text-xs font-medium focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-200 transition-all" 
                        value={v.stock} 
                        onChange={(e) => updateVariant(v.id, 'stock', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// 商品表单
export const ProductForm = ({ product = null, onSubmit, isLoading, onCancel, apiPrefix, isAdmin = false, onRefreshProduct, onStatsRefresh }) => {
  const isEditMode = !!product;
  
  const [formData, setFormData] = useState({
    name: product?.name || '',
    category: product?.category || '',
    price: (product?.price !== null && product?.price !== undefined) ? product.price : '',
    stock: (product?.stock !== null && product?.stock !== undefined) ? product.stock : '',
    description: product?.description || '',
    cost: (product?.cost !== null && product?.cost !== undefined) ? product.cost : '',
    discount: (product && typeof product.discount === 'number' && product.discount) ? product.discount : (product?.discount ? parseFloat(product.discount) : 10),
    is_hot: product ? (product.is_hot === 1 || product.is_hot === true) : false,
    is_not_for_sale: product ? (product.is_not_for_sale === 1 || product.is_not_for_sale === true) : false,
    reservation_required: product ? Boolean(product.reservation_required) : false,
    reservation_cutoff: product?.reservation_cutoff || '',
    reservation_note: product?.reservation_note || ''
  });
  const [imageFile, setImageFile] = useState(null);
  const { apiRequest } = useApi();
  const normalizeVariantStockValue = (value) => {
    if (value === null || value === undefined || value === '') return 0;
    const parsed = typeof value === 'number' ? value : parseInt(value, 10);
    if (!Number.isFinite(parsed)) return 0;
    return parsed < 0 ? 0 : parsed;
  };
  
  const [variantsState, setVariantsState] = useState({
    loaded: !isEditMode,
    original: [],
    current: []
  });

  useEffect(() => {
    if (!isEditMode) return;
    
    const loadVariants = async () => {
      try {
        const res = await apiRequest(`${apiPrefix}/products/${product.id}/variants`);
        const variants = (res?.data?.variants || []).map(v => ({
          ...v,
          stock: normalizeVariantStockValue(v.stock)
        }));
        setVariantsState({
          loaded: true,
          original: JSON.parse(JSON.stringify(variants)),
          current: JSON.parse(JSON.stringify(variants))
        });
      } catch (err) {
        console.error('加载规格失败:', err);
        setVariantsState({
          loaded: true,
          original: [],
          current: []
        });
      }
    };
    
    loadVariants();
  }, [isEditMode, product?.id]);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const isPriceEmpty = formData.price === '' || formData.price === null || formData.price === undefined;
    if (!formData.name || !formData.category || isPriceEmpty) {
      alert('请填写必填字段');
      return;
    }
    
    const price = parseFloat(formData.price);
    if (isNaN(price) || price < 0) {
      alert('请输入有效的价格');
      return;
    }
    
    const stock = parseInt(formData.stock) || 0;
    if (stock < 0) {
      alert('库存不能为负数');
      return;
    }
    
    if (isEditMode) {
      const submitData = {
        ...formData,
        price,
        stock,
        is_hot: !!formData.is_hot,
        is_not_for_sale: !!formData.is_not_for_sale,
        image: imageFile,
        skipCloseModal: true
      };
    
      await onSubmit(submitData);
    
      try {
        await applyVariantChanges();
        
        if (onRefreshProduct) {
          try {
            await onRefreshProduct(product.id);
          } catch (refreshErr) {
            console.error('刷新商品数据失败:', refreshErr);
          }
        }
        
        if (onStatsRefresh) {
          try {
            await onStatsRefresh();
          } catch (refreshErr) {
            console.error('刷新统计数据失败:', refreshErr);
          }
        }
        
        if (onCancel) {
          onCancel();
        }
      } catch (err) {
        console.error('应用规格变更失败:', err);
        alert('商品信息已保存，但规格更新失败：' + (err.message || '未知错误'));
        if (onRefreshProduct) {
          try {
            await onRefreshProduct(product.id);
          } catch {}
        }
        if (onStatsRefresh) {
          try {
            await onStatsRefresh();
          } catch {}
        }
        if (onCancel) {
          onCancel();
        }
      }
    } else {
      onSubmit({
        ...formData,
        price,
        stock,
        is_hot: !!formData.is_hot,
        is_not_for_sale: !!formData.is_not_for_sale,
        image: imageFile,
        variants: variantsState.current
      });
    }
  };
  
  const applyVariantChanges = async () => {
    let serverOriginal = [];
    try {
      const latest = await apiRequest(`${apiPrefix}/products/${product.id}/variants`);
      serverOriginal = (latest?.data?.variants || []).map(v => ({
        ...v,
        stock: normalizeVariantStockValue(v.stock)
      }));
    } catch (err) {
      console.error('获取最新规格失败，使用本地缓存继续:', err);
      serverOriginal = (variantsState.original || []).map(v => ({
        ...v,
        stock: normalizeVariantStockValue(v.stock)
      }));
    }

    const currentVariants = (variantsState.current || []).map(v => ({
      ...v,
      stock: normalizeVariantStockValue(v.stock)
    }));
    
    const isTempId = (id) => typeof id === 'string' && id.startsWith('temp_');
    const isRealId = (id) => !isTempId(id) && (typeof id === 'number' || typeof id === 'string');

    const serverMap = new Map(
      serverOriginal
        .filter(v => isRealId(v.id))
        .map(v => [String(v.id), v])
    );

    const currentMap = new Map(
      currentVariants
        .filter(v => isRealId(v.id))
        .map(v => [String(v.id), v])
    );
    
    const deletedVariants = [];
    for (const [id, serverVariant] of serverMap.entries()) {
      if (!currentMap.has(id)) {
        deletedVariants.push(serverVariant);
      }
    }
    
    const newVariants = [];
    const updatedVariants = [];

    for (const variant of currentVariants) {
      if (isTempId(variant.id)) {
        newVariants.push(variant);
        continue;
      }
      const key = String(variant.id);
      if (!serverMap.has(key)) {
        newVariants.push(variant);
        continue;
      }
      const serverVariant = serverMap.get(key);
      if ((serverVariant.name || '') !== (variant.name || '') || normalizeVariantStockValue(serverVariant.stock) !== variant.stock) {
        updatedVariants.push(variant);
      }
    }
    
    for (const v of deletedVariants) {
      await apiRequest(`${apiPrefix === '/agent' ? '/agent/variants' : '/admin/variants'}/${v.id}`.replace('//', '/'), {
        method: 'DELETE'
      });
    }
    
    for (const v of newVariants) {
      await apiRequest(`${apiPrefix}/products/${product.id}/variants`, {
        method: 'POST',
        body: JSON.stringify({ name: v.name, stock: normalizeVariantStockValue(v.stock) })
      });
    }
    
    for (const v of updatedVariants) {
      const endpoint = `${apiPrefix === '/agent' ? '/agent/variants' : '/admin/variants'}/${v.id}`.replace('//', '/');
      await apiRequest(endpoint, {
        method: 'PUT',
        body: JSON.stringify({ name: v.name, stock: normalizeVariantStockValue(v.stock) })
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 px-5 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <i className="fas fa-info-circle text-emerald-600"></i>
            <h3 className="font-bold text-gray-900">信息</h3>
          </div>
      </div>
      
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              required
              value={formData.name}
              onChange={handleInputChange}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200 transition-all"
              placeholder="商品名称"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                分类 <span className="text-red-500">*</span>
              </label>
              <CategoryInput
                value={formData.category}
                onChange={(value) => setFormData({...formData, category: value})}
                required
                adminMode={isAdmin}
                apiPrefix={apiPrefix}
              />
            </div>
            
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                库存
              </label>
              {formData.is_not_for_sale ? (
                <div className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg flex items-center justify-center h-[38px]">
                  <i className="fas fa-infinity text-purple-600 text-base"></i>
                </div>
              ) : (
                <input
                  type="number"
                  name="stock"
                  min="0"
                  value={formData.stock}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-200 transition-all"
                  placeholder="0"
                />
              )}
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                售价 <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">¥</span>
                <input
                  type="number"
                  name="price"
                  required
                  min="0"
                  step="0.01"
                  value={formData.price}
                  onChange={handleInputChange}
                  className="w-full pl-8 pr-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200 transition-all"
                  placeholder="0.00"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                折扣
              </label>
              <select
                name="discount"
                value={formData.discount}
                onChange={handleInputChange}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-200 transition-all"
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
            
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                成本
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">¥</span>
                <input
                  type="number"
                  name="cost"
                  min="0"
                  step="0.01"
                  value={formData.cost}
                  onChange={handleInputChange}
                  className="w-full pl-8 pr-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-200 transition-all"
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              {formData.price && parseFloat(formData.price) > 0 ? (
                (() => {
                  const priceVal = parseFloat(formData.price);
                  const cost = parseFloat(formData.cost) || 0;
                  const discount = parseFloat(formData.discount) || 10;
                  const finalPrice = priceVal * (discount / 10);
                  const profit = finalPrice - cost;
                  const profitRate = cost > 0 ? (profit / cost) * 100 : null;
                  
                  return (
                <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 h-[42px] flex items-center">
                  <div className="flex items-center justify-between text-sm w-full">
                    <span className="text-gray-700 font-medium">利润</span>
                    <div className="text-right">
                      <span className="font-bold text-green-600">
                            ¥{profit.toFixed(2)}
                      </span>
                      <span className="text-xs text-gray-500 ml-2">
                            {profitRate !== null ? `${profitRate.toFixed(1)}%` : '--'}
                      </span>
                    </div>
                  </div>
                </div>
                  );
                })()
              ) : (
                <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 h-[42px] flex items-center justify-center">
                  <div className="flex items-center text-sm text-gray-400">
                    <i className="fas fa-calculator mr-2"></i>
                    <span>填写售价后显示</span>
                  </div>
                </div>
              )}
            </div>
            
            <div>
              <label className="flex items-center gap-2 px-3 py-2 h-[42px] bg-orange-50 border border-orange-200 rounded-lg cursor-pointer hover:border-orange-300 transition-all">
                <input
                  type="checkbox"
                  id="edit_is_hot"
                  checked={!!formData.is_hot}
                  onChange={(e) => setFormData(prev => ({ ...prev, is_hot: e.target.checked }))}
                  className="h-4 w-4 text-orange-500 border-gray-300 rounded focus:ring-orange-500"
                />
                <div className="flex items-center gap-1.5 text-sm">
                  <i className="fas fa-fire text-orange-500"></i>
                  <span className="font-medium text-gray-900">热销</span>
                </div>
              </label>
            </div>

            <div>
              <label className="flex items-center gap-2 px-3 py-2 h-[42px] bg-purple-50 border border-purple-200 rounded-lg cursor-pointer hover:border-purple-300 transition-all">
                <input
                  type="checkbox"
                  id="edit_is_not_for_sale"
                  checked={!!formData.is_not_for_sale}
                  onChange={(e) => setFormData(prev => ({ ...prev, is_not_for_sale: e.target.checked }))}
                  className="h-4 w-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                />
                <div className="flex items-center gap-1.5 text-sm">
                  <i className="fas fa-infinity text-purple-600"></i>
                  <span className="font-medium text-gray-900">非卖品</span>
                </div>
              </label>
            </div>
          </div>
          
          <p className="text-xs text-gray-500">
            <i className="fas fa-info-circle mr-1"></i>
            如有规格，总库存 = 各规格库存之和
          </p>
        </div>
          </div>
          
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 px-5 py-3 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <i className="fas fa-image text-pink-600"></i>
              <h3 className="font-bold text-gray-900">图片</h3>
          </div>
        </div>
        
          <div className="p-5">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 hover:border-pink-400 transition-all bg-gray-50">
          <input
            type="file"
            accept="image/*"
            onChange={handleImageChange}
                className="w-full text-xs text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-gradient-to-r file:from-pink-500 file:to-rose-500 file:text-white hover:file:from-pink-600 hover:file:to-rose-600 file:cursor-pointer file:transition-all"
              />
              <p className="text-xs text-gray-500 mt-2">支持 JPG、PNG，建议正方形</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 px-5 py-3 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <i className="fas fa-align-left text-slate-600"></i>
                <h3 className="font-bold text-gray-900">描述</h3>
              </div>
              <span className="text-xs text-gray-500">{formData.description?.length || 0} 字</span>
            </div>
          </div>
          
          <div className="p-5">
          <textarea
            name="description"
              rows={4}
            value={formData.description}
            onChange={handleInputChange}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-200 transition-all resize-none"
              placeholder="请描述商品信息..."
          />
          </div>
        </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between bg-gray-50 px-5 py-3 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <i className="fas fa-calendar-check text-teal-500"></i>
              <h3 className="font-bold text-gray-900">预约设置</h3>
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="h-4 w-4 text-teal-500 border-gray-300 rounded focus:ring-teal-400"
                checked={formData.reservation_required}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setFormData(prev => ({
                    ...prev,
                    reservation_required: checked,
                    reservation_cutoff: checked ? prev.reservation_cutoff : '',
                    reservation_note: checked ? prev.reservation_note : ''
                  }));
                }}
              />
              <span>启用预约</span>
            </label>
          </div>
          {formData.reservation_required && (
            <div className="p-5">
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">预约截止</label>
                  <input
                    type="time"
                    name="reservation_cutoff"
                    value={formData.reservation_cutoff}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-teal-400 focus:border-teal-400"
                  />
                </div>
                <div className="flex-[2]">
                  <label className="block text-sm font-medium text-gray-700 mb-1">预约说明 · 选填</label>
                  <input
                    type="text"
                    name="reservation_note"
                    value={formData.reservation_note}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-teal-400 focus:border-teal-400"
                    placeholder={"默认显示：" + formatReservationCutoff(formData.reservation_cutoff)}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

      <LocalVariantManager 
        variants={variantsState.current}
        loading={!variantsState.loaded}
        onChange={(newVariants) => {
          setVariantsState(prev => ({
            ...prev,
            current: newVariants
          }));
        }}
      />

      <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4 rounded-xl shadow-lg flex gap-3 z-10">
          <button
            type="submit"
            disabled={isLoading}
          className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 text-white py-3 px-5 rounded-lg font-bold hover:from-emerald-600 hover:to-teal-600 focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all"
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <i className="fas fa-spinner fa-spin"></i>
              {isEditMode ? '保存中...' : '添加中...'}
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <i className={`fas fa-${isEditMode ? 'save' : 'plus-circle'}`}></i>
              {isEditMode ? '保存修改' : '添加'}
            </span>
          )}
          </button>
          <button
            type="button"
            onClick={onCancel}
          className="px-6 py-3 bg-white border border-gray-300 rounded-lg text-gray-700 font-bold hover:bg-gray-50 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 transition-all"
          >
            取消
          </button>
        </div>
      </form>
  );
};

// 规格库存编辑弹窗
export const VariantStockModal = ({ product, onClose, apiPrefix, onProductVariantsSync, onStatsRefresh }) => {
  const { apiRequest } = useApi();
  const [variants, setVariants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const normalizeVariantStock = (value) => {
    if (value === null || value === undefined || value === '') return 0;
    const parsed = typeof value === 'number' ? value : parseInt(value, 10);
    if (!Number.isFinite(parsed)) return 0;
    return parsed < 0 ? 0 : parsed;
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiRequest(`${apiPrefix}/products/${product.id}/variants`);
      const variantList = (res?.data?.variants || []).map(v => ({
        ...v,
        stock: normalizeVariantStock(v.stock)
      }));
      setVariants(variantList);
      if (product?.id && typeof onProductVariantsSync === 'function') {
        const totalStock = variantList.reduce((sum, item) => sum + item.stock, 0);
        onProductVariantsSync(product.id, { variants: variantList, totalStock });
      }
    } catch (e) {
      alert(e.message || '加载规格失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [product?.id]);

  const updateStock = async (variantId, change = {}) => {
    if (saving) return;
    const { mode = 'set', delta, target, optimisticStock } = change || {};
    const safeDeltaRaw = Number.isFinite(delta) ? delta : parseInt(delta, 10);
    const safeDelta = Number.isNaN(safeDeltaRaw) ? 0 : safeDeltaRaw;

    const currentVariant = variants.find(v => v.id === variantId);
    if (!currentVariant) {
      alert('未找到规格信息');
      return;
    }

    const previousStock = normalizeVariantStock(currentVariant.stock);

    const optimisticValue = (() => {
      if (typeof optimisticStock === 'number') {
        return normalizeVariantStock(optimisticStock);
      }
      if (mode === 'delta') {
        return normalizeVariantStock(previousStock + safeDelta);
      }
      if (target !== undefined) {
        return normalizeVariantStock(target);
      }
      return previousStock;
    })();

    setVariants(prev => prev.map(v => 
      v.id === variantId ? { ...v, stock: optimisticValue } : v
    ));

    setSaving(true);
    try {
      const latestResponse = await apiRequest(`${apiPrefix}/products/${product.id}/variants`);
      const rawList = latestResponse?.data?.variants || [];
      const latestList = rawList.map(v => ({
        ...v,
        stock: normalizeVariantStock(v.stock)
      }));
      const latestVariant = latestList.find(v => v.id === variantId);
      if (!latestVariant) {
        throw new Error('未找到最新规格信息');
      }

      const latestStock = normalizeVariantStock(latestVariant.stock);
      const baseTotalStock = latestList.reduce((sum, item) => sum + item.stock, 0);

      const nextStock = (() => {
        if (mode === 'delta') {
          return normalizeVariantStock(latestStock + safeDelta);
        }
        if (mode === 'set') {
          const normalizedTarget = target !== undefined ? normalizeVariantStock(target) : optimisticValue;
          return normalizedTarget;
        }
        return normalizeVariantStock(optimisticValue);
      })();

      const endpointBase = apiPrefix === '/agent' ? '/agent/variants' : '/admin/variants';
      const endpoint = `${endpointBase}/${variantId}`.replace('//', '/');

      if (nextStock === latestStock) {
        setVariants(latestList);
        if (product?.id && typeof onProductVariantsSync === 'function') {
          onProductVariantsSync(product.id, { variants: latestList, totalStock: baseTotalStock });
        }
        return nextStock;
      }

      await apiRequest(endpoint, {
        method: 'PUT',
        body: JSON.stringify({ stock: nextStock })
      });

      const updatedList = latestList.map(v => 
        v.id === variantId ? { ...v, stock: nextStock } : v
      );
      setVariants(updatedList);
      if (product?.id && typeof onProductVariantsSync === 'function') {
        const updatedTotal = updatedList.reduce((sum, item) => sum + item.stock, 0);
        onProductVariantsSync(product.id, { variants: updatedList, totalStock: updatedTotal });
      }

      if (typeof onStatsRefresh === 'function') {
        onStatsRefresh().catch(err => console.error('刷新统计数据失败:', err));
      }

      return nextStock;
    } catch (e) {
      setVariants(prev => prev.map(v => 
        v.id === variantId ? { ...v, stock: previousStock } : v
      ));
      alert(e.message || '更新库存失败');
      throw e;
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
            {(variants || []).map(v => {
              const currentStock = normalizeVariantStock(v.stock);
              return (
                <div key={v.id} className="flex items-center justify-between px-3 py-2 border rounded-md">
                  <div className="text-sm text-gray-800">{v.name}</div>
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => {
                        const nextStock = Math.max(0, currentStock - 1);
                        updateStock(v.id, {
                          mode: 'delta',
                          delta: -1,
                          optimisticStock: nextStock
                        }).catch(() => {});
                      }}
                      disabled={saving || currentStock <= 0}
                      className="w-6 h-6 flex items-center justify-center bg-red-500 hover:bg-red-600 text-white text-xs rounded-full disabled:bg-gray-300 disabled:cursor-not-allowed"
                      title="减少库存"
                    >-</button>
                    <input
                      type="number"
                      className="w-16 px-1 py-0.5 text-center text-sm border border-gray-300 rounded"
                      value={currentStock}
                      onChange={(e) => {
                        const val = normalizeVariantStock(e.target.value);
                        setVariants(prev => prev.map(x => x.id === v.id ? { ...x, stock: val } : x));
                      }}
                      onBlur={(e) => {
                        const val = normalizeVariantStock(e.target.value);
                        updateStock(v.id, {
                          mode: 'set',
                          target: val,
                          optimisticStock: val
                        }).catch(() => {});
                      }}
                      min="0"
                    />
                    <button
                      onClick={() => {
                        const nextStock = currentStock + 1;
                        updateStock(v.id, {
                          mode: 'delta',
                          delta: 1,
                          optimisticStock: nextStock
                        }).catch(() => {});
                      }}
                      disabled={saving}
                      className="w-6 h-6 flex items-center justify-center bg-green-500 hover:bg-green-600 text-white text-xs rounded-full disabled:bg-gray-300 disabled:cursor-not-allowed"
                      title="增加库存"
                    >+</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-3 text-right">
          <button onClick={onClose} className="px-3 py-1.5 rounded-md border text-sm hover:bg-gray-50">关闭</button>
        </div>
      </div>
    </div>
  );
};

// 商品管理面板
export const ProductsPanel = ({
  isAdmin,
  showInactiveInShop,
  updateShopInactiveSetting,
  isLoadingShopSetting,
  onAddClick,
  categories,
  productCategoryFilter,
  onProductCategoryFilterChange,
  isLoading,
  visibleProducts,
  onRefreshProducts,
  onEditProduct,
  onDeleteProduct,
  onUpdateStock,
  onBatchDelete,
  onBatchUpdateDiscount,
  onBatchToggleActive,
  selectedProducts,
  onSelectProduct,
  onSelectAllProducts,
  onUpdateDiscount,
  onToggleActive,
  onOpenVariantStock,
  onToggleHot,
  showOnlyOutOfStock,
  showOnlyInactive,
  onToggleOutOfStockFilter,
  onToggleInactiveFilter,
  operatingProducts,
  sortBy,
  sortOrder,
  onSortClick
}) => (
  <>
    <div className="mb-6 flex justify-between items-center">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-medium text-gray-900">
          商品管理
          {isAdmin && (
            <span className="ml-3 text-sm font-normal text-gray-600">
              （是否向用户展示已下架商品
              <span className="inline-flex items-center ml-2 mr-1">
                <IOSToggle 
                  enabled={showInactiveInShop}
                  onChange={updateShopInactiveSetting}
                  disabled={isLoadingShopSetting}
                  size="sm"
                />
              </span>
              ）
            </span>
          )}
        </h2>
      </div>
      <button
        onClick={onAddClick}
        className="bg-indigo-600 text-white px-4 py-2 rounded-md font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
      >
        添加商品
      </button>
    </div>

    <div className="mb-4 flex flex-wrap gap-2">
      <button
        onClick={() => onProductCategoryFilterChange('全部')}
        className={`px-3 py-1 rounded-md text-sm border ${productCategoryFilter === '全部' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
      >全部</button>
      {(categories || []).map(c => (
        <button
          key={c.id}
          onClick={() => onProductCategoryFilterChange(c.name)}
          className={`px-3 py-1 rounded-md text-sm border ${productCategoryFilter === c.name ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
        >{c.name}</button>
      ))}
    </div>

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
            onRefresh={onRefreshProducts}
            onEdit={onEditProduct}
            onDelete={onDeleteProduct}
            onUpdateStock={onUpdateStock}
            onBatchDelete={onBatchDelete}
            onBatchUpdateDiscount={onBatchUpdateDiscount}
            onBatchToggleActive={onBatchToggleActive}
            selectedProducts={selectedProducts}
            onSelectProduct={onSelectProduct}
            onSelectAll={onSelectAllProducts}
            onUpdateDiscount={onUpdateDiscount}
            onToggleActive={onToggleActive}
            onOpenVariantStock={onOpenVariantStock}
            onToggleHot={onToggleHot}
            showOnlyOutOfStock={showOnlyOutOfStock}
            showOnlyInactive={showOnlyInactive}
            onToggleOutOfStockFilter={onToggleOutOfStockFilter}
            onToggleInactiveFilter={onToggleInactiveFilter}
            operatingProducts={operatingProducts}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortClick={onSortClick}
      />
    )}
  </>
);

export default ProductsPanel;
