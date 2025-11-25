import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import { useAuth, useApi } from '../hooks/useAuth';
import { useRouter } from 'next/router';
import Toast from '../components/Toast';
import Nav from '../components/Nav';
import { getShopName } from '../utils/runtimeConfig';
import { useToast } from '../hooks/useToast';
import { Modal } from '../components/admin/Modal';
import { ProductsPanel, ProductForm, VariantStockModal } from '../components/admin/products';
import { OrdersPanel } from '../components/admin/orders';
import { AgentManagement } from '../components/admin/AgentManagement';
import { AddressManagement } from '../components/admin/AddressManagement';
import { LotteryConfigPanel } from '../components/admin/LotteryConfigPanel';
import { GiftThresholdPanel } from '../components/admin/GiftThresholdPanel';
import { CouponsPanel } from '../components/admin/CouponsPanel';
import { PaymentQrPanel } from '../components/admin/PaymentQrPanel';
import { AgentStatusCard } from '../components/admin/AgentStatusCard';
import { RegistrationSettingsCard } from '../components/admin/RegistrationSettingsCard';
import { ShopStatusCard } from '../components/admin/ShopStatusCard';
import { DeliverySettingsPanel } from '../components/admin/DeliverySettingsPanel';
import { StatsCard } from '../components/admin/StatsCard';
import { useAdminWarnings } from '../components/admin/hooks/useAdminWarnings';
import { useOrderManagement } from '../components/admin/hooks/useOrderManagement';
import { useAddressManagement } from '../components/admin/hooks/useAddressManagement';
import { useAgentManagement } from '../components/admin/hooks/useAgentManagement';
import { useProductManagement } from '../components/admin/hooks/useProductManagement';


function StaffPortalPage({ role = 'admin', navActive = 'staff-backend', initialTab = 'products' }) {
  const router = useRouter();
  const { user, logout, isInitialized } = useAuth();
  const { apiRequest } = useApi();
  const expectedRole = role === 'agent' ? 'agent' : 'admin';
  const isAdmin = expectedRole === 'admin';
  const isAgent = expectedRole === 'agent';
  const staffPrefix = isAgent ? '/agent' : '/admin';
  const shopName = getShopName();
  const allowedTabs = isAdmin
    ? ['products', 'orders', 'addresses', 'agents', 'lottery', 'autoGifts', 'coupons', 'paymentQrs']
    : ['products', 'orders', 'lottery', 'autoGifts', 'coupons', 'paymentQrs'];
  const { toast, showToast, hideToast } = useToast();
  const [activeTab, setActiveTab] = useState(
    allowedTabs.includes(initialTab) ? initialTab : allowedTabs[0]
  );

  const {
    lotteryHasStockWarning,
    giftThresholdHasStockWarning,
    setLotteryHasStockWarning,
    setGiftThresholdHasStockWarning
  } = useAdminWarnings({ user, expectedRole, staffPrefix, apiRequest });

  const {
    orders,
    orderStats,
    orderStatusFilter,
    setOrderStatusFilter,
    orderPage,
    orderHasMore,
    orderTotal,
    orderSearch,
    setOrderSearch,
    orderLoading,
    orderExporting,
    orderAgentFilter,
    setOrderAgentFilter,
    orderAgentOptions,
    setOrderAgentOptions,
    orderAgentFilterLabel,
    orderAgentNameMap,
    selectedOrders,
    handleOrderRefresh,
    handleExportOrders,
    handlePrevPage,
    handleNextPage,
    handleOrderAgentFilterChange,
    handleSelectOrder,
    handleSelectAllOrders,
    handleBatchDeleteOrders,
    handleUpdateUnifiedStatus,
    loadOrders,
    setOnAgentFilterChange,
    setOrderStats
  } = useOrderManagement({ apiRequest, staffPrefix, isAdmin, user, showToast });

  const {
    addresses,
    setAddresses,
    addrLoading,
    addrSubmitting,
    newAddrName,
    setNewAddrName,
    buildingsByAddress,
    setBuildingsByAddress,
    newBldNameMap,
    setNewBldNameMap,
    bldDragState,
    setBldDragState,
    loadAddresses,
    onAddressDragStart,
    onAddressDragOver,
    onAddressDragEnd,
    handleAddAddress,
    handleUpdateAddress,
    handleDeleteAddress,
    handleAddBuilding,
    buildingLabelMap,
  } = useAddressManagement({ apiRequest, isAdmin });

  const {
    agents,
    deletedAgents,
    agentError,
    agentLoading,
    agentModalOpen,
    showDeletedAgentsModal,
    editingAgent,
    agentForm,
    agentSaving,
    loadAgents,
    openAgentModal,
    closeAgentModal,
    toggleAgentBuilding,
    setAgentForm,
    handleAgentSave,
    handleAgentStatusToggle,
    handleAgentDelete,
    handleAgentQrUpload,
    setShowDeletedAgentsModal,
  } = useAgentManagement({ apiRequest, isAdmin, setOrderAgentOptions });

  const {
    stats,
    categories,
    products,
    isLoading,
    isSubmitting,
    error,
    showAddModal,
    setShowAddModal,
    showEditModal,
    setShowEditModal,
    editingProduct,
    setEditingProduct,
    variantStockProduct,
    setVariantStockProduct,
    selectedProducts,
    productCategoryFilter,
    setProductCategoryFilter,
    showOnlyOutOfStock,
    setShowOnlyOutOfStock,
    showOnlyInactive,
    setShowOnlyInactive,
    sortBy,
    sortOrder,
    showInactiveInShop,
    isLoadingShopSetting,
    operatingProducts,
    updateShopInactiveSetting,
    loadData,
    handleAddProduct,
    handleEditProduct,
    refreshSingleProduct,
    refreshStats,
    handleUpdateDiscount,
    handleBatchUpdateDiscount,
    handleToggleActive,
    handleToggleHot,
    handleUpdateStock,
    handleProductVariantsSync,
    handleDeleteProduct,
    handleSelectProduct,
    handleSelectAllProducts,
    handleBatchDelete,
    handleBatchToggleActive,
    handleSortClick,
    visibleProducts,
  } = useProductManagement({
    apiRequest,
    staffPrefix,
    isAdmin,
    user,
    expectedRole,
    orderAgentFilter,
    orderSearch,
    loadOrders,
    setOrderStats,
    setAddresses,
  });

  // 检查管理员权限
  useEffect(() => {
    if (!isInitialized) return;
    if (!user) {
      router.replace('/login');
      return;
    }

    if (user.type !== expectedRole) {
      const fallback = user.type === 'admin'
        ? '/admin/dashboard'
        : user.type === 'agent'
          ? '/agent/dashboard'
          : '/';
      router.replace(fallback);
    }
  }, [isInitialized, user, expectedRole, router]);
  useEffect(() => {
    setOnAgentFilterChange((nextFilter) => loadData(nextFilter, false, false));
  }, [setOnAgentFilterChange, loadData]);

  useEffect(() => {
    if (!user || user.type !== expectedRole) return;
    loadData('self');
    if (isAdmin) {
      loadAddresses();
      loadAgents();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, expectedRole, isAdmin]);

  // 非授权账号不渲染
  if (!user || user.type !== expectedRole) {
    return null;
  }

  return (
    <>
      <Head>
        <title>{isAdmin ? `管理后台 - ${shopName}` : `代理后台 - ${shopName}`}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      <div className="min-h-screen bg-gray-50">
        {/* 统一导航栏 */}
        <Nav active={navActive} />
        
        {/* 主要内容 */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pt-24">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900">{isAdmin ? '管理后台' : '代理后台'}</h1>
            <p className="text-gray-600 mt-1">{isAdmin ? '管理商品、订单与系统配置。' : '管理您负责区域的商品与订单。'}</p>
          </div>

          {/* 状态开关 */}
          {isAdmin && (
            <div className="mb-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ShopStatusCard />
              <RegistrationSettingsCard />
            </div>
          )}
          {isAgent && <AgentStatusCard />}



          {/* 错误提示 */}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* 统计卡片 */}
          {!isLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-6 mb-8">
              <StatsCard
                title="商品总数"
                value={stats.total_products}
                icon="📦"
                color="indigo"
              />
              <StatsCard
                title="商品分类"
                value={stats.categories}
                icon="🏷️"
                color="green"
              />
              <StatsCard
                title="总库存"
                value={stats.total_stock}
                icon="📊"
                color="yellow"
              />
              <StatsCard
                title="订单总数"
                value={orderStats.total_orders}
                icon="📋"
                color="purple"
              />
              <StatsCard
                title="总销售额"
                value={`¥${orderStats.total_revenue}`}
                icon="💰"
                color="indigo"
              />
              <StatsCard
                title="注册人数"
                value={stats.users_count}
                icon="🧑‍💻"
                color="green"
              />
            </div>
          )}

          {/* 选项卡导航 */}
          <div className="mb-8">
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex space-x-8">
                <button
                  onClick={() => {
                    setActiveTab('products');
                    loadData(orderAgentFilter, false, false);
                  }}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'products'
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  商品管理
                </button>
                <button
                  onClick={async () => {
                    setActiveTab('orders');
                    await Promise.all([
                      loadOrders(0, orderSearch, orderAgentFilter),
                      loadData(orderAgentFilter, false, false)
                    ]);
                  }}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'orders'
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  订单管理
                  {orderStats.status_counts?.pending > 0 && (
                    <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                      {orderStats.status_counts.pending}
                    </span>
                  )}
                </button>
                {isAdmin && (
                  <>
                    <button
                      onClick={() => {
                        setActiveTab('addresses');
                        loadAddresses();
                      }}
                      className={`py-2 px-1 border-b-2 font-medium text-sm ${
                        activeTab === 'addresses'
                          ? 'border-indigo-500 text-indigo-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      地址管理
                    </button>
                    <button
                      onClick={() => {
                        setActiveTab('agents');
                        loadAgents();
                      }}
                      className={`py-2 px-1 border-b-2 font-medium text-sm ${
                        activeTab === 'agents'
                          ? 'border-indigo-500 text-indigo-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      代理管理
                    </button>
                  </>
                )}
                {allowedTabs.includes('lottery') && (
                  <button
                    onClick={() => setActiveTab('lottery')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'lottery'
                        ? 'border-indigo-500 text-indigo-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    抽奖配置
                    {lotteryHasStockWarning && (
                      <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        <i className="fas fa-exclamation text-red-600"></i>
                      </span>
                    )}
                  </button>
                )}
                {allowedTabs.includes('autoGifts') && (
                  <button
                    onClick={() => setActiveTab('autoGifts')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'autoGifts'
                        ? 'border-indigo-500 text-indigo-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    满额门槛
                    {giftThresholdHasStockWarning && (
                      <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        <i className="fas fa-exclamation text-red-600"></i>
                      </span>
                    )}
                  </button>
                )}
                {allowedTabs.includes('coupons') && (
                  <button
                    onClick={() => setActiveTab('coupons')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'coupons'
                        ? 'border-indigo-500 text-indigo-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    优惠券管理
                  </button>
                )}
                {allowedTabs.includes('paymentQrs') && (
                  <button
                    onClick={() => setActiveTab('paymentQrs')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'paymentQrs'
                        ? 'border-indigo-500 text-indigo-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    收款码管理
                  </button>
                )}
              </nav>
            </div>
          </div>

          {/* 商品管理 */}
          {activeTab === 'products' && (
            <ProductsPanel
              isAdmin={isAdmin}
              showInactiveInShop={showInactiveInShop}
              updateShopInactiveSetting={updateShopInactiveSetting}
              isLoadingShopSetting={isLoadingShopSetting}
              onAddClick={() => setShowAddModal(true)}
              categories={categories}
              productCategoryFilter={productCategoryFilter}
              onProductCategoryFilterChange={setProductCategoryFilter}
              isLoading={isLoading}
              visibleProducts={visibleProducts}
              onRefreshProducts={() => loadData(orderAgentFilter, true, true)}
              onEditProduct={(product) => {
                setEditingProduct(product);
                setShowEditModal(true);
              }}
              onDeleteProduct={handleDeleteProduct}
              onUpdateStock={handleUpdateStock}
              onBatchDelete={handleBatchDelete}
              onBatchUpdateDiscount={handleBatchUpdateDiscount}
              onBatchToggleActive={handleBatchToggleActive}
              selectedProducts={selectedProducts}
              onSelectProduct={handleSelectProduct}
              onSelectAllProducts={handleSelectAllProducts}
              onUpdateDiscount={handleUpdateDiscount}
              onToggleActive={handleToggleActive}
              onOpenVariantStock={(p) => setVariantStockProduct(p)}
              onToggleHot={handleToggleHot}
              showOnlyOutOfStock={showOnlyOutOfStock}
              showOnlyInactive={showOnlyInactive}
              onToggleOutOfStockFilter={setShowOnlyOutOfStock}
              onToggleInactiveFilter={setShowOnlyInactive}
              operatingProducts={operatingProducts}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortClick={handleSortClick}
            />
          )}

          {/* 订单管理 */}
          {activeTab === 'orders' && (
            <OrdersPanel
              isAdmin={isAdmin}
              orderAgentFilter={orderAgentFilter}
              orderAgentOptions={orderAgentOptions}
              orderAgentFilterLabel={orderAgentFilterLabel}
              orderLoading={orderLoading}
              orders={orders}
              orderStatusFilter={orderStatusFilter}
              onOrderStatusFilterChange={setOrderStatusFilter}
              orderExporting={orderExporting}
              onExportOrders={handleExportOrders}
              orderStats={orderStats}
              onOrderAgentFilterChange={handleOrderAgentFilterChange}
              selectedOrders={selectedOrders}
              onSelectOrder={handleSelectOrder}
              onSelectAllOrders={handleSelectAllOrders}
              onBatchDeleteOrders={handleBatchDeleteOrders}
              onRefreshOrders={() => handleOrderRefresh()}
              orderSearch={orderSearch}
              onOrderSearchChange={setOrderSearch}
              orderPage={orderPage}
              orderHasMore={orderHasMore}
              onPrevPage={handlePrevPage}
              onNextPage={handleNextPage}
              agentNameMap={orderAgentNameMap}
              isSubmitting={isSubmitting}
              currentUserLabel={user?.name || user?.id || '当前账号'}
              onUpdateUnifiedStatus={handleUpdateUnifiedStatus}
            />
          )}

          {activeTab === 'agents' && (
            <AgentManagement
              agents={agents}
              deletedAgents={deletedAgents}
              agentError={agentError}
              agentLoading={agentLoading}
              agentModalOpen={agentModalOpen}
              showDeletedAgentsModal={showDeletedAgentsModal}
              editingAgent={editingAgent}
              agentForm={agentForm}
              agentSaving={agentSaving}
              addresses={addresses}
              buildingsByAddress={buildingsByAddress}
              buildingLabelMap={buildingLabelMap}
              loadAgents={loadAgents}
              openAgentModal={openAgentModal}
              closeAgentModal={closeAgentModal}
              toggleAgentBuilding={toggleAgentBuilding}
              setAgentForm={setAgentForm}
              handleAgentSave={handleAgentSave}
              handleAgentStatusToggle={handleAgentStatusToggle}
              handleAgentDelete={handleAgentDelete}
              setShowDeletedAgentsModal={setShowDeletedAgentsModal}
            />
          )}

          {/* 优惠券管理 */}
          {activeTab === 'coupons' && (
            <CouponsPanel apiPrefix={staffPrefix} />
          )}

          {/* 收款码管理 */}
          {activeTab === 'paymentQrs' && (
            <PaymentQrPanel staffPrefix={staffPrefix} />
          )}

          {/* 地址管理 */}
          {activeTab === 'addresses' && (
            <AddressManagement
              addresses={addresses}
              agents={agents}
              buildingsByAddress={buildingsByAddress}
              addrLoading={addrLoading}
              addrSubmitting={addrSubmitting}
              newAddrName={newAddrName}
              setNewAddrName={setNewAddrName}
              newBldNameMap={newBldNameMap}
              setNewBldNameMap={setNewBldNameMap}
              bldDragState={bldDragState}
              setBldDragState={setBldDragState}
              loadAddresses={loadAddresses}
              handleAddAddress={handleAddAddress}
              handleUpdateAddress={handleUpdateAddress}
              handleDeleteAddress={handleDeleteAddress}
              handleAddBuilding={handleAddBuilding}
              onAddressDragStart={onAddressDragStart}
              onAddressDragOver={onAddressDragOver}
              onAddressDragEnd={onAddressDragEnd}
              setBuildingsByAddress={setBuildingsByAddress}
              apiRequest={apiRequest}
            />
          )}

          {/* 抽奖配置 */}
          {activeTab === 'lottery' && (
            <>
              <div className="mb-6">
                <h2 className="text-lg font-medium text-gray-900">抽奖配置</h2>
                <p className="text-sm text-gray-600 mt-1">点击名称或权重即可编辑，修改后自动保存。</p>
              </div>
              <LotteryConfigPanel 
                apiPrefix={staffPrefix} 
                onWarningChange={setLotteryHasStockWarning}
              />
            </>
          )}

          {activeTab === 'autoGifts' && (
            <>
              <div className="mb-6">
                <h2 className="text-lg font-medium text-gray-900">配送费设置</h2>
                <p className="text-sm text-gray-600 mt-1">设置基础配送费和免配送费门槛。</p>                                                      
              </div>
              <DeliverySettingsPanel apiPrefix={staffPrefix} />
              
              <div className="mb-6 mt-8">
                <h2 className="text-lg font-medium text-gray-900">满额门槛</h2>
                <p className="text-sm text-gray-600 mt-1">设置多个满额门槛，可以选择发放商品或优惠券。</p>                                                      
              </div>
              <GiftThresholdPanel 
                apiPrefix={staffPrefix} 
                onWarningChange={setGiftThresholdHasStockWarning}
              />
            </>
          )}
        </main>

        {/* 商品表单弹窗（添加或编辑） */}
        <Modal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          title="添加商品"
          size="large"
        >
          <ProductForm
            onSubmit={handleAddProduct}
            isLoading={isSubmitting}
            onCancel={() => setShowAddModal(false)}
            apiPrefix={staffPrefix}
            isAdmin={isAdmin}
            onStatsRefresh={refreshStats}
          />
        </Modal>

        <Modal
          isOpen={showEditModal}
          onClose={() => {
            // 点击关闭不应用变更，直接关闭
            setShowEditModal(false);
            setEditingProduct(null);
          }}
          title="编辑"
          size="large"
        >
          {editingProduct && (
            <ProductForm
              product={editingProduct}
              onSubmit={handleEditProduct}
              isLoading={isSubmitting}
              onCancel={() => {
                // 点击取消不应用变更，直接关闭
                setShowEditModal(false);
                setEditingProduct(null);
              }}
              onRefreshProduct={refreshSingleProduct}
              apiPrefix={staffPrefix}
              isAdmin={isAdmin}
              onStatsRefresh={refreshStats}
            />
          )}
        </Modal>

        {variantStockProduct && (
          <VariantStockModal
            product={variantStockProduct}
            onClose={() => setVariantStockProduct(null)}
            apiPrefix={staffPrefix}
            onProductVariantsSync={handleProductVariantsSync}
            onStatsRefresh={refreshStats}
          />
        )}

        <Toast message={toast.message} show={toast.visible} onClose={hideToast} />
      </div>
    </>
  );
}

export function StaffPortal(props) {
  return <StaffPortalPage {...props} />;
}

export default function AdminPage() {
  return (
    <StaffPortalPage
      role="admin"
      navActive="staff-backend"
      initialTab="products"
    />
  );
}
