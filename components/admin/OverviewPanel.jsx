import React from 'react';
import { motion } from 'framer-motion';
import { 
  Package, Tags, BarChart3, ClipboardList, Banknote, Users, AlertCircle 
} from 'lucide-react';
import { ShopStatusCard } from './ShopStatusCard';
import { RegistrationSettingsCard } from './RegistrationSettingsCard';
import { AgentStatusCard } from './AgentStatusCard';
import { StatsCard } from './StatsCard';

export function OverviewPanel({ 
  isAdmin, 
  isAgent, 
  stats, 
  orderStats, 
  isLoading, 
  error 
}) {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.04
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 8 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] }
    }
  };

  const statsGridClass = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-6";

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      {/* Header Section */}
      <motion.div variants={itemVariants}>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">概览</h1>
        <p className="text-slate-500 mt-1">
          {isAdmin ? '全权掌控您的商品、订单与系统配置。' : '高效管理您负责区域的业务。'}
        </p>
      </motion.div>

      {/* Error Alert */}
      {error && (
        <motion.div 
          variants={itemVariants}
          className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-2xl flex items-center gap-2"
        >
          <AlertCircle size={20} />
          {error}
        </motion.div>
      )}

      {/* Status Cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {isAdmin && (
          <>
            <ShopStatusCard />
            <RegistrationSettingsCard />
          </>
        )}
        {isAgent && <AgentStatusCard />}
      </motion.div>

      {/* Stats Grid */}
      <motion.div variants={itemVariants}>
        <h2 className="text-lg font-semibold text-slate-900 mb-4">数据统计</h2>
        {isLoading ? (
          <div className={statsGridClass}>
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-28 rounded-2xl skeleton-shimmer" />
            ))}
          </div>
        ) : (
          <div className={statsGridClass}>
            <StatsCard title="商品总数" value={stats.total_products} icon={<Package />} color="indigo" />
            <StatsCard title="商品分类" value={stats.categories} icon={<Tags />} color="green" />
            <StatsCard title="总库存" value={stats.total_stock} icon={<BarChart3 />} color="yellow" />
            <StatsCard title="订单总数" value={orderStats.total_orders} icon={<ClipboardList />} color="purple" />
            <StatsCard title="总销售额" value={`¥${orderStats.total_revenue}`} icon={<Banknote />} color="blue" />
            <StatsCard title="注册人数" value={stats.users_count} icon={<Users />} color="red" />
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
