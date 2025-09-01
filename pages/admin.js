import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth, useApi } from '../hooks/useAuth';
import { useRouter } from 'next/router';
import RetryImage from '../components/RetryImage';

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
const ProductTable = ({ products, onRefresh, onEdit, onDelete, onUpdateStock, onBatchDelete, selectedProducts, onSelectProduct, onSelectAll }) => {
  const isAllSelected = products.length > 0 && selectedProducts.length === products.length;
  const isPartiallySelected = selectedProducts.length > 0 && selectedProducts.length < products.length;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
        <h3 className="text-lg font-medium text-gray-900">商品列表</h3>
        {selectedProducts.length > 0 && (
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-600">已选择 {selectedProducts.length} 件商品</span>
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
                价格
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
                      {product.img_path ? (
                        <RetryImage
                          className="h-10 w-10 rounded-md object-cover"
                          src={`http://localhost:8000/${product.img_path}`}
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
                  ¥{product.price}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  <StockControl 
                    product={product} 
                    onUpdateStock={(productId, newStock) => onUpdateStock(productId, newStock)}
                  />
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
        setCategories(response.data.categories || []);
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

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    setImageFile(file);
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
const OrderTable = ({ orders, onUpdateUnifiedStatus, isLoading }) => {
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

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('zh-CN');
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">订单列表</h3>
      </div>
      
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
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
              <tr key={order.id} className="hover:bg-gray-50">
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
                  {order.items?.length || 0} 件
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  ¥{order.total_amount}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {getStatusBadge(getUnifiedStatus(order))}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatDate(order.created_at)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
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
                </td>
              </tr>
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

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    setImageFile(file);
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
  
  // 订单管理相关状态
  const [orders, setOrders] = useState([]);
  const [orderStats, setOrderStats] = useState({
    total_orders: 0,
    status_counts: {},
    today_orders: 0,
    total_revenue: 0
  });
  const [orderStatusFilter, setOrderStatusFilter] = useState('全部'); // 全部/未付款/待确认/待配送/配送中/已完成
  const [activeTab, setActiveTab] = useState('products'); // products, orders

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
      const [statsData, productsData, categoriesData, ordersData] = await Promise.all([
        apiRequest('/admin/stats'),
        apiRequest('/products'),
        apiRequest('/admin/categories'),
        apiRequest('/admin/orders')
      ]);
      
      setStats(statsData.data);
      setProducts(productsData.data.products || []);
      setCategories(categoriesData.data.categories || []);
      setOrders(ordersData.data.orders || []);
      setOrderStats(ordersData.data.stats || {
        total_orders: 0,
        status_counts: {},
        today_orders: 0,
        total_revenue: 0
      });
      setSelectedProducts([]); // 重新加载数据时清空选择
    } catch (err) {
      setError(err.message || '加载数据失败');
    } finally {
      setIsLoading(false);
    }
  };

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
        
        // 这里需要实现图片更新的API
        // await apiRequest(`/admin/products/${editingProduct.id}/image`, {
        //   method: 'PUT',
        //   body: formData,
        //   headers: {}
        // });
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

  // 更新库存（内联版本）
  const handleUpdateStock = async (productId, newStock) => {
    try {
      await apiRequest(`/admin/products/${productId}/stock`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
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

  // 全选/取消全选
  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedProducts(products.map(product => product.id));
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

  return (
    <>
      <Head>
        <title>管理后台 - 宿舍智能小商城</title>
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



          {/* 错误提示 */}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* 统计卡片 */}
          {!isLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
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
              products={products} 
              onRefresh={loadData}
              onEdit={setEditingProduct}
              onDelete={handleDeleteProduct}
              onUpdateStock={handleUpdateStock}
              onBatchDelete={handleBatchDelete}
              selectedProducts={selectedProducts}
              onSelectProduct={handleSelectProduct}
              onSelectAll={handleSelectAll}
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
                  />
                </>
              )}
            </>
          )}

        </main>
      </div>
    </>
  );
}
