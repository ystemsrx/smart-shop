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
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Package, Tags, BarChart3, ClipboardList, Banknote, Users, 
  AlertCircle, Gift, Ticket, QrCode, MapPin, UserCog, Settings
} from 'lucide-react';

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
  }, [user, expectedRole, isAdmin]);

  if (!user || user.type !== expectedRole) {
    return null;
  }

  const tabItems = [
    { id: 'products', label: '商品管理', icon: <Package size={18} /> },
    { 
      id: 'orders', 
      label: '订单管理', 
      icon: <ClipboardList size={18} />,
      badge: orderStats.status_counts?.pending > 0 ? orderStats.status_counts.pending : null,
      badgeColor: 'bg-red-500'
    },
    ...(isAdmin ? [
      { id: 'addresses', label: '地址管理', icon: <MapPin size={18} /> },
      { id: 'agents', label: '代理管理', icon: <UserCog size={18} /> }
    ] : []),
    ...(allowedTabs.includes('lottery') ? [{ 
      id: 'lottery', 
      label: '抽奖配置', 
      icon: <Gift size={18} />,
      warning: lotteryHasStockWarning
    }] : []),
    ...(allowedTabs.includes('autoGifts') ? [{ 
      id: 'autoGifts', 
      label: '满额门槛', 
      icon: <Settings size={18} />,
      warning: giftThresholdHasStockWarning
    }] : []),
    ...(allowedTabs.includes('coupons') ? [{ id: 'coupons', label: '优惠券', icon: <Ticket size={18} /> }] : []),
    ...(allowedTabs.includes('paymentQrs') ? [{ id: 'paymentQrs', label: '收款码', icon: <QrCode size={18} /> }] : []),
  ];

  return (
    <>
      <Head>
        <title>{isAdmin ? `管理后台 - ${shopName}` : `代理后台 - ${shopName}`}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      <div className="min-h-screen bg-[#F5F7FA]">
        <Nav active={navActive} />
        
        <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8 pt-28">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-10"
          >
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">{isAdmin ? '管理后台' : '代理后台'}</h1>
            <p className="text-gray-500 mt-2 text-lg">{isAdmin ? '全权掌控您的商品、订单与系统配置。' : '高效管理您负责区域的业务。'}</p>
          </motion.div>

          {isAdmin && (
            <div className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ShopStatusCard />
              <RegistrationSettingsCard />
            </div>
          )}
          {isAgent && <AgentStatusCard />}

          {error && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mb-8 bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl flex items-center gap-2"
            >
              <AlertCircle size={20} />
              {error}
            </motion.div>
          )}

          {!isLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-6 mb-10">
              <StatsCard title="商品总数" value={stats.total_products} icon={<Package />} color="indigo" />
              <StatsCard title="商品分类" value={stats.categories} icon={<Tags />} color="green" />
              <StatsCard title="总库存" value={stats.total_stock} icon={<BarChart3 />} color="yellow" />
              <StatsCard title="订单总数" value={orderStats.total_orders} icon={<ClipboardList />} color="purple" />
              <StatsCard title="总销售额" value={`¥${orderStats.total_revenue}`} icon={<Banknote />} color="blue" />
              <StatsCard title="注册人数" value={stats.users_count} icon={<Users />} color="red" />
            </div>
          )}

          {/* Modern Tabs */}
          <div className="mb-8 overflow-x-auto pb-2 scrollbar-hide">
            <div className="flex space-x-2 min-w-max bg-white/50 p-1.5 rounded-2xl backdrop-blur-sm border border-gray-200/50">
              {tabItems.map((tab) => (
                <button
                  key={tab.id}
                  onClick={async () => {
                    setActiveTab(tab.id);
                    if (tab.id === 'addresses') loadAddresses();
                    if (tab.id === 'agents') loadAgents();
                  }}
                  className={`relative px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 flex items-center gap-2 outline-none ${
                    activeTab === tab.id ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {activeTab === tab.id && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute inset-0 bg-white shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08)] rounded-xl border border-gray-100"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-2">
                    {tab.icon}
                    {tab.label}
                    {tab.badge && (
                      <span className={`ml-1 min-w-[18px] h-[18px] flex items-center justify-center px-1.5 rounded-full text-[10px] font-semibold text-white ${tab.badgeColor}`}>
                        {tab.badge}
                      </span>
                    )}
                    {tab.warning && (
                      <span className="ml-1 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    )}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
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

              {activeTab === 'coupons' && <CouponsPanel apiPrefix={staffPrefix} />}

              {activeTab === 'paymentQrs' && <PaymentQrPanel staffPrefix={staffPrefix} />}

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

              {activeTab === 'lottery' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">抽奖配置</h2>
                    <p className="text-sm text-gray-500 mt-1">点击名称或权重即可编辑，修改后自动保存。</p>
                  </div>
                  <LotteryConfigPanel 
                    apiPrefix={staffPrefix} 
                    onWarningChange={setLotteryHasStockWarning}
                  />
                </div>
              )}

              {activeTab === 'autoGifts' && (
                <div className="space-y-10">
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">配送费设置</h2>
                      <p className="text-sm text-gray-500 mt-1">设置基础配送费和免配送费门槛。</p>                                                      
                    </div>
                    <DeliverySettingsPanel apiPrefix={staffPrefix} />
                  </div>
                  
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">满额门槛</h2>
                      <p className="text-sm text-gray-500 mt-1">设置多个满额门槛，可以选择发放商品或优惠券。</p>                                                      
                    </div>
                    <GiftThresholdPanel 
                      apiPrefix={staffPrefix} 
                      onWarningChange={setGiftThresholdHasStockWarning}
                    />
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </main>

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
