import React from 'react';
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
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-medium text-gray-900">收款码管理</h2>
        <p className="text-sm text-gray-600 mt-1">管理您的收款码，支持多个收款码并可选择启用状态</p>
      </div>

      <div className="mb-4">
        <button
          onClick={() => setModalOpen(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
        >
          添加收款码
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          <p className="mt-2 text-gray-600">加载中...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {paymentQrs.map((qr) => (
            <div key={qr.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
              <div className="mb-3">
                <img
                  src={qr.image_path}
                  alt={qr.name}
                  className="w-full h-48 object-contain bg-gray-50 rounded border"
                />
              </div>
              
              <div className="mb-3">
                {editingQrId === qr.id ? (
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
                    className="font-medium text-gray-900 w-full px-2 py-1 border border-indigo-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    autoFocus
                  />
                ) : (
                  <h3 
                    className="font-medium text-gray-900 cursor-pointer hover:text-indigo-600 transition-colors"
                    onClick={() => handleStartEdit(qr.id, qr.name)}
                    title="点击编辑名称"
                  >
                    {qr.name}
                  </h3>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  创建时间: {new Date(qr.created_at).toLocaleDateString()}
                </p>
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={qr.is_enabled === 1}
                    onChange={(e) => handleUpdateStatus(qr.id, e.target.checked)}
                    disabled={qr.is_enabled === 1 && enabledCount === 1}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-700">启用</span>
                </label>
                
                <button
                  onClick={() => handleDelete(qr.id, qr.name)}
                  className="text-red-600 hover:text-red-800 text-sm"
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {paymentQrs.length === 0 && !loading && (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <i className="fas fa-qrcode text-4xl text-gray-400 mb-4"></i>
          <p className="text-gray-600 mb-4">还没有收款码</p>
          <button
            onClick={() => setModalOpen(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
          >
            添加第一个收款码
          </button>
        </div>
      )}

      {/* 添加收款码弹窗 */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">添加收款码</h3>
              <button
                onClick={() => {
                  setModalOpen(false);
                  setForm({ name: '', file: null });
                  setError('');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  收款码名称
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="例如：微信收款码、支付宝收款码"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  收款码图片
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setForm(prev => ({ ...prev, file: e.target.files[0] }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  支持 JPG、PNG、GIF、WebP 格式
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setModalOpen(false);
                  setForm({ name: '', file: null });
                  setError('');
                }}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
