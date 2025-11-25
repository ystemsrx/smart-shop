import React from 'react';
import { useApi } from '../../hooks/useAuth';

export const CouponsPanel = ({ apiPrefix }) => {
  const { apiRequest } = useApi();
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
  React.useEffect(() => { loadList(); }, []);

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
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">优惠券管理</h2>
        <p className="text-sm text-gray-600 mt-1">发放、管理和查看所有用户的优惠券使用情况</p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">总计</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <i className="fas fa-ticket-alt text-blue-600 text-xl"></i>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">可用</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{stats.active}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <i className="fas fa-check-circle text-green-600 text-xl"></i>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">已使用</p>
              <p className="text-2xl font-bold text-purple-600 mt-1">{stats.used}</p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <i className="fas fa-receipt text-purple-600 text-xl"></i>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">已撤回</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{stats.revoked}</p>
            </div>
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <i className="fas fa-ban text-red-600 text-xl"></i>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">已过期</p>
              <p className="text-2xl font-bold text-gray-500 mt-1">{stats.expired}</p>
            </div>
            <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
              <i className="fas fa-clock text-gray-500 text-xl"></i>
            </div>
          </div>
        </div>
      </div>

      {/* 发放优惠券表单 */}
      <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-lg shadow-sm border border-indigo-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <i className="fas fa-gift text-indigo-600 text-lg"></i>
          <h3 className="text-lg font-semibold text-gray-900">发放优惠券</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">选择用户 *</label>
            <input 
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" 
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
            {q.length > 0 && suggests.length > 0 && (
              <div 
                id="suggest-dropdown"
                className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-xl max-h-48 overflow-y-auto"
              >
                {suggests.map(s => (
                  <div 
                    key={s.id} 
                    className="px-3 py-2 hover:bg-indigo-50 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors"
                    onClick={() => {
                      setSelected(s.id);
                      setQ(s.id + (s.name ? ` · ${s.name}` : ''));
                      document.getElementById('suggest-dropdown').style.display = 'none';
                    }}
                  >
                    <div className="text-sm font-medium text-gray-900">{s.id}</div>
                    {s.name && <div className="text-xs text-gray-500">{s.name}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">金额（元）*</label>
            <input 
              type="number" 
              step="0.01" 
              min="0.01" 
              value={amount} 
              onChange={(e) => setAmount(e.target.value)} 
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" 
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">数量 *</label>
            <input 
              type="number" 
              min="1" 
              value={quantity} 
              onChange={(e) => setQuantity(parseInt(e.target.value)||1)} 
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">过期时间</label>
            <input 
              type="datetime-local" 
              value={expiresAt} 
              onChange={(e) => setExpiresAt(e.target.value)} 
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" 
            />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button 
            onClick={handleIssue} 
            disabled={issuing} 
            className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {issuing ? (
              <><i className="fas fa-spinner fa-spin mr-2"></i>发放中...</>
            ) : (
              <><i className="fas fa-paper-plane mr-2"></i>发放优惠券</>
            )}
          </button>
          {selected && (
            <span className="text-sm text-gray-600">
              <i className="fas fa-user mr-1"></i>
              已选择：<span className="font-medium text-gray-900">{selected}</span>
            </span>
          )}
        </div>
      </div>

      {/* 优惠券列表 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {/* 工具栏 */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold text-gray-900">优惠券列表</h3>
              <button 
                onClick={loadList} 
                className="text-sm px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg border border-gray-300 transition-colors"
              >
                <i className="fas fa-sync-alt mr-1"></i>刷新
              </button>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              {/* 搜索框 */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="搜索用户名或昵称..."
                  value={searchUser}
                  onChange={(e) => setSearchUser(e.target.value)}
                  className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                />
                <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
              </div>
              {/* 状态筛选 */}
              <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-1 border border-gray-200">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    statusFilter === 'all' 
                      ? 'bg-white text-indigo-600 shadow-sm' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  全部
                </button>
                <button
                  onClick={() => setStatusFilter('active')}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    statusFilter === 'active' 
                      ? 'bg-white text-green-600 shadow-sm' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  可用
                </button>
                <button
                  onClick={() => setStatusFilter('used')}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    statusFilter === 'used' 
                      ? 'bg-white text-purple-600 shadow-sm' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  已使用
                </button>
                <button
                  onClick={() => setStatusFilter('revoked')}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    statusFilter === 'revoked' 
                      ? 'bg-white text-red-600 shadow-sm' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  已撤回
                </button>
                <button
                  onClick={() => setStatusFilter('expired')}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    statusFilter === 'expired' 
                      ? 'bg-white text-gray-600 shadow-sm' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  已过期
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 列表内容 */}
        <div className="p-4">
          {loading ? (
            <div className="text-center py-12">
              <i className="fas fa-spinner fa-spin text-3xl text-gray-400 mb-3"></i>
              <p className="text-sm text-gray-500">加载中...</p>
            </div>
          ) : filteredList.length === 0 ? (
            <div className="text-center py-12">
              <i className="fas fa-inbox text-4xl text-gray-300 mb-3"></i>
              <p className="text-gray-500">暂无数据</p>
              {(statusFilter !== 'all' || searchUser) && (
                <button 
                  onClick={() => { setStatusFilter('all'); setSearchUser(''); }}
                  className="mt-3 text-sm text-indigo-600 hover:text-indigo-700"
                >
                  清除筛选条件
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
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
                    <div key={studentId} className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                      {/* 用户卡片头部 */}
                      <div 
                        className="px-4 py-3 bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200 cursor-pointer hover:from-gray-100 hover:to-gray-150 transition-all"
                        onClick={() => toggleStudentExpanded(studentId)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                              <i className="fas fa-chevron-right text-gray-400"></i>
                            </div>
                            <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                              <i className="fas fa-user text-indigo-600"></i>
                            </div>
                            <div>
                              <div className="font-semibold text-gray-900">
                                {studentId}
                                {coupons[0]?.user_name && (
                                  <span className="text-gray-600 font-normal"> （{coupons[0].user_name}）</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                {activeCoupons.length > 0 && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                    <i className="fas fa-check-circle mr-1"></i>
                                    {activeCoupons.length} 可用
                                  </span>
                                )}
                                {usedCoupons.length > 0 && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                                    <i className="fas fa-receipt mr-1"></i>
                                    {usedCoupons.length} 已用
                                  </span>
                                )}
                                {revokedCoupons.length > 0 && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                                    <i className="fas fa-ban mr-1"></i>
                                    {revokedCoupons.length} 已撤回
                                  </span>
                                )}
                                {expiredCoupons.length > 0 && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                    <i className="fas fa-clock mr-1"></i>
                                    {expiredCoupons.length} 已过期
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <span className="text-sm text-gray-500">
                            共 {coupons.length} 张
                          </span>
                        </div>
                      </div>
                      
                      {/* 优惠券详情表格 */}
                      {isExpanded && (
                        <div className="bg-white">
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">金额</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">创建时间</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">过期时间</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {coupons.map(c => {
                                  const amt = parseFloat(c.amount) || 0;
                                  const expired = !!c.expired;
                                  let statusText, statusBadge;
                                  
                                  if (c.status === 'used') {
                                    statusText = '已使用';
                                    statusBadge = 'bg-purple-100 text-purple-700';
                                  } else if (c.status === 'revoked') {
                                    statusText = '已撤回';
                                    statusBadge = 'bg-red-100 text-red-700';
                                  } else if (expired) {
                                    statusText = '已过期';
                                    statusBadge = 'bg-gray-100 text-gray-600';
                                  } else {
                                    statusText = '可用';
                                    statusBadge = 'bg-green-100 text-green-700';
                                  }
                                  
                                  return (
                                    <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                                      <td className="px-4 py-3 whitespace-nowrap">
                                        <span className="text-lg font-bold text-gray-900">¥{amt.toFixed(2)}</span>
                                      </td>
                                      <td className="px-4 py-3 whitespace-nowrap">
                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusBadge}`}>
                                          {statusText}
                                        </span>
                                      </td>
                                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                                        {c.created_at ? new Date(c.created_at).toLocaleString('zh-CN', { 
                                          year: 'numeric', month: '2-digit', day: '2-digit',
                                          hour: '2-digit', minute: '2-digit'
                                        }) : '—'}
                                      </td>
                                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                                        {c.expires_at ? new Date(c.expires_at).toLocaleString('zh-CN', { 
                                          year: 'numeric', month: '2-digit', day: '2-digit',
                                          hour: '2-digit', minute: '2-digit'
                                        }) : '永久'}
                                      </td>
                                      <td className="px-4 py-3 whitespace-nowrap">
                                        {c.status === 'active' && !expired ? (
                                          <button 
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleRevoke(c.id);
                                            }} 
                                            className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 transition-colors shadow-sm"
                                          >
                                            <i className="fas fa-ban mr-1"></i>
                                            撤回
                                          </button>
                                        ) : c.status === 'revoked' ? (
                                          <button 
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleDelete(c.id);
                                            }} 
                                            className="px-3 py-1.5 bg-gray-600 text-white rounded-lg text-xs font-medium hover:bg-gray-700 transition-colors shadow-sm"
                                          >
                                            <i className="fas fa-trash mr-1"></i>
                                            删除
                                          </button>
                                        ) : (
                                          <span className="text-gray-400 text-xs">—</span>
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
