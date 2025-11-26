import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApi } from '../../hooks/useAuth';

export const PaymentQrPanel = ({ staffPrefix }) => {
  const { apiRequest } = useApi();
  const [paymentQrs, setPaymentQrs] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [form, setForm] = React.useState({ name: '', file: null });
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [editingQrId, setEditingQrId] = React.useState(null);
  const [editingName, setEditingName] = React.useState('');

  const loadPaymentQrs = async () => {
    setLoading(true);
    try {
      const response = await apiRequest(`${staffPrefix}/payment-qrs`);
      setPaymentQrs(response?.data?.payment_qrs || []);
    } catch (e) {
      console.error('加载收款码失败:', e);
      setPaymentQrs([]);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    loadPaymentQrs();
  }, []);

  const handleCreate = async () => {
    if (!form.name.trim()) {
      setError('请输入收款码名称');
      return;
    }
    if (!form.file) {
      setError('请选择收款码图片');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('name', form.name.trim());
      formData.append('file', form.file);

      await apiRequest(`${staffPrefix}/payment-qrs`, {
        method: 'POST',
        body: formData,
      });

      setForm({ name: '', file: null });
      setModalOpen(false);
      loadPaymentQrs();
    } catch (e) {
      setError(e.message || '创建收款码失败');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = async (qrId, isEnabled) => {
    try {
      await apiRequest(`${staffPrefix}/payment-qrs/${qrId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_enabled: isEnabled }),
      });
      loadPaymentQrs();
    } catch (e) {
      alert(e.message || '更新状态失败');
    }
  };

  const handleDelete = async (qrId, qrName) => {
    if (!confirm(`确定要删除收款码"${qrName}"吗？`)) {
      return;
    }
    try {
      await apiRequest(`${staffPrefix}/payment-qrs/${qrId}`, {
        method: 'DELETE',
      });
      loadPaymentQrs();
    } catch (e) {
      alert(e.message || '删除收款码失败');
    }
  };

  const handleStartEdit = (qrId, currentName) => {
    setEditingQrId(qrId);
    setEditingName(currentName);
  };

  const handleSaveEdit = async (qrId) => {
    if (!editingName.trim()) {
      alert('收款码名称不能为空');
      return;
    }
    
    try {
      await apiRequest(`${staffPrefix}/payment-qrs/${qrId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingName.trim() }),
      });
      setEditingQrId(null);
      setEditingName('');
      loadPaymentQrs();
    } catch (e) {
      alert(e.message || '更新收款码名称失败');
    }
  };

  const handleCancelEdit = () => {
    setEditingQrId(null);
    setEditingName('');
  };

  const enabledCount = paymentQrs.filter(qr => qr.is_enabled).length;

  return (
    <div className="font-sans text-gray-900">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-gray-900">收款码管理</h2>
          <p className="text-base text-gray-500 mt-1">管理您的收款码，支持多个收款码并可选择启用状态</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-black text-white font-medium hover:bg-gray-800 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
        >
          <i className="fas fa-plus"></i>
          添加收款码
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-32">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-gray-200 border-t-black mb-4"></div>
          <p className="text-gray-500 font-medium">加载中...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {paymentQrs.map((qr) => (
            <div 
              key={qr.id} 
              className="group bg-white border border-gray-100 rounded-3xl overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col"
            >
              <div className="p-4 flex-1 flex flex-col">
                <div className="relative aspect-[3/4] bg-gray-50 rounded-2xl border border-gray-100 overflow-hidden mb-4 group-hover:border-gray-200 transition-colors">
                  <img
                    src={qr.image_path}
                    alt={qr.name}
                    className="w-full h-full object-contain p-4 transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className={`absolute top-3 right-3 px-2.5 py-1 rounded-full text-xs font-medium backdrop-blur-md border shadow-sm ${
                    qr.is_enabled 
                      ? 'bg-emerald-500/90 text-white border-transparent' 
                      : 'bg-white/80 text-gray-500 border-gray-200'
                  }`}>
                    {qr.is_enabled ? '已启用' : '未启用'}
                  </div>
                </div>
                
                <div className="mb-4">
                  {editingQrId === qr.id ? (
                    <div className="relative">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={() => handleSaveEdit(qr.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleSaveEdit(qr.id);
                          } else if (e.key === 'Escape') {
                            handleCancelEdit();
                          }
                        }}
                        className="w-full font-bold text-lg text-gray-900 px-2 py-1 bg-gray-50 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                        autoFocus
                      />
                      <div className="text-xs text-gray-400 mt-1 px-1">按回车保存，Esc取消</div>
                    </div>
                  ) : (
                    <div className="group/title flex items-center justify-between">
                      <h3 
                        className="font-bold text-lg text-gray-900 truncate pr-2 cursor-pointer hover:text-blue-600 transition-colors"
                        onClick={() => handleStartEdit(qr.id, qr.name)}
                        title="点击编辑名称"
                      >
                        {qr.name}
                      </h3>
                      <button 
                        onClick={() => handleStartEdit(qr.id, qr.name)}
                        className="w-8 h-8 rounded-full bg-gray-50 text-gray-400 hover:bg-blue-50 hover:text-blue-600 flex items-center justify-center opacity-0 group-hover/title:opacity-100 transition-all"
                      >
                        <i className="fas fa-pen text-xs"></i>
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-gray-400 mt-1 font-mono flex items-center gap-1.5">
                    <i className="far fa-clock"></i>
                    {new Date(qr.created_at).toLocaleDateString()}
                  </p>
                </div>

                <div className="mt-auto pt-4 border-t border-gray-50 flex items-center justify-between">
                  <label className="flex items-center gap-3 cursor-pointer group/toggle">
                    <div className={`w-11 h-6 rounded-full p-1 transition-colors duration-300 ${qr.is_enabled ? 'bg-black' : 'bg-gray-200 group-hover/toggle:bg-gray-300'}`}>
                      <div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform duration-300 ${qr.is_enabled ? 'translate-x-5' : 'translate-x-0'}`}></div>
                    </div>
                    <input
                      type="checkbox"
                      checked={qr.is_enabled === 1}
                      onChange={(e) => handleUpdateStatus(qr.id, e.target.checked)}
                      disabled={qr.is_enabled === 1 && enabledCount === 1}
                      className="hidden"
                    />
                    <span className={`text-sm font-medium transition-colors ${qr.is_enabled ? 'text-gray-900' : 'text-gray-500'}`}>
                      {qr.is_enabled ? '启用中' : '已关闭'}
                    </span>
                  </label>
                  
                  <button
                    onClick={() => handleDelete(qr.id, qr.name)}
                    className="w-9 h-9 rounded-full bg-white border border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-100 hover:bg-red-50 flex items-center justify-center transition-all shadow-sm hover:shadow"
                    title="删除收款码"
                  >
                    <i className="fas fa-trash-alt text-sm"></i>
                  </button>
                </div>
              </div>
            </div>
          ))}
          
          {/* 添加卡片 (当列表为空时显示大一点，否则作为最后一个卡片) */}
          {paymentQrs.length > 0 && (
             <button
              onClick={() => setModalOpen(true)}
              className="group bg-gray-50 border-2 border-dashed border-gray-200 rounded-3xl p-6 flex flex-col items-center justify-center min-h-[300px] hover:bg-white hover:border-gray-300 hover:shadow-lg transition-all duration-300"
            >
              <div className="w-16 h-16 bg-white rounded-full shadow-sm border border-gray-100 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                <i className="fas fa-plus text-gray-400 group-hover:text-black text-xl transition-colors"></i>
              </div>
              <span className="text-gray-500 font-medium group-hover:text-gray-900 transition-colors">添加新收款码</span>
            </button>
          )}
        </div>
      )}

      {paymentQrs.length === 0 && !loading && (
        <div className="text-center py-24 bg-gray-50/50 rounded-3xl border border-dashed border-gray-200">
          <div className="w-24 h-24 bg-white rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-sm border border-gray-100">
            <i className="fas fa-qrcode text-gray-300 text-4xl"></i>
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">还没有收款码</h3>
          <p className="text-gray-500 mb-8 max-w-sm mx-auto">添加收款码后，用户在支付时将看到这些二维码。</p>
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 px-8 py-3 rounded-full bg-black text-white font-medium hover:bg-gray-800 transition-all duration-300 shadow-lg hover:shadow-xl"
          >
            <i className="fas fa-plus"></i>
            添加第一个收款码
          </button>
        </div>
      )}

      {/* 添加收款码弹窗 */}
      {/* 添加收款码弹窗 */}
      <AnimatePresence>
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-md"
              onClick={() => {
                setModalOpen(false);
                setForm({ name: '', file: null });
                setError('');
              }}
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
              className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col z-10"
            >
              <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900">添加收款码</h3>
                  <p className="text-sm text-gray-500 mt-1">上传新的收款二维码图片</p>
                </div>
                <button 
                  onClick={() => {
                    setModalOpen(false);
                    setForm({ name: '', file: null });
                    setError('');
                  }}
                  className="w-9 h-9 rounded-full bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-500 transition-all duration-200"
                >
                  <i className="fas fa-times" />
                </button>
              </div>

              <div className="p-8 space-y-6">
                {error && (
                  <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
                    <i className="fas fa-exclamation-circle"></i>
                    <span>{error}</span>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    收款码名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="例如：微信收款码、支付宝收款码"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-400 transition-all duration-200"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    收款码图片 <span className="text-red-500">*</span>
                  </label>
                  <div className="relative group">
                    <input
                      type="file"
                      accept="image/*"
                      id="qr-upload"
                      onChange={(e) => setForm(prev => ({ ...prev, file: e.target.files[0] }))}
                      className="hidden"
                    />
                    <label 
                      htmlFor="qr-upload"
                      className={`flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-200 ${
                        form.file 
                          ? 'border-emerald-300 bg-emerald-50' 
                          : 'border-gray-200 bg-gray-50 hover:bg-gray-100 hover:border-gray-300'
                      }`}
                    >
                      {form.file ? (
                        <div className="text-center">
                          <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-2">
                            <i className="fas fa-check"></i>
                          </div>
                          <p className="text-sm font-medium text-emerald-800">{form.file.name}</p>
                          <p className="text-xs text-emerald-600 mt-1">点击更换图片</p>
                        </div>
                      ) : (
                        <div className="text-center">
                          <div className="w-12 h-12 bg-white text-gray-400 rounded-full flex items-center justify-center mx-auto mb-2 shadow-sm border border-gray-100 group-hover:scale-110 transition-transform">
                            <i className="fas fa-cloud-upload-alt text-lg"></i>
                          </div>
                          <p className="text-sm font-medium text-gray-600">点击上传图片</p>
                          <p className="text-xs text-gray-400 mt-1">支持 JPG, PNG, GIF, WebP</p>
                        </div>
                      )}
                    </label>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100 bg-white px-8 py-5 flex items-center justify-end gap-3 sticky bottom-0 z-10">
                <button
                  onClick={() => {
                    setModalOpen(false);
                    setForm({ name: '', file: null });
                    setError('');
                  }}
                  className="px-6 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-full hover:bg-gray-50 transition-all duration-200"
                >
                  取消
                </button>
                <button
                  onClick={handleCreate}
                  disabled={saving}
                  className="px-8 py-2.5 text-sm font-medium bg-black text-white rounded-full hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl flex items-center gap-2"
                >
                  {saving ? (
                    <>
                      <i className="fas fa-spinner animate-spin"></i>
                      创建中...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-check"></i>
                      立即创建
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
