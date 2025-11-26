import React, { useEffect, useMemo, useRef, useState, useCallback, useLayoutEffect } from 'react';
import ReactDOM from 'react-dom';
import RetryImage from '../RetryImage';
import { useApi } from '../../hooks/useAuth';
import { getProductImage } from '../../utils/urls';
import { formatReservationCutoff, normalizeBooleanFlag } from './helpers';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, Minus, Search, Filter, MoreHorizontal, Edit2, Trash2, 
  Eye, EyeOff, Archive, ArrowUpDown, Check, X, Image as ImageIcon,
  Info, Calendar, DollarSign, Tag, Layers, RotateCcw, Save, Loader2, Package,
  Flame, ChevronDown
} from 'lucide-react';

// iOS风格开关组件
export const IOSToggle = ({ enabled, onChange, disabled = false, size = 'md' }) => {
  const sizeClasses = {
    sm: 'w-9 h-5',
    md: 'w-11 h-6',
    lg: 'w-14 h-8'
  };
  
  const thumbSizes = {
    sm: 'w-3.5 h-3.5',
    md: 'w-5 h-5',
    lg: 'w-6 h-6'
  };
  
  const translate = {
    sm: enabled ? 'translate-x-4' : 'translate-x-0.5',
    md: enabled ? 'translate-x-5' : 'translate-x-0.5', 
    lg: enabled ? 'translate-x-8' : 'translate-x-1'
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={() => !disabled && onChange(!enabled)}
      className={`${sizeClasses[size]} relative inline-flex items-center rounded-full transition-colors duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500/20 ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      } ${
        enabled 
          ? 'bg-green-500' 
          : 'bg-gray-200 hover:bg-gray-300'
      }`}
    >
      <span className="sr-only">切换开关</span>
      <span
        className={`${thumbSizes[size]} ${translate[size]} inline-block rounded-full bg-white shadow-sm transform transition-transform duration-300 ease-[cubic-bezier(0.4,0.0,0.2,1)]`}
      />
    </button>
  );
};

// 内联库存控制组件
export const StockControl = ({ product, onUpdateStock }) => {
  const normalizeStock = (value) => {
    if (value === '' || value === null || value === undefined) return 0;
    const parsed = typeof value === 'number' ? value : parseInt(value, 10);
    return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed;
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
      <span className="inline-flex items-center px-2 py-1 rounded-md bg-purple-50 text-purple-600 text-xs font-medium">
        无限
      </span>
    );
  }

  const submitChange = async (changePayload) => {
    const { optimisticStock } = changePayload;
    if (typeof optimisticStock === 'number' && optimisticStock < 0) return;

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
    submitChange({ mode: 'delta', delta: 1, optimisticStock: newStock }).catch(() => {});
  };

  const handleDecrement = () => {
    if (isLoading) return;
    const current = normalizeStock(stock);
    if (current <= 0) return;
    const newStock = Math.max(0, current - 1);
    setStock(newStock);
    submitChange({ mode: 'delta', delta: -1, optimisticStock: newStock }).catch(() => {});
  };

  const handleInputBlur = () => {
    setIsEditing(false);
    const normalizedProductStock = normalizeStock(product.stock);
    const normalizedInput = normalizeStock(stock);
    if (normalizedInput !== normalizedProductStock) {
      setStock(normalizedInput);
      submitChange({ mode: 'set', target: normalizedInput, optimisticStock: normalizedInput }).catch(() => {});
    }
  };

  return (
    <div className="flex items-center gap-1 bg-gray-50 rounded-lg p-1 border border-gray-200 w-fit">
      <button
        onClick={handleDecrement}
        disabled={isLoading || normalizeStock(stock) <= 0}
        className="w-6 h-6 flex items-center justify-center rounded-md text-gray-500 hover:bg-white hover:text-red-500 hover:shadow-sm disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:shadow-none transition-all"
      >
        <Minus size={12} />
      </button>
      
      {isEditing ? (
        <input
          type="number"
          value={stock}
          onChange={(e) => setStock(Math.max(0, parseInt(e.target.value, 10) || 0))}
          onBlur={handleInputBlur}
          onKeyPress={(e) => e.key === 'Enter' && handleInputBlur()}
          className="w-10 text-center text-sm bg-white border border-indigo-200 rounded px-0 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          autoFocus
        />
      ) : (
        <span 
          onClick={() => setIsEditing(true)}
          className="w-10 text-center text-sm font-medium text-gray-700 cursor-pointer hover:text-indigo-600 transition-colors"
        >
          {isLoading ? <Loader2 size={12} className="animate-spin mx-auto" /> : normalizeStock(stock)}
        </span>
      )}
      
      <button
        onClick={handleIncrement}
        disabled={isLoading}
        className="w-6 h-6 flex items-center justify-center rounded-md text-gray-500 hover:bg-white hover:text-green-500 hover:shadow-sm disabled:opacity-30 transition-all"
      >
        <Plus size={12} />
      </button>
    </div>
  );
};

// 折扣选择下拉框组件
const DiscountSelect = ({ value, onChange, disabled, placeholder = '无折扣' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, isAbove: false });
  const buttonRef = useRef(null);

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const DROPDOWN_HEIGHT = 220; // 预估高度
    const spaceBelow = window.innerHeight - rect.bottom;
    const showAbove = spaceBelow < DROPDOWN_HEIGHT && rect.top > spaceBelow;

    setPosition({
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      isAbove: showAbove
    });
  }, []);

  useEffect(() => {
    if (isOpen) {
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
    }
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;
    const handleGlobalClick = (e) => {
      if (buttonRef.current && buttonRef.current.contains(e.target)) return;
      if (e.target.closest('.discount-dropdown-portal')) return;
      setIsOpen(false);
    };
    document.addEventListener('mousedown', handleGlobalClick);
    return () => document.removeEventListener('mousedown', handleGlobalClick);
  }, [isOpen]);

  const toggleOpen = () => {
    if (disabled) return;
    if (!isOpen) updatePosition();
    setIsOpen(!isOpen);
  };

  // 生成20个选项：10.0, 9.5, ..., 0.5
  const options = Array.from({ length: 20 }).map((_, i) => {
    const val = 10 - i * 0.5;
    const v = Math.max(0.5, parseFloat(val.toFixed(1)));
    return { value: v, label: v === 10 ? '无' : String(v) };
  });

  const currentLabel = value && value < 10 ? `${value}折` : placeholder;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleOpen}
        disabled={disabled}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl transition-all border shadow-sm active:scale-95 ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:shadow-md'
        } ${value && value < 10 ? 'text-indigo-600 bg-indigo-50 border-indigo-100' : 'text-gray-600 bg-white border-gray-200'}`}
      >
        <span>{currentLabel}</span>
        <ChevronDown size={12} className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {ReactDOM.createPortal(
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: position.isAbove ? 10 : -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: position.isAbove ? 10 : -10 }}
              transition={{ 
                type: "spring",
                stiffness: 400,
                damping: 25,
                mass: 0.8
              }}
              className="discount-dropdown-portal fixed z-[9999] p-2 bg-white/90 backdrop-blur-xl rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-white/20 w-[220px]"
              style={{
                left: position.left,
                top: position.isAbove ? 'auto' : position.bottom + 8,
                bottom: position.isAbove ? (window.innerHeight - position.top + 8) : 'auto',
                transformOrigin: position.isAbove ? 'bottom left' : 'top left'
              }}
            >
              <div className="grid grid-cols-4 gap-1.5">
                {options.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      onChange(opt.value);
                      setIsOpen(false);
                    }}
                    className={`
                      relative flex items-center justify-center h-8 rounded-lg text-xs font-medium transition-all duration-200
                      hover:scale-105 active:scale-95
                      ${value === opt.value 
                        ? 'bg-indigo-500 text-white shadow-indigo-200 shadow-md' 
                        : 'bg-gray-50 text-gray-600 hover:bg-indigo-50 hover:text-indigo-600'
                      }
                    `}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="mt-2 pt-2 border-t border-gray-100 text-[10px] text-center text-gray-400">
                 选择折扣率 (折)
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
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
        className={`flex items-center gap-1.5 transition-colors group ${isActive ? 'text-gray-900 font-semibold' : 'hover:text-gray-700'}`}
      >
        <span>{label}</span>
        <div className="flex flex-col items-center">
          <ArrowUpDown size={12} className={`${isActive ? 'text-indigo-600' : 'text-gray-300 group-hover:text-gray-400'}`} />
        </div>
      </button>
    );
  };

  return (
    <div className="bg-white rounded-2xl shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] border border-gray-100 overflow-hidden flex flex-col">
      <div className="px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4 bg-gray-50/30">
        <div className="flex items-center gap-4">
          <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Layers size={18} className="text-indigo-500" />
            商品列表
          </h3>
          {operatingProducts && operatingProducts.size > 0 && (
            <div className="inline-flex items-center gap-2 text-xs font-medium text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-100">
              <Loader2 size={12} className="animate-spin" />
              <span>处理中 {operatingProducts.size} 项...</span>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-3 h-9">
          {selectedProducts.length > 0 ? (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-3 bg-indigo-50 px-3 py-1 rounded-lg border border-indigo-100 h-full"
            >
              <span className="text-xs font-medium text-indigo-700 whitespace-nowrap">已选 {selectedProducts.length} 项</span>
              
              <div className="h-4 w-px bg-indigo-200" />
              
              <DiscountSelect
                value={null}
                onChange={(val) => {
                  onBatchUpdateDiscount(selectedProducts, val);
                }}
                placeholder="批量折扣"
              />

              <div className="h-4 w-px bg-indigo-200" />

              <div className="flex items-center gap-2 px-1">
                 <span className="text-xs text-indigo-700 font-medium">上架</span>
                 {(() => {
                    const activeCount = selectedProducts.filter(id => {
                        const p = products.find(p => p.id === id);
                        return p && (p.is_active === 1 || p.is_active === true);
                    }).length;
                    const isBatchActive = activeCount > selectedProducts.length / 2;
                    
                    return (
                        <button
                            onClick={() => onBatchToggleActive && onBatchToggleActive(selectedProducts, isBatchActive ? 0 : 1)}
                            className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            isBatchActive ? 'bg-green-500' : 'bg-gray-200'
                            }`}
                        >
                            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isBatchActive ? 'translate-x-4' : 'translate-x-0'}`} />
                        </button>
                    );
                 })()}
              </div>
              
              <div className="h-4 w-px bg-indigo-200" />
              
              <button
                onClick={() => onBatchDelete(selectedProducts)}
                className="p-1.5 text-red-600 hover:bg-red-100 rounded transition-colors"
                title="批量删除"
              >
                <Trash2 size={14} />
              </button>
            </motion.div>
          ) : (
            <div className="flex items-center gap-3 h-full">
              <label className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 cursor-pointer hover:text-gray-900 transition-colors">
                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${showOnlyOutOfStock ? 'bg-orange-500 border-orange-500' : 'border-gray-300 bg-white'}`}>
                  {showOnlyOutOfStock && <Check size={10} className="text-white" />}
                </div>
                <input
                  type="checkbox"
                  checked={showOnlyOutOfStock}
                  onChange={(e) => onToggleOutOfStockFilter(e.target.checked)}
                  className="hidden"
                />
                <span>仅缺货</span>
              </label>
              <label className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 cursor-pointer hover:text-gray-900 transition-colors">
                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${showOnlyInactive ? 'bg-gray-500 border-gray-500' : 'border-gray-300 bg-white'}`}>
                  {showOnlyInactive && <Check size={10} className="text-white" />}
                </div>
                <input
                  type="checkbox"
                  checked={showOnlyInactive}
                  onChange={(e) => onToggleInactiveFilter(e.target.checked)}
                  className="hidden"
                />
                <span>仅下架</span>
              </label>
            </div>
          )}
          
          <button
            onClick={onRefresh}
            className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
            title="刷新列表"
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </div>
      
      <div className="overflow-x-auto flex-1">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50/50">
            <tr>
              <th className="px-6 py-3 text-left w-12">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  ref={input => { if (input) input.indeterminate = isPartiallySelected; }}
                  onChange={(e) => onSelectAll(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer"
                />
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">商品信息</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"><SortIndicator column="category" label="分类" /></th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">状态</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"><SortIndicator column="price" label="价格" /></th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"><SortIndicator column="stock" label="库存" /></th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-32"><SortIndicator column="created_at" label="创建时间" /></th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-50">
            {products.map((product) => {
              const isHot = Boolean(product.is_hot);
              const isNonSellable = normalizeBooleanFlag(product.is_not_for_sale, false);
              const isSelected = selectedProducts.includes(product.id);
              const isActive = !(product.is_active === 0 || product.is_active === false);
              
              return (
                <tr key={product.id} className={`group transition-colors hover:bg-gray-50/80 ${isSelected ? 'bg-indigo-50/30' : ''}`}>
                  <td className="px-6 py-4">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => onSelectProduct(product.id, e.target.checked)}
                      className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer transition-all"
                    />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-4">
                      <div className="relative flex-shrink-0 w-12 h-12 rounded-lg border border-gray-100 bg-gray-50 overflow-hidden group-hover:shadow-sm transition-all">
                        {getProductImage(product) ? (
                          <RetryImage
                            className="w-full h-full object-cover"
                            src={getProductImage(product)}
                            alt={product.name}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-300">
                            <ImageIcon size={20} />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span 
                            className={`text-sm font-medium truncate max-w-[200px] ${
                              !isActive 
                                ? 'text-gray-400 line-through' 
                                : isNonSellable 
                                  ? 'text-purple-600' 
                                  : (!product.has_variants && product.stock <= 0)
                                    ? 'text-red-600'
                                    : 'text-gray-900'
                            }`} 
                            title={product.name}
                          >
                            {product.name}
                          </span>
                          {isHot && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-50 text-orange-600 border border-orange-100">HOT</span>}
                        </div>
                        <p className="text-xs text-gray-500 truncate max-w-[200px]">{product.description || '暂无描述'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                      {product.category}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onToggleActive(product)}
                        disabled={operatingProducts?.has(product.id)}
                        className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          isActive ? 'bg-green-500' : 'bg-gray-200'
                        } ${operatingProducts?.has(product.id) ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isActive ? 'translate-x-4' : 'translate-x-0'}`} />
                      </button>
                      <span className={`text-xs ${isActive ? 'text-green-600' : 'text-gray-400'}`}>{isActive ? '上架' : '下架'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      {(() => {
                        const z = (typeof product.discount === 'number' && product.discount) ? product.discount : (product.discount ? parseFloat(product.discount) : 10);
                        const hasDiscount = z && z > 0 && z < 10;
                        const finalPrice = hasDiscount ? (Math.round(product.price * (z / 10) * 100) / 100) : product.price;
                        return (
                          <div className="flex items-center gap-3">
                            <div className="flex flex-col items-start">
                              <span className="text-sm font-semibold text-gray-900">¥{finalPrice}</span>
                              {hasDiscount && <span className="text-xs text-gray-400 line-through">¥{product.price}</span>}
                            </div>
                            <DiscountSelect 
                              value={z}
                              onChange={(val) => onUpdateDiscount(product.id, val)}
                              disabled={operatingProducts?.has(product.id)}
                            />
                          </div>
                        );
                      })()}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {product.has_variants ? (
                      <button
                        onClick={() => onOpenVariantStock(product)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-50 text-indigo-600 text-xs font-medium hover:bg-indigo-100 transition-colors"
                      >
                        <Layers size={12} />
                        多规格
                      </button>
                    ) : (
                      <StockControl product={product} onUpdateStock={onUpdateStock} />
                    )}
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-500 font-mono">
                    {new Date(product.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-left">
                    <div className="flex items-center justify-start gap-2">
                      <button
                        onClick={() => onEdit(product)}
                        className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-all"
                        title="编辑"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => onToggleHot(product, !isHot)}
                        className={`p-1.5 rounded-md transition-all ${isHot ? 'text-orange-500 bg-orange-50' : 'text-gray-400 hover:text-orange-500 hover:bg-orange-50'}`}
                        title="切换热销"
                      >
                        <Flame size={14} />
                      </button>
                      <button
                        onClick={() => onDelete(product)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-all"
                        title="删除"
                      >
                        <Trash2 size={14} />
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
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 bg-gray-50/30">
          <Archive size={48} className="mb-4 opacity-20" />
          <p className="text-sm font-medium">暂无商品数据</p>
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
      <div className="relative group">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Tag size={16} className="text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          required={required}
          disabled={disabled}
          className="w-full pl-10 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all disabled:bg-gray-100 disabled:text-gray-400"
          placeholder="输入或选择分类"
        />
      </div>
      
      {showSuggestions && categories.length > 0 && typeof document !== 'undefined' && (
        ReactDOM.createPortal(
          <AnimatePresence>
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 5 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 5 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              className="bg-white border border-gray-100 rounded-xl shadow-xl max-h-60 overflow-auto py-1 z-[9999] custom-scrollbar"
              style={{
                position: 'fixed',
                [dropdownPosition.showAbove ? 'bottom' : 'top']: dropdownPosition.showAbove 
                  ? `${window.innerHeight - dropdownPosition.top}px`
                  : `${dropdownPosition.top}px`,
                left: `${dropdownPosition.left}px`,
                width: `${dropdownPosition.width}px`,
              }}
            >
              {filteredCategories.length > 0 ? (
                filteredCategories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    className="w-full px-4 py-2.5 text-left hover:bg-indigo-50 text-sm text-gray-700 hover:text-indigo-700 transition-colors flex items-center justify-between group"
                    onClick={() => handleSelectCategory(category.name)}
                  >
                    <span>{category.name}</span>
                    {inputValue === category.name && <Check size={14} className="text-indigo-600" />}
                  </button>
                ))
              ) : (
                <div className="px-4 py-3 text-gray-400 text-sm text-center">
                  无匹配分类
                </div>
              )}
            </motion.div>
          </AnimatePresence>,
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
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="bg-gray-50/50 px-5 py-3 border-b border-gray-100 flex items-center gap-2">
        <Layers size={18} className="text-indigo-500" />
        <div>
          <h3 className="text-sm font-semibold text-gray-900">多规格管理</h3>
          <p className="text-[10px] text-gray-500">为商品添加不同的规格选项（如颜色、尺寸等）</p>
        </div>
      </div>
      
      <div className="p-5 space-y-4">
        <div className="flex gap-3 items-end">
          <div className="flex-1 space-y-1.5">
            <label className="text-xs font-medium text-gray-700">规格名称</label>
            <input 
              value={newName} 
              onChange={e => setNewName(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && (e.preventDefault(), addVariant())}
              placeholder="例如：红色、XL" 
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all"
            />
          </div>
          <div className="w-24 space-y-1.5">
            <label className="text-xs font-medium text-gray-700">库存</label>
            <input 
              type="number" 
              value={newStock} 
              min={0} 
              onChange={e => setNewStock(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && (e.preventDefault(), addVariant())}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition-all text-center"
            />
          </div>
          <button 
            type="button"
            onClick={addVariant} 
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-all shadow-sm hover:shadow flex items-center gap-2 h-[38px]"
          >
            <Plus size={16} />
            添加
          </button>
        </div>
        
        {loading ? (
          <div className="flex items-center justify-center py-8 text-gray-400">
            <Loader2 size={24} className="animate-spin mr-2" />
            <span className="text-sm">加载规格中...</span>
          </div>
        ) : variants.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            <Layers size={32} className="text-gray-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-500">暂无规格</p>
            <p className="text-xs text-gray-400 mt-1">添加规格后，总库存将自动计算</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
            {variants.map((v) => (
              <div key={v.id} className="relative group bg-white rounded-xl border border-gray-200 p-3 hover:shadow-md hover:border-indigo-200 transition-all">
                <button
                  type="button"
                  onClick={() => removeVariant(v.id)}
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white text-gray-400 hover:text-red-500 border border-gray-200 hover:border-red-200 shadow-sm flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100"
                  title="删除规格"
                >
                  <X size={14} />
                </button>
                
                <div className="space-y-2">
                  <input 
                    className="w-full px-2 py-1 bg-transparent border-b border-transparent hover:border-gray-200 focus:border-indigo-500 text-sm font-medium text-gray-900 focus:outline-none transition-colors" 
                    value={v.name} 
                    onChange={(e) => updateVariant(v.id, 'name', e.target.value)}
                    placeholder="规格名称"
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">库存:</span>
                    <input 
                      type="number" 
                      min={0} 
                      className="flex-1 px-2 py-1 bg-gray-50 rounded text-xs font-medium text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-right" 
                      value={v.stock} 
                      onChange={(e) => updateVariant(v.id, 'stock', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
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
    <form onSubmit={handleSubmit} className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-1 custom-scrollbar space-y-6 pb-24">
        {/* Basic Info Section */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-6 text-gray-900 font-semibold">
            <Info size={18} className="text-indigo-500" />
            基本信息
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">商品名称 <span className="text-red-500">*</span></label>
              <input
                type="text"
                name="name"
                required
                value={formData.name}
                onChange={handleInputChange}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all"
                placeholder="请输入商品名称"
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">商品分类 <span className="text-red-500">*</span></label>
              <CategoryInput
                value={formData.category}
                onChange={(value) => setFormData({...formData, category: value})}
                required
                adminMode={isAdmin}
                apiPrefix={apiPrefix}
              />
            </div>
          </div>
        </div>

        {/* Pricing & Stock Section */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-6 text-gray-900 font-semibold">
            <DollarSign size={18} className="text-emerald-500" />
            价格与库存
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">售价 <span className="text-red-500">*</span></label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-gray-400 font-medium group-focus-within:text-emerald-500 transition-colors">¥</span>
                </div>
                <input
                  type="number"
                  name="price"
                  required
                  min="0"
                  step="0.01"
                  value={formData.price}
                  onChange={handleInputChange}
                  className="w-full pl-8 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:bg-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all font-medium"
                  placeholder="0.00"
                />
              </div>
            </div>
            
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">折扣</label>
              <div className="relative">
                <select
                  name="discount"
                  value={formData.discount}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:bg-white focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 transition-all appearance-none"
                >
                  {Array.from({ length: 20 }).map((_, i) => {
                    const val = 10 - i * 0.5;
                    const v = Math.max(0.5, parseFloat(val.toFixed(1)));
                    return <option key={v} value={v}>{v}折</option>;
                  })}
                </select>
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <ArrowUpDown size={14} className="text-gray-400" />
                </div>
              </div>
            </div>
            
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">库存</label>
              {formData.is_not_for_sale ? (
                <div className="w-full px-3 py-2.5 bg-gray-100 border border-gray-200 rounded-xl flex items-center justify-center text-purple-600 font-medium">
                  无限库存
                </div>
              ) : (
                <input
                  type="number"
                  name="stock"
                  min="0"
                  value={formData.stock}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:bg-white focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 transition-all"
                  placeholder="0"
                />
              )}
            </div>
          </div>
          
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${formData.is_hot ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
              <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${formData.is_hot ? 'bg-orange-500 border-orange-500' : 'border-gray-300 bg-white'}`}>
                {formData.is_hot && <Check size={12} className="text-white" />}
              </div>
              <input
                type="checkbox"
                checked={!!formData.is_hot}
                onChange={(e) => setFormData(prev => ({ ...prev, is_hot: e.target.checked }))}
                className="hidden"
              />
              <div>
                <span className="block text-sm font-medium text-gray-900">设为热销</span>
                <span className="block text-xs text-gray-500">商品将带有热销标记</span>
              </div>
            </label>

            <label className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${formData.is_not_for_sale ? 'bg-purple-50 border-purple-200' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
              <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${formData.is_not_for_sale ? 'bg-purple-600 border-purple-600' : 'border-gray-300 bg-white'}`}>
                {formData.is_not_for_sale && <Check size={12} className="text-white" />}
              </div>
              <input
                type="checkbox"
                checked={!!formData.is_not_for_sale}
                onChange={(e) => setFormData(prev => ({ ...prev, is_not_for_sale: e.target.checked }))}
                className="hidden"
              />
              <div>
                <span className="block text-sm font-medium text-gray-900">非卖品展示</span>
                <span className="block text-xs text-gray-500">仅展示不售卖，库存无限</span>
              </div>
            </label>
          </div>
        </div>

        {/* Variants Section */}
        <LocalVariantManager 
          variants={variantsState.current}
          loading={!variantsState.loaded}
          onChange={(newVariants) => setVariantsState(prev => ({ ...prev, current: newVariants }))}
        />

        {/* Image & Description Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4 text-gray-900 font-semibold">
              <ImageIcon size={18} className="text-pink-500" />
              商品图片
            </div>
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 hover:border-pink-400 hover:bg-pink-50/10 transition-all text-center group cursor-pointer relative">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div className="flex flex-col items-center justify-center pointer-events-none">
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <ImageIcon size={24} className="text-gray-400 group-hover:text-pink-500 transition-colors" />
                </div>
                <p className="text-sm font-medium text-gray-700 group-hover:text-pink-600 transition-colors">点击上传图片</p>
                <p className="text-xs text-gray-400 mt-1">支持 JPG, PNG (建议正方形)</p>
                {imageFile && (
                  <div className="mt-3 px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium flex items-center gap-1">
                    <Check size={12} />
                    已选择: {imageFile.name}
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-gray-900 font-semibold">
                <MoreHorizontal size={18} className="text-slate-500" />
                商品描述
              </div>
              <span className="text-xs text-gray-400">{formData.description?.length || 0} 字</span>
            </div>
            <textarea
              name="description"
              rows={5}
              value={formData.description}
              onChange={handleInputChange}
              className="w-full flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:bg-white focus:border-slate-500 focus:ring-4 focus:ring-slate-500/10 transition-all resize-none"
              placeholder="请输入商品详细描述..."
            />
          </div>
        </div>
        
        {/* Reservation Section */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="bg-gray-50/50 px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2 text-gray-900 font-semibold">
              <Calendar size={18} className="text-teal-500" />
              预约设置
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer"
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
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-teal-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600"></div>
              <span className="ml-3 text-sm font-medium text-gray-700">启用预约</span>
            </label>
          </div>
          
          {formData.reservation_required && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6"
            >
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">预约截止时间</label>
                <input
                  type="time"
                  name="reservation_cutoff"
                  value={formData.reservation_cutoff}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:bg-white focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">预约说明 (选填)</label>
                <input
                  type="text"
                  name="reservation_note"
                  value={formData.reservation_note}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:bg-white focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 transition-all"
                  placeholder={"默认显示：" + formatReservationCutoff(formData.reservation_cutoff)}
                />
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Sticky Bottom Bar */}
      <div className="absolute bottom-0 left-0 right-0 bg-white/80 backdrop-blur-md border-t border-gray-200 p-4 flex gap-3 z-20">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-6 py-3 bg-white border border-gray-200 rounded-xl text-gray-700 font-semibold hover:bg-gray-50 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-200 transition-all shadow-sm"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={isLoading}
          className="flex-[2] bg-gray-900 text-white py-3 px-6 rounded-xl font-semibold hover:bg-black focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-gray-900/20 transition-all flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              {isEditMode ? '保存中...' : '添加中...'}
            </>
          ) : (
            <>
              <Save size={18} />
              {isEditMode ? '保存修改' : '确认添加'}
            </>
          )}
        </button>
      </div>
    </form>
  );
};

// 规格库存编辑弹窗
export const VariantStockModal = ({ product, onClose, apiPrefix, onProductVariantsSync, onStatsRefresh, onWarningsRefresh }) => {
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

      if (typeof onWarningsRefresh === 'function') {
        onWarningsRefresh().catch(err => console.error('刷新警告状态失败:', err));
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ 
          type: "spring",
          stiffness: 350,
          damping: 25,
          mass: 0.8
        }}
        className="relative bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-gray-100 z-10"
      >
        <div className="bg-gray-50/80 px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers size={18} className="text-indigo-500" />
            <h4 className="text-base font-semibold text-gray-900">规格库存管理</h4>
          </div>
          <button 
            className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-1.5 rounded-lg transition-colors" 
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        
        <div className="p-5">
          <div className="mb-4 flex items-center gap-2 text-sm text-gray-500 bg-gray-50 p-3 rounded-xl border border-gray-100">
            <Info size={16} className="text-indigo-500" />
            <span>正在管理 <span className="font-semibold text-gray-900">{product?.name}</span> 的库存</span>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <Loader2 size={32} className="animate-spin mb-3 text-indigo-500" />
              <span className="text-sm">加载规格信息...</span>
            </div>
          ) : (variants || []).length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">
              <Layers size={40} className="text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-500">该商品暂无规格</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
              {(variants || []).map(v => {
                const currentStock = normalizeVariantStock(v.stock);
                return (
                  <div key={v.id} className="flex items-center justify-between px-4 py-3 bg-white border border-gray-100 rounded-xl hover:border-indigo-100 hover:shadow-sm transition-all group">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold">
                        {v.name.charAt(0)}
                      </div>
                      <div className="text-sm font-medium text-gray-900">{v.name}</div>
                    </div>
                    
                    <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-1 border border-gray-200 group-hover:border-indigo-200 transition-colors">
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
                        className="w-7 h-7 flex items-center justify-center bg-white text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-md shadow-sm border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        title="减少库存"
                      >
                        <Minus size={14} />
                      </button>
                      
                      <input
                        type="number"
                        className="w-14 text-center bg-transparent text-sm font-semibold text-gray-900 focus:outline-none"
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
                        className="w-7 h-7 flex items-center justify-center bg-white text-gray-500 hover:text-green-500 hover:bg-green-50 rounded-md shadow-sm border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        title="增加库存"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        
        <div className="bg-gray-50 px-5 py-4 border-t border-gray-100 flex justify-end">
          <button 
            onClick={onClose} 
            className="px-5 py-2.5 bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-200 transition-all shadow-sm"
          >
            完成
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// 商品管理面板
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
  <div className="space-y-6">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="p-2 bg-indigo-50 rounded-xl">
          <Package size={24} className="text-indigo-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">商品管理</h2>
          {isAdmin && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-gray-500">展示已下架商品</span>
              <button
                onClick={() => !isLoadingShopSetting && updateShopInactiveSetting(!showInactiveInShop)}
                disabled={isLoadingShopSetting}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  showInactiveInShop ? 'bg-green-500' : 'bg-gray-200'
                } ${isLoadingShopSetting ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${showInactiveInShop ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>
          )}
        </div>
      </div>
      <button
        onClick={onAddClick}
        className="flex items-center justify-center gap-2 bg-gray-900 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-black focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 shadow-lg shadow-gray-900/20 transition-all active:scale-95"
      >
        <Plus size={18} />
        添加商品
      </button>
    </div>

    <div className="flex flex-wrap gap-2 bg-white p-2 rounded-xl border border-gray-100 shadow-sm">
      <button
        onClick={() => onProductCategoryFilterChange('全部')}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
          productCategoryFilter === '全部' 
            ? 'bg-gray-900 text-white shadow-md' 
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        }`}
      >
        全部
      </button>
      {(categories || []).map(c => (
        <button
          key={c.id}
          onClick={() => onProductCategoryFilterChange(c.name)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            productCategoryFilter === c.name 
              ? 'bg-gray-900 text-white shadow-md' 
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
          }`}
        >
          {c.name}
        </button>
      ))}
    </div>

    {isLoading ? (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 size={40} className="animate-spin text-indigo-500 mb-4" />
          <p className="text-gray-500 font-medium">正在加载商品数据...</p>
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
  </div>
);

export default ProductsPanel;
