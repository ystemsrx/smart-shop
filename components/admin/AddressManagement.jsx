import React from 'react';

export const AddressManagement = ({
  addresses,
  agents,
  buildingsByAddress,
  apiRequest,
  addrLoading,
  addrSubmitting,
  newAddrName,
  setNewAddrName,
  newBldNameMap,
  setNewBldNameMap,
  bldDragState,
  setBldDragState,
  loadAddresses,
  handleAddAddress,
  handleUpdateAddress,
  handleDeleteAddress,
  handleAddBuilding,
  onAddressDragStart,
  onAddressDragOver,
  onAddressDragEnd,
  setBuildingsByAddress,
}) => {
  return (
    <>
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold bg-gradient-to-r from-gray-900 via-blue-800 to-purple-800 bg-clip-text text-transparent">
              智能地址管理
            </h2>
            <p className="text-sm text-gray-600 mt-2">管理配送地址、楼栋和代理分配，让配送更高效精准</p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={loadAddresses} 
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-blue-600 hover:text-blue-700 bg-blue-50/50 hover:bg-blue-100/50 border border-blue-200/50 hover:border-blue-300/50 transition-all duration-300"
            >
              <i className="fas fa-sync-alt text-xs"></i>
              刷新数据
            </button>
          </div>
        </div>
        <div className="mt-4 w-20 h-1 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full"></div>
      </div>

      {/* 快速统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-gradient-to-br from-blue-50 to-indigo-100 rounded-2xl p-6 border border-blue-200/50">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
              <i className="fas fa-map-marker-alt text-white text-lg"></i>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-700">{addresses.length}</div>
              <div className="text-sm text-blue-600">配送地址</div>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-emerald-50 to-teal-100 rounded-2xl p-6 border border-emerald-200/50">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center">
              <i className="fas fa-building text-white text-lg"></i>
            </div>
            <div>
              <div className="text-2xl font-bold text-emerald-700">
                {Object.values(buildingsByAddress).reduce((total, buildings) => total + buildings.length, 0)}
              </div>
              <div className="text-sm text-emerald-600">配送楼栋</div>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-orange-100 rounded-2xl p-6 border border-amber-200/50">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl flex items-center justify-center">
              <i className="fas fa-user-tie text-white text-lg"></i>
            </div>
            <div>
              <div className="text-2xl font-bold text-amber-700">{agents.length}</div>
              <div className="text-sm text-amber-600">在职代理</div>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-purple-50 to-violet-100 rounded-2xl p-6 border border-purple-200/50">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center">
              <i className="fas fa-users text-white text-lg"></i>
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-700">
                {Object.values(buildingsByAddress).reduce((total, buildings) => 
                  total + buildings.filter(b => {
                    return agents.some(agent => 
                      (agent.buildings || []).some(ab => ab.building_id === b.id)
                    );
                  }).length, 0
                )}
              </div>
              <div className="text-sm text-purple-600">已分配楼栋</div>
            </div>
          </div>
        </div>
      </div>

      {/* 快速添加地址 */}
      <div className="bg-gradient-to-br from-white via-blue-50/30 to-indigo-50/40 rounded-2xl p-8 shadow-lg border border-blue-200/50 mb-8 hover:shadow-xl transition-all duration-300">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
            <i className="fas fa-plus text-white text-lg"></i>
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">快速添加配送地址</h3>
            <p className="text-xs text-gray-500 mt-0.5">输入园区名称后，您可以为其添加具体楼栋</p>
          </div>
        </div>
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <label className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <i className="fas fa-map-marked-alt text-gray-400 text-xs"></i>
              地址名称
              <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={newAddrName}
              onChange={(e) => setNewAddrName(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && newAddrName.trim() && !addrSubmitting) {
                  handleAddAddress();
                }
              }}
              placeholder="例如：东校区、西校区、南园等"
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 text-sm"
            />
            <p className="text-xs text-gray-500 mt-2 flex items-center gap-1.5">
              <i className="fas fa-info-circle"></i>
              按 Enter 键快速添加
            </p>
          </div>
          <div className="flex-shrink-0" style={{ paddingTop: '28px' }}>
            <button
              onClick={handleAddAddress}
              disabled={addrSubmitting || !newAddrName.trim()}
              className="h-[46px] px-6 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-semibold hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center gap-2 whitespace-nowrap"
            >
              {addrSubmitting ? (
                <>
                  <i className="fas fa-spinner animate-spin"></i>
                  添加中...
                </>
              ) : (
                <>
                  <i className="fas fa-plus"></i>
                  添加
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 地址列表 */}
      {addrLoading ? (
        <div className="flex items-center justify-center py-24">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-6"></div>
            <p className="text-lg font-medium text-gray-700">正在加载地址信息...</p>
            <p className="text-sm text-gray-500 mt-2">请稍候</p>
          </div>
        </div>
      ) : addresses.length === 0 ? (
        <div className="text-center py-24">
          <div className="w-24 h-24 bg-gradient-to-br from-blue-100 to-indigo-200 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg">
            <i className="fas fa-map-marker-alt text-blue-400 text-3xl"></i>
          </div>
          <h3 className="text-xl font-bold text-gray-700 mb-3">暂无配送地址</h3>
          <p className="text-gray-500 mb-2">请在上方添加第一个配送地址开始管理</p>
          <p className="text-sm text-gray-400 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 inline-block mt-4">
            <i className="fas fa-lightbulb text-amber-500 mr-2"></i>
            提示：用户只能看到有具体楼栋的园区地址
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {addresses.map((addr, index) => {
            const buildings = buildingsByAddress[addr.id] || [];
            const totalBuildings = buildings.length;
            const assignedBuildings = buildings.filter(b => 
              agents.some(agent => 
                (agent.buildings || []).some(ab => ab.building_id === b.id)
              )
            ).length;
            
            return (
              <div 
                key={addr.id} 
                className="bg-white rounded-2xl shadow-sm border border-gray-200/50 overflow-hidden hover:shadow-md transition-all duration-300 group h-fit"
                draggable
                onDragStart={() => onAddressDragStart(addr.id)}
                onDragOver={(e) => onAddressDragOver(e, addr.id)}
                onDragEnd={onAddressDragEnd}
              >
                {/* 地址头部 */}
                <div className={`p-4 bg-gradient-to-r ${
                  index % 4 === 0 ? 'from-blue-500 to-blue-600' :
                  index % 4 === 1 ? 'from-emerald-500 to-emerald-600' :
                  index % 4 === 2 ? 'from-amber-500 to-amber-600' :
                  'from-purple-500 to-purple-600'
                }`}>
                  <div className="flex items-center justify-between text-white">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-6 bg-white/30 rounded-full cursor-move opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <div className="w-full h-full flex items-center justify-center">
                          <i className="fas fa-grip-vertical text-white/70 text-xs"></i>
                        </div>
                      </div>
                      <div>
                        <input
                          type="text"
                          defaultValue={addr.name}
                          onBlur={(e) => {
                            const val = e.target.value.trim();
                            if (val && val !== addr.name) {
                              handleUpdateAddress(addr, { name: val });
                            }
                          }}
                          className="bg-transparent border-none text-lg font-bold text-white placeholder-white/70 focus:outline-none focus:ring-2 focus:ring-white/30 rounded-lg px-2 py-1 w-full"
                        />
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-white/90 text-xs">
                            {totalBuildings} 楼栋
                          </span>
                          <span className="text-white/90 text-xs">
                            {assignedBuildings} 已分配
                          </span>
                          <div className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              defaultChecked={!!addr.enabled}
                              onChange={(e) => handleUpdateAddress(addr, { enabled: e.target.checked })}
                              className="h-3 w-3 text-white border-white/30 rounded"
                            />
                            <span className="text-white/90 text-xs">启用</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteAddress(addr)}
                      className="p-1.5 hover:bg-white/20 rounded-lg transition-colors duration-200 opacity-0 group-hover:opacity-100"
                      title="删除地址"
                    >
                      <i className="fas fa-trash text-white/80 hover:text-white text-xs"></i>
                    </button>
                  </div>
                </div>

                {/* 楼栋列表 */}
                <div className="p-4">
                  {buildings.length === 0 ? (
                    <div className="text-center py-8">
                      <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                        <i className="fas fa-building text-gray-400 text-xl"></i>
                      </div>
                      <p className="text-gray-600 text-sm font-medium mb-1">该地址下暂无楼栋</p>
                      <p className="text-gray-400 text-xs">请在下方添加具体楼栋信息</p>
                    </div>
                  ) : (
                    <div className="space-y-3 mb-4">
                      {buildings.map((bld) => {
                        const assignedAgent = agents.find(agent => 
                          (agent.buildings || []).some(ab => ab.building_id === bld.id)
                        );
                        
                        return (
                          <div
                            key={bld.id}
                            className="bg-gray-50 rounded-xl p-3 hover:bg-gray-100/70 transition-all duration-200 group/building"
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
                                try {
                                  const r = await apiRequest(`/admin/buildings?address_id=${encodeURIComponent(addr.id)}`);
                                  setBuildingsByAddress(prev => ({ ...prev, [addr.id]: r.data.buildings || [] }));
                                } catch {}
                              }
                            }}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-1 h-4 bg-gray-300 rounded-full opacity-0 group-hover/building:opacity-100 transition-opacity duration-200 cursor-move">
                                <div className="w-full h-full flex items-center justify-center">
                                  <i className="fas fa-grip-vertical text-gray-400 text-xs"></i>
                                </div>
                              </div>
                              <div className="w-5 h-5 bg-gray-400 rounded flex items-center justify-center">
                                <i className="fas fa-building text-white text-xs"></i>
                              </div>
                              <input
                                type="text"
                                defaultValue={bld.name}
                                onBlur={async (e) => {
                                  const val = e.target.value.trim();
                                  if (val && val !== bld.name) {
                                    try {
                                      await apiRequest(`/admin/buildings/${bld.id}`, { 
                                        method: 'PUT', 
                                        body: JSON.stringify({ name: val }) 
                                      });
                                      setBuildingsByAddress(prev => ({
                                        ...prev,
                                        [addr.id]: (prev[addr.id] || []).map(x => x.id === bld.id ? { ...x, name: val } : x)
                                      }));
                                    } catch (e) {
                                      alert(e.message || '更新失败');
                                    }
                                  }
                                }}
                                className="flex-1 font-medium text-gray-900 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 rounded px-1 py-0.5 text-sm"
                              />
                              <button
                                onClick={async () => {
                                  if (!confirm(`确定删除楼栋\"${bld.name}\"吗？`)) return;
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
                                className="opacity-0 group-hover/building:opacity-100 p-1 hover:bg-red-100 text-red-500 hover:text-red-600 rounded transition-all duration-200"
                              >
                                <i className="fas fa-trash text-xs"></i>
                              </button>
                            </div>
                            
                            {/* 代理分配信息和启用状态 */}
                            <div className="flex items-center gap-2">
                              {/* 代理分配状态 */}
                              <div className="flex-1">
                                {assignedAgent ? (
                                  <div className="flex items-center gap-2 px-2 py-1 bg-emerald-50 border border-emerald-200 rounded-lg">
                                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
                                    <span className="text-xs font-medium text-emerald-700 truncate flex-1">
                                      {assignedAgent.name || assignedAgent.id}
                                    </span>
                                    <span className="text-xs text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded">
                                      负责中
                                    </span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 px-2 py-1 bg-amber-50 border border-amber-200 rounded-lg">
                                    <div className="w-1.5 h-1.5 bg-amber-500 rounded-full"></div>
                                    <span className="text-xs font-medium text-amber-700">未分配代理</span>
                                    <span className="text-xs text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded ml-auto">
                                      待分配
                                    </span>
                                  </div>
                                )}
                              </div>
                              
                              {/* 启用状态 - 移到右边 */}
                              <div className="flex items-center">
                                <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    defaultChecked={!!bld.enabled}
                                    onChange={async (e) => {
                                      try {
                                        await apiRequest(`/admin/buildings/${bld.id}`, { 
                                          method: 'PUT', 
                                          body: JSON.stringify({ enabled: e.target.checked }) 
                                        });
                                        setBuildingsByAddress(prev => ({
                                          ...prev,
                                          [addr.id]: (prev[addr.id] || []).map(x => x.id === bld.id ? { ...x, enabled: e.target.checked ? 1 : 0 } : x)
                                        }));
                                      } catch (er) {
                                        alert(er.message || '更新失败');
                                      }
                                    }}
                                    className="h-3 w-3 text-blue-600 border-gray-300 rounded"
                                  />
                                  <span>启用</span>
                                </label>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* 添加楼栋 */}
                  <div className="flex items-center gap-2 p-3 bg-gray-50/70 border-2 border-dashed border-gray-300 rounded-xl hover:bg-gray-50 hover:border-gray-400 transition-all duration-200">
                    <div className="w-5 h-5 bg-gray-300 rounded flex items-center justify-center">
                      <i className="fas fa-plus text-white text-xs"></i>
                    </div>
                    <input
                      type="text"
                      placeholder="添加楼栋..."
                      value={newBldNameMap[addr.id] || ''}
                      onChange={(e) => setNewBldNameMap(prev => ({ ...prev, [addr.id]: e.target.value }))}
                      className="flex-1 bg-transparent border-none focus:outline-none text-gray-700 placeholder-gray-500 text-sm"
                    />
                    <button
                      onClick={() => handleAddBuilding(addr.id)}
                      disabled={addrSubmitting || !(newBldNameMap[addr.id] || '').trim()}
                      className="px-3 py-1 bg-blue-500 text-white rounded-lg text-xs font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                    >
                      添加
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
};
