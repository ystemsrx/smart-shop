import React, { useEffect, useRef, useState } from 'react';

export const AutoGiftModal = ({ open, onClose, onSave, initialItems, apiRequest }) => {
  const [selectedItems, setSelectedItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimerRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setSelectedItems([]);
      setSearchResults([]);
      setSearchTerm('');
      return;
    }
    setSelectedItems((initialItems || []).map(item => ({ ...item })));
    setSearchResults([]);
    setSearchTerm('');
  }, [open, initialItems]);

  useEffect(() => {
    if (!open) return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const term = (searchTerm || '').trim();
    searchTimerRef.current = setTimeout(async () => {
      try {
        setSearchLoading(true);
        const res = await apiRequest(`/admin/auto-gifts/search${term ? `?query=${encodeURIComponent(term)}` : ''}`);
        setSearchResults(res?.data?.items || []);
      } catch (e) {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 250);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchTerm, open, apiRequest]);

  const keyOf = (item) => `${item.product_id}__${item.variant_id || 'base'}`;

  const handleAdd = (item) => {
    const key = keyOf(item);
    if (selectedItems.some((it) => keyOf(it) === key)) {
      return;
    }
    setSelectedItems(prev => [...prev, { ...item }]);
  };

  const handleRemove = (productId, variantId) => {
    setSelectedItems(prev => prev.filter(it => !(it.product_id === productId && (it.variant_id || null) === (variantId || null))));
  };

  const handleSubmit = () => {
    onSave(selectedItems.map(it => ({ product_id: it.product_id, variant_id: it.variant_id })));
  };

  return (
    <div className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none opacity-0'} flex items-center justify-center bg-black/40 transition-opacity`}>
      <div className="absolute inset-0" onClick={onClose}></div>
      <div className={`relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4 overflow-hidden transform transition-all ${open ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}>
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">编辑满额赠品池</h3>
            <p className="text-sm text-gray-500">可选择多个商品或规格，系统优先赠送库存最多的商品。</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600">
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="text-sm font-medium text-gray-700">已选择的赠品</label>
            {selectedItems.length === 0 ? (
              <div className="mt-2 text-xs text-gray-500 border border-dashed border-gray-300 rounded-md px-3 py-4 text-center">
                尚未选择任何商品，使用下方搜索框添加。
              </div>
            ) : (
              <div className="mt-2 grid gap-2">
                {selectedItems.map(item => {
                  const label = item.variant_name ? `${item.product_name || '商品'} - ${item.variant_name}` : (item.product_name || '商品');
                  const stock = Number.isFinite(item.stock) ? item.stock : '--';
                  return (
                    <div key={keyOf(item)} className="px-3 py-2 rounded-md border border-gray-200 bg-gray-50 flex items-center justify-between">
                      <div className="text-xs">
                        <div className="font-medium">{label}</div>
                        <div className="mt-1 text-[11px] text-gray-500 flex items-center gap-3">
                          <span>库存：{stock}</span>
                          <span>价值：¥{Number.isFinite(item.retail_price) ? Number(item.retail_price).toFixed(2) : '--'}</span>
                        </div>
                      </div>
                      <button onClick={() => handleRemove(item.product_id, item.variant_id)} className="text-xs text-red-600 hover:text-red-800">移除</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">搜索商品并添加</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="输入商品名称或类别关键字"
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
            />
            <div className="mt-2 border border-gray-200 rounded-md max-h-48 overflow-y-auto">
              {searchLoading ? (
                <div className="px-3 py-2 text-xs text-gray-500">搜索中...</div>
              ) : (searchResults || []).length === 0 ? (
                <div className="px-3 py-2 text-xs text-gray-500">未找到匹配的商品</div>
              ) : (
                searchResults.map(item => {
                  const key = keyOf(item);
                  const alreadySelected = selectedItems.some(it => keyOf(it) === key);
                  const label = item.variant_name ? `${item.product_name || '商品'} - ${item.variant_name}` : (item.product_name || '商品');
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleAdd(item)}
                      disabled={alreadySelected}
                      className={`w-full text-left px-3 py-2 text-sm border-b border-gray-100 last:border-b-0 ${alreadySelected ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'hover:bg-indigo-50'}`}
                    >
                      <div className="font-medium text-gray-800 flex items-center gap-2">
                        <span>{label}</span>
                        {alreadySelected && <span className="text-xs text-gray-500">已添加</span>}
                      </div>
                      <div className="text-[11px] text-gray-500 flex items-center gap-3 mt-1">
                        <span>库存：{item.stock}</span>
                        <span>价值：¥{Number.isFinite(item.retail_price) ? Number(item.retail_price).toFixed(2) : '--'}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-100">取消</button>
          <button onClick={handleSubmit} className="px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700">保存</button>
        </div>
      </div>
    </div>
  );
};

export default AutoGiftModal;
