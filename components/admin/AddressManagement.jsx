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
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col items-start md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">地址管理</h2>
          <p className="text-sm text-gray-500 mt-1">管理配送地址、楼栋和代理分配，让配送更高效精准</p>
        </div>
        <button 
          onClick={loadAddresses} 
          className="inline-flex self-start md:self-auto items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:text-gray-900 bg-white border border-gray-200 hover:bg-gray-50 transition-all active:scale-95 shadow-sm"
        >
          <i className="fas fa-sync-alt text-xs"></i>
          刷新数据
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex items-center gap-4 transition-transform hover:scale-[1.02]">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center text-xl">
            <i className="fas fa-map-marker-alt"></i>
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900">{addresses.length}</div>
            <div className="text-sm text-gray-500">配送地址</div>
          </div>
        </div>
        
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex items-center gap-4 transition-transform hover:scale-[1.02]">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center text-xl">
            <i className="fas fa-building"></i>
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900">
              {Object.values(buildingsByAddress).reduce((total, buildings) => total + buildings.length, 0)}
            </div>
            <div className="text-sm text-gray-500">配送楼栋</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex items-center gap-4 transition-transform hover:scale-[1.02]">
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center text-xl">
            <i className="fas fa-user-tie"></i>
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900">{agents.length}</div>
            <div className="text-sm text-gray-500">在职代理</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex items-center gap-4 transition-transform hover:scale-[1.02]">
          <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center text-xl">
            <i className="fas fa-users"></i>
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900">
              {Object.values(buildingsByAddress).reduce((total, buildings) => 
                total + buildings.filter(b => {
                  return agents.some(agent => 
                    (agent.buildings || []).some(ab => ab.building_id === b.id)
                  );
                }).length, 0
              )}
            </div>
            <div className="text-sm text-gray-500">已分配楼栋</div>
          </div>
        </div>
      </div>

      {/* Quick Add Address */}
      <div className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-gray-200/60">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 flex-shrink-0 bg-gray-900 text-white rounded-xl flex items-center justify-center shadow-md">
            <i className="fas fa-plus text-sm"></i>
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-gray-900">快速添加配送地址</h3>
            <p className="text-xs text-gray-500 mt-0.5">输入园区名称后，您可以为其添加具体楼栋</p>
          </div>
        </div>
        <div className="flex items-end gap-3 md:gap-4">
          <div className="flex-1 min-w-0">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
              地址名称 <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <i className="fas fa-map-marked-alt absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
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
                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm h-[46px]"
              />
            </div>
          </div>
          <div className="flex-shrink-0">
            {/* Desktop: Text button */}
            <button
              onClick={handleAddAddress}
              disabled={addrSubmitting || !newAddrName.trim()}
              className="hidden md:flex h-[46px] px-6 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-gray-200 items-center justify-center gap-2 whitespace-nowrap active:scale-95"
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
            {/* Mobile: Circular plus icon */}
            <button
              onClick={handleAddAddress}
              disabled={addrSubmitting || !newAddrName.trim()}
              className="md:hidden w-[46px] h-[46px] flex-shrink-0 bg-gray-900 text-white rounded-full font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-gray-200 flex items-center justify-center active:scale-95"
            >
              {addrSubmitting ? (
                <i className="fas fa-spinner animate-spin text-base"></i>
              ) : (
                <i className="fas fa-plus text-base"></i>
              )}
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2 items-center gap-1.5 hidden md:flex">
          <i className="fas fa-keyboard"></i>
          按 Enter 键快速添加
        </p>
      </div>

      {/* Address List */}
      {addrLoading ? (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mb-4"></div>
          <p className="text-gray-500 text-sm">正在加载地址信息...</p>
        </div>
      ) : addresses.length === 0 ? (
        <div className="text-center py-24 bg-white rounded-3xl border border-dashed border-gray-200">
          <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <i className="fas fa-map-marker-alt text-gray-300 text-3xl"></i>
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">暂无配送地址</h3>
          <p className="text-gray-500 text-sm mb-6">请在上方添加第一个配送地址开始管理</p>
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
                className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-all duration-300 group h-fit flex flex-col"
                draggable
                onDragStart={() => onAddressDragStart(addr.id)}
                onDragOver={(e) => onAddressDragOver(e, addr.id)}
                onDragEnd={onAddressDragEnd}
              >
                {/* Card Header */}
                <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between group-hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="cursor-move text-gray-300 hover:text-gray-500 transition-colors">
                      <i className="fas fa-grip-vertical"></i>
                    </div>
                    <div className="flex-1 min-w-0">
                      <input
                        type="text"
                        defaultValue={addr.name}
                        onBlur={(e) => {
                          const val = e.target.value.trim();
                          if (val && val !== addr.name) {
                            handleUpdateAddress(addr, { name: val });
                          }
                        }}
                        className="bg-transparent border-none text-base font-bold text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-0 p-0 w-full truncate"
                      />
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-gray-500 bg-white px-1.5 py-0.5 rounded border border-gray-200">
                          {totalBuildings} 楼栋
                        </span>
                        <span className="text-xs text-gray-500 bg-white px-1.5 py-0.5 rounded border border-gray-200">
                          {assignedBuildings} 已分配
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer"
                        checked={!!addr.enabled}
                        onChange={(e) => handleUpdateAddress(addr, { enabled: e.target.checked })}
                      />
                      <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                    <button
                      onClick={() => handleDeleteAddress(addr)}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                      title="删除地址"
                    >
                      <i className="fas fa-trash text-xs"></i>
                    </button>
                  </div>
                </div>

                {/* Building List */}
                <div className="p-4 bg-white flex-1 flex flex-col">
                  {buildings.length === 0 ? (
                    <div className="text-center py-8 border-2 border-dashed border-gray-100 rounded-xl mb-4">
                      <p className="text-gray-400 text-xs">暂无楼栋，请添加</p>
                    </div>
                  ) : (
                    <div className="space-y-2 mb-4 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                      {buildings.map((bld) => {
                        const assignedAgent = agents.find(agent => 
                          (agent.buildings || []).some(ab => ab.building_id === bld.id)
                        );
                        
                        return (
                          <div
                            key={bld.id}
                            className="bg-white border border-gray-100 rounded-xl p-3 hover:border-blue-200 hover:shadow-sm transition-all duration-200 group/building"
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
                            <div className="flex items-center gap-3 mb-2">
                              <div className="cursor-move text-gray-300 hover:text-gray-500 opacity-0 group-hover/building:opacity-100 transition-opacity">
                                <i className="fas fa-grip-vertical text-xs"></i>
                              </div>
                              <div className="w-6 h-6 bg-gray-100 rounded-md flex items-center justify-center text-gray-500 text-xs font-bold">
                                <i className="fas fa-building"></i>
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
                                className="flex-1 font-medium text-gray-900 bg-transparent border-none focus:outline-none focus:ring-0 p-0 text-sm"
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
                                className="opacity-0 group-hover/building:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-colors"
                              >
                                <i className="fas fa-trash text-xs"></i>
                              </button>
                            </div>
                            
                            <div className="flex items-center justify-between pl-9">
                              {assignedAgent ? (
                                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded text-[10px] border border-emerald-100">
                                  <div className="w-1 h-1 bg-emerald-500 rounded-full"></div>
                                  <span className="truncate max-w-[80px]">{assignedAgent.name || assignedAgent.id}</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-gray-50 text-gray-500 rounded text-[10px] border border-gray-100">
                                  <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
                                  <span>未分配</span>
                                </div>
                              )}
                              
                              <label className="flex items-center gap-1.5 text-[10px] text-gray-500 cursor-pointer hover:text-gray-700">
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
                                  className="h-3 w-3 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                />
                                启用
                              </label>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Add Building Input */}
                  <div className="mt-auto">
                    <div className="flex items-center gap-2 p-1 bg-gray-50 rounded-xl border border-gray-200 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
                      <input
                        type="text"
                        placeholder="添加新楼栋..."
                        value={newBldNameMap[addr.id] || ''}
                        onChange={(e) => setNewBldNameMap(prev => ({ ...prev, [addr.id]: e.target.value }))}
                        onKeyPress={(e) => {
                           if (e.key === 'Enter' && (newBldNameMap[addr.id] || '').trim() && !addrSubmitting) {
                             handleAddBuilding(addr.id);
                           }
                        }}
                        className="flex-1 bg-transparent border-none focus:outline-none text-gray-900 placeholder-gray-400 text-sm px-3 py-1.5"
                      />
                      <button
                        onClick={() => handleAddBuilding(addr.id)}
                        disabled={addrSubmitting || !(newBldNameMap[addr.id] || '').trim()}
                        className="px-3 py-1.5 bg-white text-blue-600 rounded-lg text-xs font-medium border border-gray-200 hover:border-blue-200 hover:text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                      >
                        添加
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
