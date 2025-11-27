import React, { useEffect, useState, useMemo, useCallback } from 'react';
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
import { DeliverySettingsPanel } from '../components/admin/DeliverySettingsPanel';
import { useAdminWarnings } from '../components/admin/hooks/useAdminWarnings';
import { useOrderManagement } from '../components/admin/hooks/useOrderManagement';
import { useAddressManagement } from '../components/admin/hooks/useAddressManagement';
import { useAgentManagement } from '../components/admin/hooks/useAgentManagement';
import { useProductManagement } from '../components/admin/hooks/useProductManagement';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Package, ClipboardList, Gift, Ticket, QrCode, MapPin, UserCog, Settings, LayoutDashboard
} from 'lucide-react';
import { AdminSidebar } from '../components/admin/AdminSidebar';
import { OverviewPanel } from '../components/admin/OverviewPanel';

const ADMIN_TABS = ['overview', 'products', 'orders', 'addresses', 'agents', 'lottery', 'autoGifts', 'coupons', 'paymentQrs'];
const AGENT_TABS = ['overview', 'products', 'orders', 'lottery', 'autoGifts', 'coupons', 'paymentQrs'];

function StaffPortalPage({ role = 'admin', navActive = 'staff-backend', initialTab = 'overview' }) {
  const router = useRouter();
  const { user, logout, isInitialized } = useAuth();
  const { apiRequest: baseApiRequest } = useApi();
  const expectedRole = role === 'agent' ? 'agent' : 'admin';
  const isAdmin = expectedRole === 'admin';
  const isAgent = expectedRole === 'agent';
  const staffPrefix = isAgent ? '/agent' : '/admin';
  const shopName = getShopName();

  const [viewingAgentId, setViewingAgentId] = useState(null);
  const [isSwitchingAgent, setIsSwitchingAgent] = useState(false);

  const initialTabs = isAdmin ? ADMIN_TABS : AGENT_TABS;
  const initialActiveTab = initialTabs.includes(initialTab) ? initialTab : initialTabs[0];
  const [activeTab, setActiveTab] = useState(initialActiveTab);
  const [lastAdminTab, setLastAdminTab] = useState(
    isAdmin ? (ADMIN_TABS.includes(initialActiveTab) ? initialActiveTab : ADMIN_TABS[0]) : null
  );
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const allowedTabs = useMemo(() => {
    if (isAdmin && viewingAgentId) return AGENT_TABS;
    return isAdmin ? ADMIN_TABS : AGENT_TABS;
  }, [isAdmin, viewingAgentId]);

  const isImpersonatingAgent = isAdmin && !!viewingAgentId;
  const isAdminView = isAdmin && !isImpersonatingAgent;
  const isAgentView = isAgent || isImpersonatingAgent;

  const apiRequest = useCallback((endpoint, options = {}) => {
    if (isImpersonatingAgent && typeof endpoint === 'string' && endpoint.startsWith('/admin')) {
      try {
        const url = new URL(endpoint, 'http://placeholder');
        if (viewingAgentId && !url.searchParams.has('owner_id')) {
          url.searchParams.set('owner_id', viewingAgentId);
        }
        const normalized = `${url.pathname}${url.search}`;
        return baseApiRequest(normalized, options);
      } catch (e) {
        const separator = endpoint.includes('?') ? '&' : '?';
        const fallback = viewingAgentId ? `${endpoint}${separator}owner_id=${encodeURIComponent(viewingAgentId)}` : endpoint;
        return baseApiRequest(fallback, options);
      }
    }
    return baseApiRequest(endpoint, options);
  }, [baseApiRequest, isImpersonatingAgent, viewingAgentId]);

  useEffect(() => {
    if (!allowedTabs.includes(activeTab)) {
      setActiveTab(allowedTabs[0]);
    }
  }, [allowedTabs, activeTab]);

  useEffect(() => {
    if (!isAdminView) return;
    setLastAdminTab((prev) => {
      const safeTab = ADMIN_TABS.includes(activeTab) ? activeTab : (prev || ADMIN_TABS[0]);
      return prev === safeTab ? prev : safeTab;
    });
  }, [isAdminView, activeTab]);

  const { toast, showToast, hideToast } = useToast();

  const {
    lotteryHasStockWarning,
    giftThresholdHasStockWarning,
    setLotteryHasStockWarning,
    setGiftThresholdHasStockWarning,
    refreshAllWarnings
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
    refreshAllWarnings,
  });

  const agentSwitcherOptions = useMemo(() => {
    if (!isAdmin) return [];
    const base = [{
      id: 'self',
      name: user?.name || '管理员',
      isActive: true,
      isDeleted: false,
      note: '管理员视角'
    }];
    const normalized = orderAgentOptions
      .filter((agent) => agent && agent.id)
      .map((agent) => ({
        id: agent.id,
        name: agent.name || agent.id,
        isActive: agent.isActive !== false,
        isDeleted: !!agent.isDeleted,
        note: agent.isDeleted ? '已删除' : (agent.isActive === false ? '停用' : '活跃')
      }));
    normalized.sort((a, b) => Number(b.isActive) - Number(a.isActive));
    return [...base, ...normalized];
  }, [isAdmin, orderAgentOptions, user]);

  const selectedAgentName = useMemo(() => {
    if (!viewingAgentId) return '';
    const target = agentSwitcherOptions.find((item) => item.id === viewingAgentId);
    return target?.name || viewingAgentId;
  }, [agentSwitcherOptions, viewingAgentId]);

  const handleAgentSwitch = useCallback(async (agentId) => {
    if (!isAdmin) return;
    const normalized = agentId && agentId !== 'self' ? agentId : null;
    if (isSwitchingAgent) return;
    setIsSwitchingAgent(true);
    try {
      if (!normalized) {
        setViewingAgentId(null);
        await handleOrderAgentFilterChange('self');
        const fallback = (lastAdminTab && ADMIN_TABS.includes(lastAdminTab)) ? lastAdminTab : ADMIN_TABS[0];
        setActiveTab(fallback);
      } else {
        setViewingAgentId(normalized);
        setActiveTab((prev) => (AGENT_TABS.includes(prev) ? prev : AGENT_TABS[0]));
        await handleOrderAgentFilterChange(normalized);
      }
    } finally {
      setIsSwitchingAgent(false);
    }
  }, [isAdmin, isSwitchingAgent, handleOrderAgentFilterChange, lastAdminTab]);

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

  const pageTitle = isAdmin
    ? (isImpersonatingAgent ? `代理视角 - ${shopName}` : `管理后台 - ${shopName}`)
    : `代理后台 - ${shopName}`;
  const currentOwnerLabel = isImpersonatingAgent
    ? (selectedAgentName || viewingAgentId || '目标代理')
    : (user?.name || user?.id || '当前账号');

  const tabItems = [
    { id: 'overview', label: '概览', icon: <LayoutDashboard size={18} /> },
    { id: 'products', label: '商品管理', icon: <Package size={18} /> },
    { 
      id: 'orders', 
      label: '订单管理', 
      icon: <ClipboardList size={18} />,
      badge: orderStats.status_counts?.pending > 0 ? orderStats.status_counts.pending : null,
      badgeColor: 'bg-red-500'
    },
    ...(isAdminView ? [
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
  ].filter((item) => allowedTabs.includes(item.id));

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      <div className="min-h-screen bg-[#F5F7FA] flex flex-col">
        {/* Fixed Top Navigation */}
        <Nav active={navActive} />
        
        <div className="flex flex-1 max-w-[1600px] mx-auto w-full pt-16">
          {/* Sidebar */}
          <AdminSidebar 
            activeTab={activeTab}
            setActiveTab={(id) => {
              setActiveTab(id);
              if (id === 'products') loadData(orderAgentFilter, false, true);
              if (id === 'addresses') loadAddresses();
              if (id === 'agents') loadAgents();
              if (id === 'orders') loadOrders(0, orderSearch, orderAgentFilter);
            }}
            tabs={tabItems}
            isCollapsed={isSidebarCollapsed}
            setIsCollapsed={setIsSidebarCollapsed}
            role={expectedRole}
            onLogout={logout}
            agentOptions={agentSwitcherOptions}
            selectedAgentId={viewingAgentId}
            onAgentSelect={handleAgentSwitch}
            switchDisabled={isSwitchingAgent}
            userName={user?.name || ''}
          />

          {/* Main Content Area */}
          <main className="flex-1 p-6 lg:p-10 overflow-x-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
                className="h-full"
              >
                {activeTab === 'overview' && (
                  <OverviewPanel 
                    isAdmin={isAdminView}
                    isAgent={isAgentView}
                    stats={stats}
                    orderStats={orderStats}
                    isLoading={isLoading}
                    error={error}
                  />
                )}

                {activeTab === 'products' && (
                  <ProductsPanel
                    isAdmin={isAdminView}
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
                    isAdmin={isAdminView}
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
                    currentUserLabel={currentOwnerLabel}
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

                {activeTab === 'coupons' && <CouponsPanel apiPrefix={staffPrefix} apiRequest={apiRequest} />}

                {activeTab === 'paymentQrs' && <PaymentQrPanel staffPrefix={staffPrefix} apiRequest={apiRequest} />}

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
                    setAddresses={setAddresses}
                  />
                )}

                {activeTab === 'lottery' && (
                  <div className="space-y-6">
                    <LotteryConfigPanel 
                      apiPrefix={staffPrefix} 
                      onWarningChange={setLotteryHasStockWarning}
                      apiRequest={apiRequest}
                    />
                  </div>
                )}

                {activeTab === 'autoGifts' && (
                  <div className="space-y-10">
                    <div className="space-y-6">
                      <DeliverySettingsPanel apiPrefix={staffPrefix} apiRequest={apiRequest} />
                    </div>
                    
                    <div className="space-y-6">
                      <GiftThresholdPanel 
                        apiPrefix={staffPrefix} 
                        onWarningChange={setGiftThresholdHasStockWarning}
                        apiRequest={apiRequest}
                      />
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>

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
            isAdmin={isAdminView}
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
              isAdmin={isAdminView}
              onStatsRefresh={refreshStats}
            />
          )}
        </Modal>

        <AnimatePresence>
          {variantStockProduct && (
            <VariantStockModal
              key="variant-stock-modal"
              product={variantStockProduct}
              onClose={() => setVariantStockProduct(null)}
              apiPrefix={staffPrefix}
              onProductVariantsSync={handleProductVariantsSync}
              onStatsRefresh={refreshStats}
              onWarningsRefresh={refreshAllWarnings}
            />
          )}
        </AnimatePresence>

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
      initialTab="overview"
    />
  );
}
