import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

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
    <div className="space-y-8 font-sans text-gray-900">
      {/* 页面标题和操作 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-gray-900">
            代理管理
          </h2>
          <p className="text-base text-gray-500 mt-1">管理代理账号、分配楼栋权限及监控状态</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={loadAgents} 
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 shadow-sm"
          >
            <i className="fas fa-sync-alt text-gray-400"></i>
            刷新
          </button>
          <button
            onClick={() => openAgentModal(null)}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-black text-white font-medium hover:bg-gray-800 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
          >
            <i className="fas fa-plus"></i>
            新增代理
          </button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300">
          <div className="flex flex-col h-full justify-between">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center">
                <i className="fas fa-users text-blue-600 text-sm"></i>
              </div>
              <span className="text-sm font-medium text-gray-600">代理总数</span>
            </div>
            <div className="text-3xl font-bold text-gray-900">{agents.length}</div>
          </div>
        </div>
        
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300">
          <div className="flex flex-col h-full justify-between">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-emerald-50 rounded-full flex items-center justify-center">
                <i className="fas fa-user-check text-emerald-600 text-sm"></i>
              </div>
              <span className="text-sm font-medium text-gray-600">在职代理</span>
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {agents.filter(a => a.is_active !== false).length}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300">
          <div className="flex flex-col h-full justify-between">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-amber-50 rounded-full flex items-center justify-center">
                <i className="fas fa-building text-amber-600 text-sm"></i>
              </div>
              <span className="text-sm font-medium text-gray-600">负责楼栋</span>
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {agents.reduce((sum, agent) => sum + (agent.buildings || []).length, 0)}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300">
          <div className="flex flex-col h-full justify-between">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center">
                <i className="fas fa-user-slash text-red-600 text-sm"></i>
              </div>
              <span className="text-sm font-medium text-gray-600">已停用</span>
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {agents.filter(a => a.is_active === false).length}
            </div>
          </div>
        </div>

        <button
          onClick={() => setShowDeletedAgentsModal(true)}
          className="bg-gray-50 rounded-2xl p-5 border border-gray-200 hover:bg-gray-100 hover:border-gray-300 transition-all duration-300 text-left group"
        >
          <div className="flex flex-col h-full justify-between">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                <i className="fas fa-archive text-gray-600 text-sm"></i>
              </div>
              <span className="text-sm font-medium text-gray-600">已删除</span>
            </div>
            <div className="text-3xl font-bold text-gray-900">{deletedAgents.length}</div>
          </div>
        </button>
      </div>

      {agentError && (
        <div className="bg-red-50 border border-red-100 text-red-600 px-6 py-4 rounded-2xl text-sm flex items-center gap-3">
          <i className="fas fa-exclamation-circle"></i>
          <span>{agentError}</span>
        </div>
      )}

      {agentLoading ? (
        <div className="flex items-center justify-center py-32">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-gray-200 border-t-black"></div>
            <p className="text-gray-500 font-medium">加载中...</p>
          </div>
        </div>
      ) : (
        agents.length === 0 ? (
          <div className="text-center py-32 bg-gray-50/50 rounded-3xl border border-dashed border-gray-200">
            <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-sm border border-gray-100">
              <i className="fas fa-user-friends text-gray-300 text-3xl"></i>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">暂无代理账号</h3>
            <p className="text-gray-500 mb-8 max-w-sm mx-auto">还没有创建任何代理账号，点击下方按钮开始创建。</p>
            <button
              onClick={() => openAgentModal(null)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-black text-white font-medium hover:bg-gray-800 transition-all duration-300 shadow-lg hover:shadow-xl"
            >
              <i className="fas fa-plus"></i>
              创建代理账号
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {agents.map((agent) => {
              const buildingNames = (agent.buildings || []).map(b => buildingLabelMap[b.building_id] || `${b.address_name || ''}${b.building_name ? '·' + b.building_name : ''}`.trim()).filter(Boolean);
              const isActive = agent.is_active !== false;
              
              return (
                <div 
                  key={agent.id} 
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group flex flex-col overflow-hidden"
                >
                  <div className="p-6 flex-1">
                    <div className="flex items-start justify-between mb-6">
                      <div className="flex items-center gap-4">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold shadow-sm ${
                          isActive 
                            ? 'bg-gradient-to-br from-gray-900 to-gray-700 text-white' 
                            : 'bg-gray-100 text-gray-400'
                        }`}>
                          {agent.name ? agent.name.charAt(0).toUpperCase() : <i className="fas fa-user"></i>}
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-gray-900 truncate max-w-[150px]" title={agent.name || agent.id}>
                            {agent.name || agent.id}
                          </h3>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                              isActive 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                                : 'bg-gray-50 text-gray-600 border-gray-200'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-gray-400'}`}></span>
                              {isActive ? '在职' : '已停用'}
                            </span>
                            <span className="text-xs text-gray-400 font-mono">{agent.id}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <div className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">负责区域</div>
                        {buildingNames.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {buildingNames.slice(0, 3).map((name, idx) => (
                              <span 
                                key={idx} 
                                className="inline-flex items-center px-2.5 py-1 bg-gray-50 text-gray-700 text-xs font-medium rounded-lg border border-gray-100"
                                title={name}
                              >
                                {name}
                              </span>
                            ))}
                            {buildingNames.length > 3 && (
                              <span className="inline-flex items-center px-2.5 py-1 bg-gray-50 text-gray-500 text-xs font-medium rounded-lg border border-gray-100">
                                +{buildingNames.length - 3}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="text-sm text-gray-400 italic flex items-center gap-2">
                            <i className="fas fa-info-circle text-xs"></i>
                            暂未分配楼栋
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="px-6 py-4 bg-gray-50/50 border-t border-gray-100 flex gap-3">
                    <button 
                      onClick={() => openAgentModal(agent)} 
                      className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 shadow-sm"
                    >
                      编辑
                    </button>
                    <button 
                      onClick={() => handleAgentStatusToggle(agent, !isActive)} 
                      className={`flex-1 px-4 py-2 text-sm font-medium rounded-xl transition-all duration-200 border shadow-sm ${
                        isActive
                          ? 'text-amber-700 bg-amber-50 border-amber-100 hover:bg-amber-100'
                          : 'text-emerald-700 bg-emerald-50 border-emerald-100 hover:bg-emerald-100'
                      }`}
                    >
                      {isActive ? '停用' : '启用'}
                    </button>
                    {!isActive && (
                      <button 
                        onClick={() => handleAgentDelete(agent)} 
                        className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 border border-red-100 rounded-xl hover:bg-red-100 transition-all duration-200 shadow-sm"
                        title="删除代理"
                      >
                        <i className="fas fa-trash"></i>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      <AnimatePresence>
        {agentModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm"
              onClick={closeAgentModal}
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
              className="relative bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col z-10"
            >
              {/* 模态框头部 */}
              <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900">{editingAgent ? '编辑代理' : '新增代理'}</h3>
                  <p className="text-sm text-gray-500 mt-1">配置代理账号信息及负责区域权限</p>
                </div>
                <button 
                  onClick={closeAgentModal} 
                  className="w-9 h-9 rounded-full bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-500 transition-all duration-200"
                >
                  <i className="fas fa-times" />
                </button>
              </div>

              {/* 模态框内容 */}
              <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-white custom-scrollbar">
                {agentError && (
                  <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
                    <i className="fas fa-exclamation-circle"></i>
                    <span>{agentError}</span>
                  </div>
                )}

                {/* 基本信息 */}
                <section>
                  <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <span className="w-1 h-4 bg-black rounded-full"></span>
                    账号信息
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        账号 <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={agentForm.account}
                        onChange={(e) => setAgentForm(prev => ({ ...prev, account: e.target.value }))}
                        disabled={!!editingAgent}
                        placeholder="输入登录账号"
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-400 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                      {editingAgent && <p className="text-xs text-gray-400 mt-1.5">账号不可修改</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {editingAgent ? '重设密码' : '初始密码'} <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="password"
                        value={agentForm.password}
                        onChange={(e) => setAgentForm(prev => ({ ...prev, password: e.target.value }))}
                        placeholder={editingAgent ? '留空不修改' : '至少3位字符'}
                        className={`w-full bg-gray-50 border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 transition-all duration-200 ${
                          agentForm.password && agentForm.password.length > 0 && agentForm.password.length < 3
                            ? 'border-red-300 focus:ring-red-100 focus:border-red-400'
                            : 'border-gray-200 focus:ring-black/5 focus:border-gray-400'
                        }`}
                      />
                      {agentForm.password && agentForm.password.length > 0 && agentForm.password.length < 3 && (
                        <p className="text-xs text-red-500 mt-1.5">密码长度至少3位</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">显示名称</label>
                      <input
                        type="text"
                        value={agentForm.name}
                        onChange={(e) => setAgentForm(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="例如：张三"
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-400 transition-all duration-200"
                      />
                    </div>
                    <div className="flex items-end pb-1">
                      <label className="flex items-center gap-3 cursor-pointer group">
                        <div className={`w-12 h-7 rounded-full p-1 transition-colors duration-200 ${agentForm.is_active ? 'bg-black' : 'bg-gray-200'}`}>
                          <div className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform duration-200 ${agentForm.is_active ? 'translate-x-5' : 'translate-x-0'}`}></div>
                        </div>
                        <input
                          type="checkbox"
                          className="hidden"
                          checked={agentForm.is_active}
                          onChange={(e) => setAgentForm(prev => ({ ...prev, is_active: !!e.target.checked }))}
                        />
                        <div>
                          <span className="text-sm font-medium text-gray-900 block">启用账号</span>
                          <span className="text-xs text-gray-500">关闭后将无法登录</span>
                        </div>
                      </label>
                    </div>
                  </div>
                </section>

                {/* 楼栋分配 */}
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                      <span className="w-1 h-4 bg-black rounded-full"></span>
                      负责楼栋
                    </h4>
                    {agentForm.building_ids.length > 0 && (
                      <button
                        onClick={() => setAgentForm(prev => ({ ...prev, building_ids: [] }))}
                        className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-all duration-200"
                      >
                        清空已选 ({agentForm.building_ids.length})
                      </button>
                    )}
                  </div>
                  
                  <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
                    {(addresses || []).some(addr => (buildingsByAddress[addr.id] || []).length > 0) ? (
                      <div className="space-y-6 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                        {(addresses || []).map(addr => {
                          const blds = buildingsByAddress[addr.id] || [];
                          if (!blds.length) return null;
                          
                          const selectedInAddress = blds.filter(b => agentForm.building_ids.includes(b.id)).length;
                          const allSelected = selectedInAddress === blds.length;
                          
                          return (
                            <div key={addr.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/30">
                                <div className="flex items-center gap-2">
                                  <i className="fas fa-map-marker-alt text-gray-400 text-xs"></i>
                                  <span className="text-sm font-semibold text-gray-900">{addr.name}</span>
                                  <span className="text-xs text-gray-400 ml-2">
                                    {selectedInAddress}/{blds.length}
                                  </span>
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
                                  className={`text-xs font-medium px-3 py-1 rounded-md transition-colors ${
                                    allSelected
                                      ? 'text-gray-500 bg-gray-100 hover:bg-gray-200'
                                      : 'text-blue-600 bg-blue-50 hover:bg-blue-100'
                                  }`}
                                >
                                  {allSelected ? '取消全选' : '全选'}
                                </button>
                              </div>
                              
                              <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                                {blds.map(b => {
                                  const isSelected = agentForm.building_ids.includes(b.id);
                                  return (
                                    <label
                                      key={b.id}
                                      className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm cursor-pointer transition-all duration-200 select-none ${
                                        isSelected 
                                          ? 'border-black bg-gray-900 text-white shadow-md' 
                                          : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => toggleAgentBuilding(b.id)}
                                        className="hidden"
                                      />
                                      <div className="flex-1 truncate font-medium">{b.name}</div>
                                      {isSelected && <i className="fas fa-check text-xs"></i>}
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-12">
                        <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 border border-gray-200 shadow-sm">
                          <i className="fas fa-building text-gray-300 text-2xl"></i>
                        </div>
                        <p className="text-sm font-medium text-gray-900">暂无可分配楼栋</p>
                        <p className="text-xs text-gray-500 mt-1">请先在地址管理中添加数据</p>
                      </div>
                    )}
                  </div>
                </section>
              </div>

              {/* 模态框底部 */}
              <div className="border-t border-gray-100 bg-white px-8 py-5 flex items-center justify-end gap-3 sticky bottom-0 z-10">
                <button
                  onClick={closeAgentModal}
                  className="px-6 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-full hover:bg-gray-50 transition-all duration-200"
                >
                  取消
                </button>
                <button
                  onClick={handleAgentSave}
                  disabled={agentSaving || (agentForm.password && agentForm.password.length > 0 && agentForm.password.length < 3)}
                  className="px-8 py-2.5 text-sm font-medium bg-black text-white rounded-full hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl flex items-center gap-2"
                >
                  {agentSaving ? (
                    <>
                      <i className="fas fa-spinner animate-spin"></i>
                      保存中...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-check"></i>
                      {editingAgent ? '保存修改' : '立即创建'}
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDeletedAgentsModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setShowDeletedAgentsModal(false)}
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
              className="relative bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[80vh] overflow-hidden flex flex-col z-10"
            >
              <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-900">已删除代理</h3>
                <button
                  onClick={() => setShowDeletedAgentsModal(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-50 hover:bg-gray-100 text-gray-500 transition-all"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>

              <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
                {deletedAgents.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <i className="fas fa-archive text-gray-300 text-2xl"></i>
                    </div>
                    <p className="text-gray-500">暂无已删除记录</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-amber-50 text-amber-800 px-4 py-3 rounded-xl text-sm flex gap-3">
                      <i className="fas fa-info-circle mt-0.5"></i>
                      <div>
                        <p className="font-medium">关于历史数据</p>
                        <p className="opacity-80 mt-0.5">已删除代理的订单数据依然保留，可在订单筛选中查看。</p>
                      </div>
                    </div>
                    
                    {deletedAgents.map((agent, index) => (
                      <div 
                        key={agent.id}
                        className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-all duration-200"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 font-bold text-sm">
                              {index + 1}
                            </div>
                            <div>
                              <h4 className="font-bold text-gray-900">{agent.name || agent.id}</h4>
                              <div className="text-xs text-gray-500 font-mono">{agent.id}</div>
                            </div>
                          </div>
                          <span className="px-2.5 py-1 text-xs font-medium bg-red-50 text-red-600 rounded-lg">
                            已删除
                          </span>
                        </div>
                        
                        <div className="pl-13 space-y-2 text-sm text-gray-600">
                          {agent.deleted_at && (
                            <div className="flex items-center gap-2">
                              <i className="fas fa-clock text-gray-400 text-xs w-4"></i>
                              <span>
                                删除时间: {typeof agent.deleted_at === 'number' 
                                  ? new Date(agent.deleted_at * 1000).toLocaleString('zh-CN')
                                  : new Date(agent.deleted_at).toLocaleString('zh-CN')}
                              </span>
                            </div>
                          )}
                          {agent.building_ids && agent.building_ids.length > 0 && (
                            <div className="flex items-start gap-2">
                              <i className="fas fa-building text-gray-400 text-xs w-4 mt-1"></i>
                              <div className="flex flex-wrap gap-1.5 flex-1">
                                {agent.building_ids.map((bid, idx) => (
                                  <span key={idx} className="px-2 py-0.5 bg-gray-50 text-gray-600 rounded border border-gray-100 text-xs">
                                    {buildingLabelMap[bid] || bid}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
