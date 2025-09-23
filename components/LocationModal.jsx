import React from 'react';

export default function LocationModal({
  isOpen,
  forceSelection,
  addresses,
  selectedAddressId,
  onSelectAddress,
  buildingOptions,
  selectedBuildingId,
  onSelectBuilding,
  onConfirm,
  onClose,
  isLoading,
  isSaving,
  error,
}) {
  if (!isOpen) return null;

  const disableConfirm = isSaving || !selectedAddressId || !selectedBuildingId;
  const confirmClasses = [
    'px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-lg transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500',
    disableConfirm ? 'bg-indigo-300 cursor-not-allowed' : 'bg-gradient-to-r from-indigo-500 to-emerald-500 hover:shadow-xl hover:scale-[1.02]'
  ].join(' ');

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg">
        <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-blue-500/30 via-violet-500/30 to-pink-500/30 blur-3xl"></div>
        <div className="relative bg-white/95 backdrop-blur-xl border border-white/40 rounded-3xl shadow-2xl overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                <span className="flex items-center justify-center w-9 h-9 rounded-full bg-indigo-100 text-indigo-600">
                  <i className="fas fa-location-dot"></i>
                </span>
                请选择配送地址
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {forceSelection ? '为确保商品正确配送，请先选择园区与楼栋。' : '切换地址会清空购物车，并自动跳转至对应园区的商品。'}
              </p>
            </div>
            {!forceSelection && (
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="关闭"
              >
                <i className="fas fa-times"></i>
              </button>
            )}
          </div>

          <div className="px-6 py-6 space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-2xl text-sm flex items-start gap-2">
                <i className="fas fa-exclamation-triangle mt-0.5"></i>
                <span>{error}</span>
              </div>
            )}

            {isLoading ? (
              <div className="flex items-center justify-center py-10 text-gray-500">
                <div className="animate-spin h-6 w-6 border-2 border-indigo-400 border-t-transparent rounded-full mr-3"></div>
                正在加载可选地址...
              </div>
            ) : (
              <>
                {(!addresses || addresses.length === 0) ? (
                  <div className="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-6 rounded-2xl text-center">
                    <i className="fas fa-exclamation-triangle text-2xl mb-2"></i>
                    <p className="font-medium mb-1">暂无可选择的配送地址</p>
                    <p className="text-sm text-amber-600">请联系管理员</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                        <i className="fas fa-tree-city text-emerald-500"></i>
                        请选择园区
                      </label>
                      <div className="relative">
                        <select
                          value={selectedAddressId}
                          onChange={(e) => onSelectAddress(e.target.value)}
                          className="w-full appearance-none px-4 py-3 rounded-2xl border border-gray-200 bg-white text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                        >
                          <option value="" disabled>请选择所在园区</option>
                          {addresses.map(addr => (
                            <option key={addr.id} value={addr.id}>{addr.name}</option>
                          ))}
                        </select>
                        <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                      <i className="fas fa-chevron-down"></i>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                    <i className="fas fa-building-circle-check text-indigo-500"></i>
                    请选择楼栋
                  </label>
                  <div className="relative">
                    <select
                      value={selectedBuildingId}
                      onChange={(e) => onSelectBuilding(e.target.value)}
                      className="w-full appearance-none px-4 py-3 rounded-2xl border border-gray-200 bg-white text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    >
                      <option value="" disabled>请选择所在楼栋</option>
                      {(buildingOptions || []).map(bld => (
                        <option key={bld.id} value={bld.id}>{bld.name}</option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                      <i className="fas fa-chevron-down"></i>
                    </div>
                  </div>
                </div>

                    <div className="text-xs text-gray-500 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 flex items-start gap-2">
                      <i className="fas fa-info-circle text-amber-500 mt-0.5"></i>
                      <span>切换地址后，系统会自动清空当前购物车并展示对应园区的商品，请重新添加所需商品。</span>
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/60 flex items-center justify-between">
            <div className="text-xs text-gray-400">
              {forceSelection ? '当前账号尚未绑定地址，请先完成选择。' : '确认后立即生效。'}
            </div>
            <div className="flex items-center gap-3">
              {!forceSelection && (
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-white transition-colors"
                >
                  取消
                </button>
              )}
              <button
                onClick={onConfirm}
                disabled={disableConfirm}
                className={confirmClasses}
              >
                {isSaving ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                    保存中...
                  </div>
                ) : (
                  '确定'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
