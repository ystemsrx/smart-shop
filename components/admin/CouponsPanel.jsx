import React from 'react';
import { useApi } from '../../hooks/useAuth';

export const CouponsPanel = ({ apiPrefix, apiRequest: injectedApiRequest }) => {
  const { apiRequest: contextApiRequest } = useApi();
  const apiRequest = injectedApiRequest || contextApiRequest;
  const [q, setQ] = React.useState('');
  const [suggests, setSuggests] = React.useState([]);
  const [selected, setSelected] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [quantity, setQuantity] = React.useState(1);
  const [expiresAt, setExpiresAt] = React.useState(''); // datetime-local
  const [list, setList] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [issuing, setIssuing] = React.useState(false);
  const [expandedStudents, setExpandedStudents] = React.useState(new Set());
  const [statusFilter, setStatusFilter] = React.useState('all'); // all, active, used, revoked
  const [searchUser, setSearchUser] = React.useState('');

  // 实时查询（只有输入至少一个字符时才搜索）
  React.useEffect(() => {
    if (q.trim().length === 0) {
      setSuggests([]);
      return;
    }
    
    let mounted = true;
    (async () => {
      try {
        const r = await apiRequest(`/admin/students/search?q=${encodeURIComponent(q)}`);
        if (!mounted) return;
        setSuggests(r?.data?.students || []);
      } catch (e) {
        if (!mounted) return;
        setSuggests([]);
      }
    })();
    return () => { mounted = false; };
  }, [q, apiRequest]);

  const loadList = async () => {
    setLoading(true);
    try {
      // 始终加载所有优惠券，不受发放优惠券时选择的用户影响
      const r = await apiRequest(`${apiPrefix}/coupons`);
      setList(r?.data?.coupons || []);
    } catch (e) {
      setList([]);
    } finally {
      setLoading(false);
    }
  };

  // 组件挂载时加载一次列表
  React.useEffect(() => { loadList(); }, [apiPrefix, apiRequest]);

  const handleIssue = async () => {
    const sid = selected || (suggests[0]?.id || '');
    if (!sid) { alert('请选择用户'); return; }
    const amt = parseFloat(amount);
    if (!(amt > 0)) { alert('请输入正确金额'); return; }
    let expires = null;
    if (expiresAt) {
      const t = new Date(expiresAt);
      if (!isNaN(t.getTime())) {
        const pad = (n) => n.toString().padStart(2, '0');
        expires = `${t.getFullYear()}-${pad(t.getMonth()+1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}:00`;
      }
    }
    setIssuing(true);
    try {
      await apiRequest(`${apiPrefix}/coupons/issue`, {
        method: 'POST',
        body: JSON.stringify({ student_id: sid, amount: amt, quantity: parseInt(quantity)||1, expires_at: expires })
      });
      setAmount('');
      setQuantity(1);
      await loadList();
      alert('发放成功');
    } catch (e) {
      alert(e.message || '发放失败');
    } finally {
      setIssuing(false);
    }
  };

  const handleRevoke = async (id) => {
    if (!confirm('确定撤回该优惠券？')) return;
    try {
      await apiRequest(`${apiPrefix}/coupons/${id}/revoke`, { method: 'PATCH' });
      await loadList();
    } catch (e) {
      alert(e.message || '撤回失败');
    }
  };

  const handleDelete = async (id) => {
    try {
      await apiRequest(`${apiPrefix}/coupons/${id}`, { method: 'DELETE' });
      await loadList();
    } catch (e) {
      alert(e.message || '删除失败');
    }
  };

  const toggleStudentExpanded = (studentId) => {
    const newExpanded = new Set(expandedStudents);
    if (newExpanded.has(studentId)) {
      newExpanded.delete(studentId);
    } else {
      newExpanded.add(studentId);
    }
    setExpandedStudents(newExpanded);
  };

  // 统计数据
  const stats = React.useMemo(() => {
    const total = list.length;
    const active = list.filter(c => c.status === 'active' && !c.expired).length;
    const used = list.filter(c => c.status === 'used').length;
    const revoked = list.filter(c => c.status === 'revoked').length;
    const expired = list.filter(c => c.expired && c.status === 'active').length;
    return { total, active, used, revoked, expired };
  }, [list]);

  // 过滤优惠券
  const filteredList = React.useMemo(() => {
    return list.filter(c => {
      // 状态筛选
      if (statusFilter === 'active' && (c.status !== 'active' || c.expired)) return false;
      if (statusFilter === 'used' && c.status !== 'used') return false;
      if (statusFilter === 'revoked' && c.status !== 'revoked') return false;
      if (statusFilter === 'expired' && (!c.expired || c.status !== 'active')) return false;
      
      // 用户搜索 - 支持用户名和昵称
      if (searchUser) {
        const searchLower = searchUser.toLowerCase();
        const matchStudentId = c.student_id?.toLowerCase().includes(searchLower);
        const matchUserName = c.user_name?.toLowerCase().includes(searchLower);
        if (!matchStudentId && !matchUserName) return false;
      }
      
      return true;
    });
  }, [list, statusFilter, searchUser]);

  return (
    <div className="space-y-8 font-sans text-gray-900">
      {/* 页面标题 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-gray-900">优惠券管理</h2>
          <p className="text-base text-gray-500 mt-1">发放、管理和查看所有用户的优惠券使用情况</p>
        </div>
        <button 
          onClick={loadList} 
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 shadow-sm"
        >
          <i className="fas fa-sync-alt text-gray-400"></i>
          刷新数据
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300">
          <div className="flex flex-col h-full justify-between">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center">
                <i className="fas fa-ticket-alt text-blue-600 text-sm"></i>
              </div>
              <span className="text-sm font-medium text-gray-600">总计发放</span>
            </div>
            <div className="text-3xl font-bold text-gray-900">{stats.total}</div>
          </div>
        </div>
        
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300">
          <div className="flex flex-col h-full justify-between">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-emerald-50 rounded-full flex items-center justify-center">
                <i className="fas fa-check-circle text-emerald-600 text-sm"></i>
              </div>
              <span className="text-sm font-medium text-gray-600">当前可用</span>
            </div>
            <div className="text-3xl font-bold text-gray-900">{stats.active}</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300">
          <div className="flex flex-col h-full justify-between">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-purple-50 rounded-full flex items-center justify-center">
                <i className="fas fa-receipt text-purple-600 text-sm"></i>
              </div>
              <span className="text-sm font-medium text-gray-600">已使用</span>
            </div>
            <div className="text-3xl font-bold text-gray-900">{stats.used}</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300">
          <div className="flex flex-col h-full justify-between">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center">
                <i className="fas fa-ban text-red-600 text-sm"></i>
              </div>
              <span className="text-sm font-medium text-gray-600">已撤回</span>
            </div>
            <div className="text-3xl font-bold text-gray-900">{stats.revoked}</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300">
          <div className="flex flex-col h-full justify-between">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center">
                <i className="fas fa-clock text-gray-500 text-sm"></i>
              </div>
              <span className="text-sm font-medium text-gray-600">已过期</span>
            </div>
            <div className="text-3xl font-bold text-gray-900">{stats.expired}</div>
          </div>
        </div>
      </div>

      {/* 发放优惠券表单 */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-8 py-6 border-b border-gray-100 bg-gray-50/30 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-black text-white flex items-center justify-center shadow-lg shadow-black/10">
            <i className="fas fa-gift text-lg"></i>
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">发放优惠券</h3>
            <p className="text-sm text-gray-500">为用户发放新的优惠券，可设置金额、数量及有效期</p>
          </div>
        </div>
        
        <div className="p-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-2">选择用户 <span className="text-red-500">*</span></label>
              <div className="relative">
                <input 
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-400 transition-all duration-200" 
                  placeholder="输入用户名搜索..." 
                  value={q} 
                  onChange={(e) => setQ(e.target.value)}
                  onFocus={() => {
                    if (q.length > 0 && suggests.length > 0) {
                      document.getElementById('suggest-dropdown').style.display = 'block';
                    }
                  }}
                  onBlur={() => {
                    setTimeout(() => {
                      const dropdown = document.getElementById('suggest-dropdown');
                      if (dropdown) dropdown.style.display = 'none';
                    }, 200);
                  }}
                />
                <i className="fas fa-search absolute right-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
              </div>
              {q.length > 0 && suggests.length > 0 && (
                <div 
                  id="suggest-dropdown"
                  className="absolute z-20 w-full mt-2 bg-white border border-gray-100 rounded-xl shadow-xl max-h-60 overflow-y-auto custom-scrollbar"
                >
                  {suggests.map(s => (
                    <div 
                      key={s.id} 
                      className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-b-0 transition-colors flex items-center justify-between group"
                      onClick={() => {
                        setSelected(s.id);
                        setQ(s.id + (s.name ? ` · ${s.name}` : ''));
                        document.getElementById('suggest-dropdown').style.display = 'none';
                      }}
                    >
                      <div>
                        <div className="text-sm font-medium text-gray-900 group-hover:text-black">{s.id}</div>
                        {s.name && <div className="text-xs text-gray-500">{s.name}</div>}
                      </div>
                      <i className="fas fa-plus text-gray-300 group-hover:text-black transition-colors"></i>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">金额（元） <span className="text-red-500">*</span></label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">¥</span>
                <input 
                  type="number" 
                  step="0.01" 
                  min="0.01" 
                  value={amount} 
                  onChange={(e) => setAmount(e.target.value)} 
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-8 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-400 transition-all duration-200" 
                  placeholder="0.00"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">数量 <span className="text-red-500">*</span></label>
              <input 
                type="number" 
                min="1" 
                value={quantity} 
                onChange={(e) => setQuantity(parseInt(e.target.value)||1)} 
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-400 transition-all duration-200" 
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">过期时间</label>
              <input 
                type="datetime-local" 
                value={expiresAt} 
                onChange={(e) => setExpiresAt(e.target.value)} 
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-gray-400 transition-all duration-200" 
              />
            </div>
          </div>
          
          <div className="mt-6 flex items-center justify-between border-t border-gray-50 pt-6">
            <div className="flex items-center gap-2">
              {selected ? (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium">
                  <i className="fas fa-user-check"></i>
                  <span>已选择用户: {selected}</span>
                </div>
              ) : (
                <span className="text-sm text-gray-400 flex items-center gap-2">
                  <i className="fas fa-info-circle"></i>
                  请先选择一个用户
                </span>
              )}
            </div>
            
            <button 
              onClick={handleIssue} 
              disabled={issuing} 
              className="px-8 py-3 bg-black text-white rounded-full font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 flex items-center gap-2"
            >
              {issuing ? (
                <><i className="fas fa-spinner fa-spin"></i> 发放中...</>
              ) : (
                <><i className="fas fa-paper-plane"></i> 确认发放</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 优惠券列表 */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        {/* 工具栏 */}
        <div className="p-6 border-b border-gray-100">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <h3 className="text-xl font-bold text-gray-900">优惠券列表</h3>
            
            <div className="flex flex-col sm:flex-row gap-3">
              {/* 搜索框 */}
              <div className="relative group">
                <input
                  type="text"
                  placeholder="搜索用户名或昵称..."
                  value={searchUser}
                  onChange={(e) => setSearchUser(e.target.value)}
                  className="pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-black/5 focus:border-gray-400 text-sm w-full sm:w-64 transition-all duration-200"
                />
                <i className="fas fa-search absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-black transition-colors"></i>
              </div>
              
              {/* 状态筛选 */}
              <div className="flex items-center gap-1 bg-gray-50 rounded-xl p-1 border border-gray-100">
                {[
                  { id: 'all', label: '全部' },
                  { id: 'active', label: '可用' },
                  { id: 'used', label: '已用' },
                  { id: 'revoked', label: '已撤回' },
                  { id: 'expired', label: '过期' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setStatusFilter(tab.id)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                      statusFilter === tab.id 
                        ? 'bg-white text-black shadow-sm' 
                        : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 列表内容 */}
        <div className="p-6 bg-gray-50/30 min-h-[300px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-gray-200 border-t-black mb-4"></div>
              <p className="text-gray-500 font-medium">加载数据中...</p>
            </div>
          ) : filteredList.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-sm border border-gray-100">
                <i className="fas fa-inbox text-gray-300 text-3xl"></i>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">暂无优惠券数据</h3>
              <p className="text-gray-500 mb-6">没有找到符合条件的优惠券记录</p>
              {(statusFilter !== 'all' || searchUser) && (
                <button 
                  onClick={() => { setStatusFilter('all'); setSearchUser(''); }}
                  className="px-6 py-2.5 bg-white border border-gray-200 rounded-full text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all shadow-sm"
                >
                  清除筛选条件
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {(() => {
                const groupedByStudent = {};
                filteredList.forEach(c => {
                  if (!groupedByStudent[c.student_id]) {
                    groupedByStudent[c.student_id] = [];
                  }
                  groupedByStudent[c.student_id].push(c);
                });

                const studentIds = Object.keys(groupedByStudent).sort();
                
                return studentIds.map(studentId => {
                  const coupons = groupedByStudent[studentId];
                  const isExpanded = expandedStudents.has(studentId);
                  const activeCoupons = coupons.filter(c => c.status === 'active' && !c.expired);
                  const usedCoupons = coupons.filter(c => c.status === 'used');
                  const revokedCoupons = coupons.filter(c => c.status === 'revoked');
                  const expiredCoupons = coupons.filter(c => c.expired && c.status === 'active');
                  
                  return (
                    <div 
                      key={studentId} 
                      className={`bg-white rounded-2xl border transition-all duration-300 overflow-hidden ${
                        isExpanded ? 'border-gray-200 shadow-md ring-1 ring-black/5' : 'border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200'
                      }`}
                    >
                      {/* 用户卡片头部 */}
                      <div 
                        className={`px-6 py-4 cursor-pointer transition-colors flex items-center justify-between ${
                          isExpanded ? 'bg-gray-50/50' : 'bg-white hover:bg-gray-50/30'
                        }`}
                        onClick={() => toggleStudentExpanded(studentId)}
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
                            isExpanded ? 'bg-black text-white rotate-90' : 'bg-gray-100 text-gray-400'
                          }`}>
                            <i className="fas fa-chevron-right text-xs"></i>
                          </div>
                          
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center shadow-inner">
                              <i className="fas fa-user text-gray-500 text-lg"></i>
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                {coupons[0]?.user_name && (
                                  <span className="font-bold text-gray-900 text-lg">{coupons[0].user_name}</span>
                                )}
                                <span className="text-gray-500 text-sm bg-gray-100 px-2 py-0.5 rounded-md font-mono">
                                  {studentId}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 mt-1.5">
                                {activeCoupons.length > 0 && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                                    {activeCoupons.length} 张可用
                                  </span>
                                )}
                                {usedCoupons.length > 0 && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-purple-50 text-purple-700 border border-purple-100">
                                    {usedCoupons.length} 张已用
                                  </span>
                                )}
                                {(revokedCoupons.length > 0 || expiredCoupons.length > 0) && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-gray-50 text-gray-600 border border-gray-100">
                                    {revokedCoupons.length + expiredCoupons.length} 张无效
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        <div className="text-right">
                          <div className="text-2xl font-bold text-gray-900">{coupons.length}</div>
                          <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">总数量</div>
                        </div>
                      </div>
                      
                      {/* 优惠券详情表格 */}
                      {isExpanded && (
                        <div className="border-t border-gray-100 animate-fadeIn">
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-100">
                              <thead className="bg-gray-50/50">
                                <tr>
                                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">面额</th>
                                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">状态</th>
                                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">创建时间</th>
                                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">有效期至</th>
                                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">操作</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-50">
                                {coupons.map(c => {
                                  const amt = parseFloat(c.amount) || 0;
                                  const expired = !!c.expired;
                                  let statusText, statusBadge;
                                  
                                  if (c.status === 'used') {
                                    statusText = '已使用';
                                    statusBadge = 'bg-purple-50 text-purple-700 border-purple-100';
                                  } else if (c.status === 'revoked') {
                                    statusText = '已撤回';
                                    statusBadge = 'bg-red-50 text-red-700 border-red-100';
                                  } else if (expired) {
                                    statusText = '已过期';
                                    statusBadge = 'bg-gray-100 text-gray-600 border-gray-200';
                                  } else {
                                    statusText = '可用';
                                    statusBadge = 'bg-emerald-50 text-emerald-700 border-emerald-100';
                                  }
                                  
                                  return (
                                    <tr key={c.id} className="hover:bg-gray-50/80 transition-colors group">
                                      <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center gap-2">
                                          <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center text-amber-600">
                                            <i className="fas fa-yen-sign text-xs"></i>
                                          </div>
                                          <span className="text-lg font-bold text-gray-900">{amt.toFixed(2)}</span>
                                        </div>
                                      </td>
                                      <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${statusBadge}`}>
                                          <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                                            c.status === 'used' ? 'bg-purple-500' :
                                            c.status === 'revoked' ? 'bg-red-500' :
                                            expired ? 'bg-gray-500' : 'bg-emerald-500'
                                          }`}></span>
                                          {statusText}
                                        </span>
                                      </td>
                                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 font-mono">
                                        {c.created_at ? new Date(c.created_at).toLocaleString('zh-CN', { 
                                          year: 'numeric', month: '2-digit', day: '2-digit',
                                          hour: '2-digit', minute: '2-digit'
                                        }) : '—'}
                                      </td>
                                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 font-mono">
                                        {c.expires_at ? new Date(c.expires_at).toLocaleString('zh-CN', { 
                                          year: 'numeric', month: '2-digit', day: '2-digit',
                                          hour: '2-digit', minute: '2-digit'
                                        }) : <span className="text-gray-400">永久有效</span>}
                                      </td>
                                      <td className="px-6 py-4 whitespace-nowrap text-center">
                                        {c.status === 'active' && !expired ? (
                                          <button 
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleRevoke(c.id);
                                            }} 
                                            className="inline-flex items-center px-3 py-1.5 bg-white border border-red-200 text-red-600 rounded-lg text-xs font-medium hover:bg-red-50 hover:border-red-300 transition-all shadow-sm"
                                          >
                                            <i className="fas fa-ban mr-1.5"></i>
                                            撤回
                                          </button>
                                        ) : c.status === 'revoked' ? (
                                          <button 
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleDelete(c.id);
                                            }} 
                                            className="inline-flex items-center px-3 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
                                          >
                                            <i className="fas fa-trash mr-1.5"></i>
                                            删除
                                          </button>
                                        ) : (
                                          <span className="text-gray-300 text-xs">—</span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
