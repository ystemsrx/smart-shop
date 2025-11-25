import React from 'react';

export const AgentManagement = ({
  agents,
  deletedAgents,
  agentError,
  agentLoading,
  agentModalOpen,
  showDeletedAgentsModal,
  editingAgent,
  agentForm,
  agentSaving,
  addresses,
  buildingsByAddress,
  buildingLabelMap,
  loadAgents,
  openAgentModal,
  closeAgentModal,
  toggleAgentBuilding,
  setAgentForm,
  handleAgentSave,
  handleAgentStatusToggle,
  handleAgentDelete,
  setShowDeletedAgentsModal,
}) => {
  return (
    <div className="space-y-6">
      {/* 页面标题和操作 */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold bg-gradient-to-r from-gray-900 via-indigo-800 to-purple-800 bg-clip-text text-transparent">
              代理管理系统
            </h2>
            <p className="text-sm text-gray-600 mt-2">创建代理账号并绑定负责的楼栋，系统将自动分配订单与商品管理权限</p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={loadAgents} 
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100/50 border border-indigo-200/50 hover:border-indigo-300/50 transition-all duration-300"
            >
              <i className="fas fa-sync-alt text-xs"></i>
              刷新数据
            </button>
            <button
              onClick={() => openAgentModal(null)}
              className="inline-flex items-center gap-2 px-6 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 text-white font-medium hover:from-indigo-600 hover:to-indigo-700 transition-all duration-300 shadow-lg hover:shadow-xl"
            >
              <i className="fas fa-user-plus"></i>
              新增代理
            </button>
          </div>
        </div>
        <div className="mt-4 w-20 h-1 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full"></div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
        <div className="bg-gradient-to-br from-indigo-50 to-blue-100 rounded-2xl p-6 border border-indigo-200/50 hover:shadow-lg transition-all duration-300">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
              <i className="fas fa-users text-white text-lg"></i>
            </div>
            <div>
              <div className="text-2xl font-bold text-indigo-700">{agents.length}</div>
              <div className="text-sm text-indigo-600">代理总数</div>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-emerald-50 to-teal-100 rounded-2xl p-6 border border-emerald-200/50 hover:shadow-lg transition-all duration-300">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg">
              <i className="fas fa-user-check text-white text-lg"></i>
            </div>
            <div>
              <div className="text-2xl font-bold text-emerald-700">
                {agents.filter(a => a.is_active !== false).length}
              </div>
              <div className="text-sm text-emerald-600">在职代理</div>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-orange-100 rounded-2xl p-6 border border-amber-200/50 hover:shadow-lg transition-all duration-300">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl flex items-center justify-center shadow-lg">
              <i className="fas fa-building text-white text-lg"></i>
            </div>
            <div>
              <div className="text-2xl font-bold text-amber-700">
                {agents.reduce((sum, agent) => sum + (agent.buildings || []).length, 0)}
              </div>
              <div className="text-sm text-amber-600">负责楼栋</div>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-red-50 to-pink-100 rounded-2xl p-6 border border-red-200/50 hover:shadow-lg transition-all duration-300">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-red-600 rounded-xl flex items-center justify-center shadow-lg">
              <i className="fas fa-user-slash text-white text-lg"></i>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-700">
                {agents.filter(a => a.is_active === false).length}
              </div>
              <div className="text-sm text-red-600">已停用</div>
            </div>
          </div>
        </div>
        <button
          onClick={() => setShowDeletedAgentsModal(true)}
          className="bg-gradient-to-br from-gray-50 to-slate-100 rounded-2xl p-6 border border-gray-300/50 hover:shadow-lg transition-all duration-300 hover:from-gray-100 hover:to-slate-200 cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-gray-500 to-gray-600 rounded-xl flex items-center justify-center shadow-lg">
              <i className="fas fa-archive text-white text-lg"></i>
            </div>
            <div className="text-left">
              <div className="text-2xl font-bold text-gray-700">{deletedAgents.length}</div>
              <div className="text-sm text-gray-600">已删除</div>
            </div>
          </div>
        </button>
      </div>

      {agentError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-2xl text-sm flex items-center gap-3 shadow-sm">
          <i className="fas fa-exclamation-circle text-red-500"></i>
          <span>{agentError}</span>
        </div>
      )}

      {agentLoading ? (
        <div className="flex items-center justify-center py-24 text-gray-500">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-600 mx-auto mb-4"></div>
            <p className="text-lg font-medium">正在加载代理列表...</p>
          </div>
        </div>
      ) : (
        agents.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-24 h-24 bg-gradient-to-br from-indigo-100 to-indigo-200 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg">
              <i className="fas fa-user-friends text-indigo-400 text-3xl"></i>
            </div>
            <h3 className="text-xl font-semibold text-gray-700 mb-3">暂无代理账号</h3>
            <p className="text-gray-500 mb-6">点击"新增代理"按钮创建第一个代理账号</p>
            <button
              onClick={() => openAgentModal(null)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 text-white font-medium hover:from-indigo-600 hover:to-indigo-700 transition-all duration-300 shadow-lg hover:shadow-xl"
            >
              <i className="fas fa-plus"></i>
              创建代理账号
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {agents.map((agent, index) => {
              const buildingNames = (agent.buildings || []).map(b => buildingLabelMap[b.building_id] || `${b.address_name || ''}${b.building_name ? '·' + b.building_name : ''}`.trim()).filter(Boolean);
              const isActive = agent.is_active !== false;
              
              return (
                <div 
                  key={agent.id} 
                  className="bg-white rounded-2xl shadow-sm border border-gray-200/50 overflow-hidden hover:shadow-lg transition-all duration-300 group"
                >
                  {/* 代理卡片头部 */}
                  <div className={`p-6 ${
                    isActive 
                      ? 'bg-gradient-to-r from-indigo-500 to-indigo-600' 
                      : 'bg-gradient-to-r from-gray-400 to-gray-500'
                  }`}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4 flex-1">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl ${
                          isActive ? 'bg-white/20 backdrop-blur-sm' : 'bg-black/10'
                        }`}>
                          <i className="fas fa-user text-white text-xl"></i>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-lg font-bold text-white truncate" title={agent.name || agent.id}>
                            {agent.name || agent.id}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
                              isActive 
                                ? 'bg-emerald-500/90 text-white' 
                                : 'bg-gray-600/90 text-gray-100'
                            }`}>
                              {isActive ? '● 在职' : '● 已停用'}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 代理信息区域 */}
                  <div className="p-6 space-y-4">
                    {/* 账号信息 */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 text-sm">
                        <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                          <i className="fas fa-id-card text-gray-600 text-xs"></i>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-gray-500">账号</div>
                          <div className="font-medium text-gray-900 truncate" title={agent.id}>{agent.id}</div>
                        </div>
                      </div>
                      
                      {/* 负责楼栋 */}
                      <div className="flex items-start gap-3 text-sm">
                        <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <i className="fas fa-building text-gray-600 text-xs"></i>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-gray-500 mb-1">负责楼栋</div>
                          {buildingNames.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {buildingNames.slice(0, 3).map((name, idx) => (
                                <span 
                                  key={idx} 
                                  className="inline-flex items-center px-2.5 py-1 bg-indigo-50 text-indigo-700 text-xs font-medium rounded-lg border border-indigo-200/50"
                                  title={name}
                                >
                                  {name}
                                </span>
                              ))}
                              {buildingNames.length > 3 && (
                                <span className="inline-flex items-center px-2.5 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg">
                                  +{buildingNames.length - 3}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="text-sm text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200/50 inline-flex items-center gap-1.5">
                              <i className="fas fa-exclamation-triangle text-xs"></i>
                              未绑定楼栋
                            </div>
                          )}
                          {buildingNames.length > 0 && (
                            <div className="text-xs text-gray-500 mt-2">
                              共负责 <span className="font-semibold text-indigo-600">{buildingNames.length}</span> 个楼栋
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 操作按钮 */}
                    <div className="pt-4 border-t border-gray-100 flex gap-2">
                      <button 
                        onClick={() => openAgentModal(agent)} 
                        className="flex-1 px-4 py-2.5 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-all duration-200 border border-indigo-200/50 hover:border-indigo-300/50"
                      >
                        <i className="fas fa-edit mr-2"></i>
                        编辑
                      </button>
                      <button 
                        onClick={() => handleAgentStatusToggle(agent, !isActive)} 
                        className={`flex-1 px-4 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 border ${
                          isActive
                            ? 'text-amber-600 bg-amber-50 hover:bg-amber-100 border-amber-200/50 hover:border-amber-300/50'
                            : 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border-emerald-200/50 hover:border-emerald-300/50'
                        }`}
                      >
                        <i className={`fas ${isActive ? 'fa-pause' : 'fa-play'} mr-2`}></i>
                        {isActive ? '停用' : '启用'}
                      </button>
                      {!isActive && (
                        <button 
                          onClick={() => handleAgentDelete(agent)} 
                          className="px-4 py-2.5 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-all duration-200 border border-red-200/50 hover:border-red-300/50"
                          title="删除代理"
                        >
                          <i className="fas fa-trash"></i>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {agentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-scaleIn">
            {/* 模态框头部 */}
            <div className="bg-gradient-to-r from-indigo-500 to-purple-600 p-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full transform translate-x-16 -translate-y-16"></div>
              <div className="relative z-10 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center">
                    <i className="fas fa-user-cog text-white text-xl"></i>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">{editingAgent ? '编辑代理信息' : '创建新代理'}</h3>
                    <p className="text-sm text-white/80 mt-1">为代理配置账号信息和负责区域，系统将自动分配权限</p>
                  </div>
                </div>
                <button 
                  onClick={closeAgentModal} 
                  className="w-10 h-10 bg-white/20 hover:bg-white/30 rounded-xl flex items-center justify-center transition-all duration-200"
                  aria-label="关闭"
                >
                  <i className="fas fa-times text-white" />
                </button>
              </div>
            </div>

            {/* 模态框内容 */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {agentError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-2xl text-sm flex items-center gap-3 shadow-sm">
                  <i className="fas fa-exclamation-circle text-red-500 text-lg"></i>
                  <span>{agentError}</span>
                </div>
              )}

              {/* 基本信息 */}
              <div className="bg-gradient-to-br from-gray-50 to-blue-50/30 rounded-2xl p-6 border border-gray-200/50">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                    <i className="fas fa-info-circle text-white text-sm"></i>
                  </div>
                  <h4 className="text-lg font-semibold text-gray-900">基本信息</h4>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                      <i className="fas fa-user text-gray-400 text-xs"></i>
                      账号
                      {!editingAgent && <span className="text-red-500">*</span>}
                    </label>
                    <input
                      type="text"
                      value={agentForm.account}
                      onChange={(e) => setAgentForm(prev => ({ ...prev, account: e.target.value }))}
                      disabled={!!editingAgent}
                      placeholder="输入登录账号"
                      className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 disabled:bg-gray-100 disabled:cursor-not-allowed"
                    />
                    {editingAgent && (
                      <p className="text-xs text-gray-500 mt-1.5">账号创建后不可修改</p>
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                      <i className="fas fa-lock text-gray-400 text-xs"></i>
                      {editingAgent ? '重设密码（可选）' : '初始密码'}
                      {!editingAgent && <span className="text-red-500">*</span>}
                    </label>
                    <input
                      type="password"
                      value={agentForm.password}
                      onChange={(e) => setAgentForm(prev => ({ ...prev, password: e.target.value }))}
                      placeholder={editingAgent ? '留空则不修改密码' : '请输入初始密码'}
                      className={`w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 transition-all duration-200 ${
                        agentForm.password && agentForm.password.length > 0 && agentForm.password.length < 3
                          ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                          : 'border-gray-300 focus:ring-indigo-500 focus:border-transparent'
                      }`}
                    />
                    {agentForm.password && agentForm.password.length > 0 && agentForm.password.length < 3 ? (
                      <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
                        <i className="fas fa-exclamation-circle"></i>
                        密码至少需要3位
                      </p>
                    ) : editingAgent ? (
                      <p className="text-xs text-gray-500 mt-1.5">仅在需要重置密码时填写，至少3位</p>
                    ) : (
                      <p className="text-xs text-gray-500 mt-1.5">密码至少3位</p>
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                      <i className="fas fa-id-badge text-gray-400 text-xs"></i>
                      显示名称
                    </label>
                    <input
                      type="text"
                      value={agentForm.name}
                      onChange={(e) => setAgentForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="用于展示的友好名称"
                      className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200"
                    />
                    <p className="text-xs text-gray-500 mt-1.5">如：张三、李四等</p>
                  </div>
                  <div className="flex items-center">
                    <label className="flex items-center gap-3 cursor-pointer bg-white px-4 py-3 rounded-xl border border-gray-300 hover:border-indigo-300 transition-all duration-200 w-full">
                      <input
                        type="checkbox"
                        id="agent_active"
                        checked={agentForm.is_active}
                        onChange={(e) => setAgentForm(prev => ({ ...prev, is_active: !!e.target.checked }))}
                        className="h-5 w-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                      />
                      <div className="flex-1">
                        <span className="text-sm font-medium text-gray-900">启用该代理</span>
                        <p className="text-xs text-gray-500 mt-0.5">关闭后代理无法登录系统</p>
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              {/* 楼栋分配 */}
              <div className="bg-gradient-to-br from-gray-50 to-indigo-50/30 rounded-2xl p-6 border border-gray-200/50">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg flex items-center justify-center">
                    <i className="fas fa-building text-white text-sm"></i>
                  </div>
                  <div className="flex-1">
                    <h4 className="text-lg font-semibold text-gray-900">负责楼栋</h4>
                    <p className="text-xs text-gray-500 mt-0.5">
                      已选择 <span className="font-semibold text-indigo-600">{agentForm.building_ids.length}</span> 个楼栋
                    </p>
                  </div>
                  {agentForm.building_ids.length > 0 && (
                    <button
                      onClick={() => setAgentForm(prev => ({ ...prev, building_ids: [] }))}
                      className="text-xs text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-all duration-200"
                    >
                      清空选择
                    </button>
                  )}
                </div>
                
                {(addresses || []).some(addr => (buildingsByAddress[addr.id] || []).length > 0) ? (
                  <div className="space-y-4 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                    {(addresses || []).map(addr => {
                      const blds = buildingsByAddress[addr.id] || [];
                      if (!blds.length) return null;
                      
                      const selectedInAddress = blds.filter(b => agentForm.building_ids.includes(b.id)).length;
                      const allSelected = selectedInAddress === blds.length;
                      const someSelected = selectedInAddress > 0 && !allSelected;
                      
                      return (
                        <div key={addr.id} className="bg-white rounded-xl border border-gray-200/80 overflow-hidden shadow-sm hover:shadow-md transition-all duration-200">
                          {/* 地址头部 */}
                          <div className="bg-gradient-to-r from-gray-50 to-blue-50/50 px-4 py-3 border-b border-gray-200/50">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                                  <i className="fas fa-map-marker-alt text-white text-xs"></i>
                                </div>
                                <div>
                                  <div className="text-sm font-semibold text-gray-900">{addr.name}</div>
                                  <div className="text-xs text-gray-500">
                                    {selectedInAddress > 0 ? `已选 ${selectedInAddress}/${blds.length}` : `共 ${blds.length} 个楼栋`}
                                  </div>
                                </div>
                              </div>
                              <button
                                onClick={() => {
                                  const buildingIds = blds.map(b => b.id);
                                  setAgentForm(prev => ({
                                    ...prev,
                                    building_ids: allSelected
                                      ? prev.building_ids.filter(id => !buildingIds.includes(id))
                                      : [...new Set([...prev.building_ids, ...buildingIds])]
                                  }));
                                }}
                                className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-all duration-200 ${
                                  allSelected
                                    ? 'text-red-600 bg-red-50 hover:bg-red-100'
                                    : 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100'
                                }`}
                              >
                                {allSelected ? '取消全选' : someSelected ? '全选' : '全选'}
                              </button>
                            </div>
                          </div>
                          
                          {/* 楼栋列表 */}
                          <div className="p-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                              {blds.map(b => {
                                const isSelected = agentForm.building_ids.includes(b.id);
                                return (
                                  <label
                                    key={b.id}
                                    className={`flex items-center gap-2 px-3 py-2.5 border rounded-xl text-sm cursor-pointer transition-all duration-200 ${
                                      isSelected 
                                        ? 'border-indigo-300 bg-indigo-50 text-indigo-700 shadow-sm' 
                                        : 'border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => toggleAgentBuilding(b.id)}
                                      className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                                    />
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                      <i className={`fas fa-building text-xs ${isSelected ? 'text-indigo-500' : 'text-gray-400'}`}></i>
                                      <span className="truncate font-medium">{b.name}</span>
                                    </div>
                                    {isSelected && (
                                      <i className="fas fa-check-circle text-indigo-500 text-xs"></i>
                                    )}
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
                    <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <i className="fas fa-building text-gray-400 text-2xl"></i>
                    </div>
                    <p className="text-sm font-medium text-gray-700 mb-2">暂无可分配的楼栋</p>
                    <p className="text-xs text-gray-500">请先在"地址管理"中添加地址和楼栋</p>
                  </div>
                )}
              </div>

              {/* 模态框底部操作按钮 */}
              <div className="border-t border-gray-200 bg-gray-50/50 px-6 py-4 flex items-center justify-between">
                <div className="text-xs text-gray-500">
                  {editingAgent ? '修改后将立即生效' : '创建后代理即可使用账号登录'}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={closeAgentModal}
                    className="px-6 py-2.5 text-sm font-medium border border-gray-300 rounded-xl hover:bg-gray-50 transition-all duration-200"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleAgentSave}
                    disabled={agentSaving || (agentForm.password && agentForm.password.length > 0 && agentForm.password.length < 3)}
                    className="px-6 py-2.5 text-sm font-medium bg-gradient-to-r from-indigo-500 to-indigo-600 text-white rounded-xl hover:from-indigo-600 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl flex items-center gap-2"
                  >
                    {agentSaving ? (
                      <>
                        <i className="fas fa-spinner animate-spin"></i>
                        保存中...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-check"></i>
                        {editingAgent ? '保存修改' : '创建代理'}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 已删除代理弹窗 */}
      {showDeletedAgentsModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            {/* 背景遮罩 */}
            <div 
              className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
              onClick={() => setShowDeletedAgentsModal(false)}
            ></div>
            
            {/* 模态框内容 */}
            <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[80vh] overflow-hidden">
              {/* 模态框头部 */}
              <div className="bg-gradient-to-r from-gray-500 to-gray-600 px-6 py-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                      <i className="fas fa-archive text-white text-lg"></i>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">已删除代理</h3>
                      <p className="text-sm text-white/80 mt-0.5">查看已删除的代理账号历史信息</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowDeletedAgentsModal(false)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-all duration-200"
                  >
                    <i className="fas fa-times text-lg"></i>
                  </button>
                </div>
              </div>

              {/* 模态框内容 */}
              <div className="p-6 overflow-y-auto max-h-[calc(80vh-140px)]">
                {deletedAgents.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="w-20 h-20 bg-gray-100 rounded-3xl flex items-center justify-center mx-auto mb-4">
                      <i className="fas fa-archive text-gray-400 text-3xl"></i>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-700 mb-2">暂无已删除代理</h3>
                    <p className="text-sm text-gray-500">没有已删除的代理记录</p>
                  </div>
                ) : (
                  <>
                    <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm">
                      <div className="flex items-start gap-2">
                        <i className="fas fa-info-circle mt-0.5"></i>
                        <div>
                          <p className="font-medium">历史数据已保留</p>
                          <p className="text-xs mt-1 text-amber-700">
                            已删除的代理订单数据已保留，可在订单管理的"查看范围"中选择对应的「（已删除）」选项查看历史订单。
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      {deletedAgents.map((agent, index) => (
                        <div 
                          key={agent.id}
                          className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-all duration-200"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-4 flex-1">
                              <div className="w-12 h-12 bg-gradient-to-br from-gray-400 to-gray-500 rounded-xl flex items-center justify-center text-white font-bold shadow-lg flex-shrink-0">
                                {index + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-2">
                                  <h4 className="text-base font-bold text-gray-900">
                                    {agent.name || agent.id}
                                  </h4>
                                  <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-lg border border-red-200">
                                    已删除
                                  </span>
                                </div>
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-2 text-sm text-gray-600">
                                    <i className="fas fa-user text-xs text-gray-400 w-4"></i>
                                    <span className="font-mono">{agent.id}</span>
                                  </div>
                                  {agent.deleted_at && (
                                    <div className="flex items-center gap-2 text-sm text-gray-600">
                                      <i className="fas fa-calendar-times text-xs text-gray-400 w-4"></i>
                                      <span>
                                        删除时间: {typeof agent.deleted_at === 'number' 
                                          ? new Date(agent.deleted_at * 1000).toLocaleString('zh-CN')
                                          : new Date(agent.deleted_at).toLocaleString('zh-CN')}
                                      </span>
                                    </div>
                                  )}
                                  {agent.building_ids && agent.building_ids.length > 0 && (
                                    <div className="flex items-start gap-2 text-sm text-gray-600">
                                      <i className="fas fa-building text-xs text-gray-400 w-4 mt-1"></i>
                                      <div className="flex flex-wrap gap-1.5">
                                        <span className="text-gray-500">曾负责:</span>
                                        {agent.building_ids.map((bid, idx) => (
                                          <span key={idx} className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-lg text-xs border border-gray-200">
                                            {buildingLabelMap[bid] || bid}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* 模态框底部 */}
              <div className="border-t border-gray-200 bg-gray-50/50 px-6 py-4 flex justify-end">
                <button
                  onClick={() => setShowDeletedAgentsModal(false)}
                  className="px-6 py-2.5 text-sm font-medium bg-gray-600 hover:bg-gray-700 text-white rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
