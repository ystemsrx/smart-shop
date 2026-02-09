import React, { useEffect, useState } from "react";
import { useAgentStatus } from "../../hooks/useAuth";
import { motion } from "framer-motion";

export const AgentStatusCard = () => {
  const { getStatus, updateStatus } = useAgentStatus();
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(true);
  const [closedNote, setClosedNote] = useState("");
  const [allowReservation, setAllowReservation] = useState(false);
  const [cycleLocked, setCycleLocked] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const s = await getStatus();
        setIsOpen(!!s.data?.is_open);
        setClosedNote(s.data?.closed_note || "");
        setAllowReservation(!!s.data?.allow_reservation);
        setCycleLocked(!!s.data?.cycle_locked);
      } catch (e) {
        console.error("Failed to fetch agent status:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggle = async () => {
    if (cycleLocked) return;
    const next = !isOpen;
    setIsOpen(next);
    try {
      await updateStatus(next, closedNote, allowReservation);
    } catch (e) {
      console.error("Failed to update agent status:", e);
      setIsOpen(!next);
    }
  };

  const saveNote = async () => {
    try {
      await updateStatus(isOpen, closedNote, allowReservation);
    } catch (e) {
      console.error("Failed to save closed note:", e);
    }
  };

  const toggleReservation = async () => {
    if (cycleLocked) return;
    const next = !allowReservation;
    setAllowReservation(next);
    try {
      await updateStatus(isOpen, closedNote, next);
    } catch (e) {
      console.error("Failed to update reservation status:", e);
      setAllowReservation(!next);
    }
  };

  if (loading) {
    return (
      <>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 h-full">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-100 rounded w-1/4"></div>
            <div className="h-10 bg-gray-100 rounded w-1/3"></div>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 h-full">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-100 rounded w-1/4"></div>
            <div className="h-10 bg-gray-100 rounded w-1/3"></div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* 店铺状态卡片 - 与ShopStatusCard样式完全一致 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] border border-gray-100 p-6 h-full flex flex-col justify-between"
      >
        <div className="flex flex-col sm:flex-row gap-6 h-full">
          {/* 左侧：状态和按钮 */}
          <div className="flex-shrink-0 flex flex-col justify-between min-w-[140px]">
            <div>
              <div className="text-sm font-medium text-gray-500 mb-1">
                代理状态
              </div>
              <div
                className={`text-2xl font-bold tracking-tight mb-4 ${isOpen ? "text-green-600" : "text-red-600"}`}
              >
                {isOpen ? "营业中" : "打烊中"}
              </div>
            </div>
            <motion.button
              whileHover={cycleLocked ? undefined : { scale: 1.02 }}
              whileTap={cycleLocked ? undefined : { scale: 0.98 }}
              onClick={toggle}
              disabled={cycleLocked}
              className={`w-full px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                isOpen
                  ? "bg-red-500 hover:bg-red-600 shadow-red-200"
                  : "bg-green-500 hover:bg-green-600 shadow-green-200"
              }`}
            >
              {isOpen ? "设为打烊" : "设为营业"}
            </motion.button>
            {cycleLocked && (
              <div className="mt-3 text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                当前周期已结束，请先在仪表盘撤销或开启新周期。
              </div>
            )}
          </div>

          {/* 右侧：打烊提示语输入框 */}
          <div className="flex-1 flex flex-col">
            <div className="text-sm font-medium text-gray-500 mb-2">
              打烊提示语
            </div>
            <textarea
              placeholder="可输入打烊时显示给顾客的提示信息..."
              value={closedNote}
              onChange={(e) => setClosedNote(e.target.value)}
              onBlur={saveNote}
              className="w-full flex-1 min-h-[80px] px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none"
            />
          </div>
        </div>
      </motion.div>

      {/* 预约下单卡片 - 与RegistrationSettingsCard样式完全一致 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white rounded-2xl shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] border border-gray-100 p-6 h-full"
      >
        <div className="flex flex-col justify-between h-full">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-gray-500">预约下单</div>
              <div
                className={`text-sm font-bold px-2 py-0.5 rounded-full ${allowReservation ? "bg-teal-50 text-teal-600" : "bg-gray-100 text-gray-500"}`}
              >
                {allowReservation ? "已开启" : "未开启"}
              </div>
            </div>
            <p className="text-xs text-gray-400 mb-4 leading-relaxed">
              开启后，店铺打烊时用户仍可提交预约订单。
            </p>
          </div>
          <motion.button
            whileHover={cycleLocked ? undefined : { scale: 1.02 }}
            whileTap={cycleLocked ? undefined : { scale: 0.98 }}
            onClick={toggleReservation}
            disabled={cycleLocked}
            className={`w-full px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
              allowReservation
                ? "bg-slate-500 hover:bg-slate-600 shadow-slate-200"
                : "bg-teal-500 hover:bg-teal-600 shadow-teal-200"
            }`}
          >
            {allowReservation ? "关闭预约" : "开启预约"}
          </motion.button>
          {cycleLocked && (
            <div className="mt-3 text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              当前周期已结束，请先在仪表盘撤销或开启新周期。
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
};

export default AgentStatusCard;
