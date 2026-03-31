import React, { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Gift,
  List,
  Loader2,
  Package,
  Search,
  ShoppingCart,
  Terminal,
  Ticket,
  Users,
  XCircle,
} from "lucide-react";

import { cx } from "../../utils/shared";

const ToolCallCard = ({
  tool_call_id,
  status = "running",
  function_name = "",
  arguments_text = "",
  result_summary = "",
  error_message = "",
  result_details = "",
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const isRunning = status === "running";
  const isSuccess = status === "success";
  const isError = status === "error";

  const getDisplayName = (name) => {
    const nameMap = {
      search_products: "搜索商品",
      update_cart: "更新购物车",
      get_cart: "查看购物车",
      get_category: "浏览分类",
      manage_products: "商品管理",
      manage_orders: "订单管理",
      manage_lottery: "抽奖配置",
      manage_gift_thresholds: "满额门槛",
      manage_coupons: "优惠券管理",
      search_users: "搜索用户",
    };
    return nameMap[name] || name;
  };

  const displayName = getDisplayName(function_name);

  const safeParse = (input) => {
    if (input !== null && typeof input === "object") {
      return input;
    }
    if (input === undefined || input === null || input === "") {
      return null;
    }
    if (typeof input === "string") {
      try {
        return JSON.parse(input);
      } catch {
        return null;
      }
    }
    return null;
  };

  const args = safeParse(arguments_text);
  const result = safeParse(result_summary);
  const pickUserId = (...values) => {
    for (const value of values) {
      if (value === undefined || value === null) continue;
      const text = String(value).trim();
      if (text) return text;
    }
    return "";
  };

  const getToolStyle = (name) => {
    if (name === "search_products") return { icon: Search, color: "blue", bg: "bg-blue-50", border: "border-blue-100", text: "text-blue-600" };
    if (name === "update_cart" || name === "get_cart") return { icon: ShoppingCart, color: "orange", bg: "bg-orange-50", border: "border-orange-100", text: "text-orange-600" };
    if (name === "get_category") return { icon: List, color: "purple", bg: "bg-purple-50", border: "border-purple-100", text: "text-purple-600" };
    if (name === "manage_products") return { icon: Package, color: "indigo", bg: "bg-indigo-50", border: "border-indigo-100", text: "text-indigo-600" };
    if (name === "manage_orders") return { icon: ClipboardList, color: "emerald", bg: "bg-emerald-50", border: "border-emerald-100", text: "text-emerald-600" };
    if (name === "manage_lottery") return { icon: Gift, color: "amber", bg: "bg-amber-50", border: "border-amber-100", text: "text-amber-600" };
    if (name === "manage_gift_thresholds") return { icon: Gift, color: "rose", bg: "bg-rose-50", border: "border-rose-100", text: "text-rose-600" };
    if (name === "manage_coupons") return { icon: Ticket, color: "violet", bg: "bg-violet-50", border: "border-violet-100", text: "text-violet-600" };
    if (name === "search_users") return { icon: Users, color: "cyan", bg: "bg-cyan-50", border: "border-cyan-100", text: "text-cyan-600" };
    return { icon: Terminal, color: "gray", bg: "bg-gray-50", border: "border-gray-100", text: "text-gray-600" };
  };

  const style = getToolStyle(function_name);
  const Icon = style.icon;
  const orderStatusColors = {
    unpaid: "bg-slate-100 text-slate-700",
    pending_confirm: "bg-amber-100 text-amber-700",
    awaiting_delivery: "bg-blue-100 text-blue-700",
    delivering: "bg-purple-100 text-purple-700",
    completed: "bg-emerald-100 text-emerald-700",
    cancelled: "bg-gray-100 text-gray-600",
    pending: "bg-amber-100 text-amber-700",
    confirmed: "bg-blue-100 text-blue-700",
    shipped: "bg-purple-100 text-purple-700",
    delivered: "bg-emerald-100 text-emerald-700",
    未付款: "bg-slate-100 text-slate-700",
    待确认: "bg-amber-100 text-amber-700",
    待配送: "bg-blue-100 text-blue-700",
    配送中: "bg-purple-100 text-purple-700",
    已完成: "bg-emerald-100 text-emerald-700",
    已取消: "bg-gray-100 text-gray-600",
  };
  const orderStatusLabels = {
    unpaid: "未付款",
    pending_confirm: "待确认",
    awaiting_delivery: "待配送",
    delivering: "配送中",
    completed: "已完成",
    cancelled: "已取消",
    pending: "待确认",
    confirmed: "待配送",
    shipped: "配送中",
    delivered: "已完成",
    未付款: "未付款",
    待确认: "待确认",
    待配送: "待配送",
    配送中: "配送中",
    已完成: "已完成",
    已取消: "已取消",
  };

  const renderOrderStatusChip = (statusValue) => {
    const normalized = statusValue || "";
    return (
      <span className={cx("px-1.5 py-0.5 rounded text-xs font-medium shrink-0", orderStatusColors[normalized] || "bg-gray-100 text-gray-500")}>
        {orderStatusLabels[normalized] || normalized || "未知状态"}
      </span>
    );
  };

  const renderOrderItemsCompact = (items) => {
    if (!Array.isArray(items) || items.length === 0) return null;
    const visibleItems = items.slice(0, 3);
    return (
      <div className="mt-2 space-y-1.5">
        {visibleItems.map((item, index) => (
          <div key={`${item.product_id || item.name || "item"}-${index}`} className="flex items-center justify-between gap-3 rounded-md border border-gray-100 bg-gray-50 px-2.5 py-2 text-xs">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-medium text-gray-800 truncate">{item.name || "未命名商品"}</span>
                {item.variant_name && <span className="rounded bg-white px-1.5 py-0.5 text-[10px] text-gray-500 border border-gray-200">{item.variant_name}</span>}
                {item.is_auto_gift && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-600 border border-emerald-100">赠品</span>}
                {item.is_lottery && <span className="rounded bg-pink-50 px-1.5 py-0.5 text-[10px] text-pink-600 border border-pink-100">抽奖</span>}
              </div>
              <div className="mt-1 text-[11px] text-gray-500">
                x{item.quantity || 0}
                {item.unit_price != null ? ` · 单价 ¥${Number(item.unit_price || 0).toFixed(2)}` : ""}
              </div>
            </div>
            <span className="shrink-0 font-medium text-gray-700">¥{Number(item.subtotal || 0).toFixed(2)}</span>
          </div>
        ))}
        {items.length > visibleItems.length && <div className="text-center text-[11px] text-gray-400">还有 {items.length - visibleItems.length} 件商品...</div>}
      </div>
    );
  };

  const renderOrderDiscountMeta = (order) => {
    const discountAmount = Number(order?.discount_amount || 0);
    if (!discountAmount || discountAmount <= 0) return null;
    return (
      <div className="mt-1 text-xs text-pink-500">
        已用优惠券优惠 ¥{discountAmount.toFixed(2)}
        {order?.coupon_id ? <span className="ml-1 font-mono text-[11px] text-pink-400">({order.coupon_id})</span> : null}
      </div>
    );
  };

  const renderArguments = () => {
    if ((function_name === "get_cart" || function_name === "get_category") && (!args || Object.keys(args).length === 0)) {
      return null;
    }

    if (!args) return <div className="font-mono text-xs text-gray-500 break-all">{arguments_text}</div>;

    if (function_name === "search_products") {
      const q = args.query;
      const queryStr = Array.isArray(q) ? q.join(", ") : q;
      return (
        <div className="flex flex-col gap-1 text-sm">
          <div className="flex gap-2"><span className="text-gray-500 min-w-[4rem]">关键词</span> <span className="font-medium text-gray-900">{queryStr}</span></div>
          {args.price_range && <div className="flex gap-2"><span className="text-gray-500 min-w-[4rem]">价格区间</span> <span className="text-gray-900">{args.price_range}</span></div>}
          {args.sort && <div className="flex gap-2"><span className="text-gray-500 min-w-[4rem]">排序</span> <span className="text-gray-900">{args.sort}</span></div>}
        </div>
      );
    }

    if (function_name === "update_cart") {
      const actionMap = { add: "添加商品", remove: "移除商品", update: "更新数量", clear: "清空购物车" };
      const productNames = result?.product_names || [];
      const itemsArray = Array.isArray(args.items) ? args.items : [];
      const productCount = itemsArray.length;
      const quantities = itemsArray.map((item) => item.quantity ?? 1).filter((quantity) => quantity !== undefined);
      const quantityDisplay = quantities.length > 1 ? quantities.join(", ") : quantities[0] ?? null;
      const hasQuantity = quantities.length > 0 && args.action !== "clear";

      let productDisplay = null;
      if (productNames.length > 0) {
        const displayNames = productNames.slice(0, 3).join("、");
        const moreCount = productNames.length - 3;
        productDisplay = moreCount > 0 ? `${displayNames} 等${productNames.length}件` : displayNames;
      } else if (productCount > 0) {
        productDisplay = `${productCount} 件商品`;
      }

      return (
        <div className="flex flex-col gap-1 text-sm">
          <div className="flex gap-2"><span className="text-gray-500 min-w-[4rem]">操作</span> <span className="font-medium text-gray-900">{actionMap[args.action] || args.action}</span></div>
          {productDisplay && <div className="flex gap-2"><span className="text-gray-500 min-w-[4rem]">商品</span> <span className="text-gray-900">{productDisplay}</span></div>}
          {hasQuantity && <div className="flex gap-2"><span className="text-gray-500 min-w-[4rem]">数量</span> <span className="text-gray-900">{quantityDisplay}</span></div>}
        </div>
      );
    }

    const Row = ({ label, children }) => (
      <div className="flex gap-2 text-sm"><span className="text-gray-500 min-w-[4rem] shrink-0">{label}</span><span className="text-gray-900 min-w-0">{children}</span></div>
    );

    if (function_name === "manage_products") {
      const action = args.action;
      const products = args.products || [];
      if (action === "categories") return <Row label="操作"><span className="font-medium">查看所有分类</span></Row>;
      if (action === "list") {
        return (
          <div className="flex flex-col gap-1">
            <Row label="操作"><span className="font-medium">浏览商品列表</span></Row>
            {args.category && <Row label="分类">{args.category}</Row>}
            <Row label="分页">第 {(args.page || 0) + 1} 页，每页 {args.limit || 20} 条</Row>
          </div>
        );
      }
      if (action === "search") {
        return (
          <div className="flex flex-col gap-1">
            <Row label="操作"><span className="font-medium">搜索商品</span></Row>
            <Row label="关键词"><span className="font-medium">{args.query}</span></Row>
            {args.page > 0 && <Row label="分页">第 {args.page + 1} 页</Row>}
          </div>
        );
      }
      if (action === "add" && products[0]) {
        const product = products[0];
        return (
          <div className="flex flex-col gap-1">
            <Row label="操作"><span className="font-medium">添加商品</span></Row>
            <Row label="名称"><span className="font-medium">{product.name}</span></Row>
            {product.category && <Row label="分类">{product.category}</Row>}
            {product.price != null && <Row label="价格">¥{product.price}</Row>}
            {product.stock != null && <Row label="库存">{product.stock}</Row>}
            {product.discount != null && product.discount < 10 && <Row label="折扣">{product.discount} 折</Row>}
            {product.cost != null && product.cost > 0 && <Row label="成本">¥{product.cost}</Row>}
            {product.image_path && <Row label="图片">已上传</Row>}
            {product.variants?.length > 0 && <Row label="规格">{product.variants.map((variant) => variant.name).join("、")}</Row>}
          </div>
        );
      }
      if (action === "edit") {
        return (
          <div className="flex flex-col gap-1">
            <Row label="操作"><span className="font-medium">编辑 {products.length} 件商品</span></Row>
            {products.slice(0, 5).map((product, index) => {
              const fields = Object.keys(product).filter((key) => key !== "product_id" && product[key] != null);
              return <Row key={index} label={product.name || product.product_id?.slice(0, 8)}><span className="text-xs text-gray-500">修改: {fields.join(", ")}</span></Row>;
            })}
            {products.length > 5 && <div className="text-xs text-gray-400 pl-[4.5rem]">还有 {products.length - 5} 件...</div>}
          </div>
        );
      }
      if (action === "delete") {
        const names = products.map((product) => product.name || product.product_id?.slice(0, 8)).filter(Boolean);
        return (
          <div className="flex flex-col gap-1">
            <Row label="操作"><span className="font-medium text-red-600">删除 {products.length} 件商品</span></Row>
            {names.length > 0 && <Row label="商品"><span className="truncate">{names.slice(0, 5).join("、")}{names.length > 5 ? ` 等${names.length}件` : ""}</span></Row>}
          </div>
        );
      }
    }

    if (function_name === "manage_orders") {
      if (args.action === "list") {
        const filters = args.filters || {};
        const targetUserId = pickUserId(filters.user_id);
        return (
          <div className="flex flex-col gap-1">
            <Row label="操作"><span className="font-medium">查看订单列表</span></Row>
            {filters.order_id && <Row label="订单号"><span className="font-mono">{filters.order_id}</span></Row>}
            {targetUserId && <Row label="用户ID"><span className="font-mono">{targetUserId}</span></Row>}
            {filters.status && <Row label="状态筛选">{renderOrderStatusChip(filters.status)}</Row>}
            <Row label="分页">第 {(filters.page || 0) + 1} 页，每页 {filters.limit || 20} 条</Row>
          </div>
        );
      }
      if (args.action === "update_status" && args.updates) {
        const grouped = {};
        args.updates.forEach((update) => {
          grouped[update.status] = (grouped[update.status] || 0) + 1;
        });
        return (
          <div className="flex flex-col gap-1">
            <Row label="操作"><span className="font-medium">修改 {args.updates.length} 个订单状态</span></Row>
            {Object.entries(grouped).map(([statusKey, count]) => (
              <Row key={statusKey} label="目标状态">{renderOrderStatusChip(statusKey)} <span className="text-gray-500">× {count}</span></Row>
            ))}
          </div>
        );
      }
    }

    if (function_name === "manage_lottery") {
      const actionMap = { get_config: "获取配置", update_config: "修改配置", add_prize: "添加奖品", edit_prizes: "编辑奖品", delete_prizes: "删除奖品" };
      if (args.action === "get_config") return <Row label="操作"><span className="font-medium">获取抽奖配置</span></Row>;
      if (args.action === "update_config" && args.config) {
        return (
          <div className="flex flex-col gap-1">
            <Row label="操作"><span className="font-medium">修改抽奖配置</span></Row>
            {args.config.is_enabled != null && <Row label="启用">{args.config.is_enabled ? "是" : "否"}</Row>}
            {args.config.threshold_amount != null && <Row label="门槛">¥{args.config.threshold_amount}</Row>}
          </div>
        );
      }
      const prizes = args.prizes || [];
      return (
        <div className="flex flex-col gap-1">
          <Row label="操作"><span className="font-medium">{actionMap[args.action] || args.action}</span></Row>
          {prizes.length > 0 && prizes.slice(0, 5).map((prize, index) => (
            <Row key={index} label={`奖品${index + 1}`}>
              <span className="font-medium">{prize.display_name || prize.prize_id?.slice(0, 8) || `#${index + 1}`}</span>
              {prize.weight != null && <span className="text-gray-500 text-xs ml-1">权重:{prize.weight}</span>}
            </Row>
          ))}
          {prizes.length > 5 && <div className="text-xs text-gray-400 pl-[4.5rem]">还有 {prizes.length - 5} 个...</div>}
        </div>
      );
    }

    if (function_name === "manage_gift_thresholds") {
      const actionMap = { list: "查看门槛", add: "添加门槛", edit: "编辑门槛", delete: "删除门槛" };
      if (args.action === "list") return <Row label="操作"><span className="font-medium">查看所有满额门槛</span></Row>;
      const thresholds = args.thresholds || [];
      return (
        <div className="flex flex-col gap-1">
          <Row label="操作"><span className="font-medium">{actionMap[args.action] || args.action} {thresholds.length} 个</span></Row>
          {thresholds.slice(0, 5).map((threshold, index) => (
            <Row key={index} label={`门槛${index + 1}`}>
              {threshold.threshold_amount != null && <span className="font-medium">满 ¥{threshold.threshold_amount}</span>}
              {threshold.gift_products && <span className="text-xs bg-rose-50 text-rose-600 px-1 rounded ml-1">赠品</span>}
              {threshold.gift_coupon && <span className="text-xs bg-violet-50 text-violet-600 px-1 rounded ml-1">券 ¥{threshold.coupon_amount || "?"}</span>}
            </Row>
          ))}
        </div>
      );
    }

    if (function_name === "manage_coupons") {
      if (args.action === "list") {
        const targetUserId = pickUserId(args.user_id);
        return (
          <div className="flex flex-col gap-1">
            <Row label="操作"><span className="font-medium">查看优惠券</span></Row>
            {targetUserId && <Row label="用户ID">{targetUserId}</Row>}
          </div>
        );
      }
      if (args.action === "issue") {
        const coupons = args.coupons || [];
        const targetUserId = pickUserId(args.user_id);
        return (
          <div className="flex flex-col gap-1">
            <Row label="操作"><span className="font-medium">发放优惠券</span></Row>
            {targetUserId && <Row label="对象">{targetUserId}</Row>}
            {coupons.map((coupon, index) => (
              <Row key={index} label={`券${index + 1}`}>
                <span className="font-semibold text-violet-600">¥{coupon.amount}</span>
                {pickUserId(coupon.user_id) && <span className="text-gray-500 text-xs ml-1">用户 {pickUserId(coupon.user_id)}</span>}
                {coupon.quantity > 1 && <span className="text-gray-500 text-xs ml-1">× {coupon.quantity}</span>}
                {coupon.expires_at && <span className="text-gray-400 text-xs ml-1">截止 {coupon.expires_at.slice(0, 10)}</span>}
              </Row>
            ))}
          </div>
        );
      }
      if (args.action === "revoke") {
        const coupons = args.coupons || [];
        return (
          <div className="flex flex-col gap-1">
            <Row label="操作"><span className="font-medium text-red-600">撤回 {coupons.length} 张优惠券</span></Row>
          </div>
        );
      }
    }

    if (function_name === "search_users") {
      if (args.action === "search") {
        return (
          <div className="flex flex-col gap-1">
            <Row label="操作"><span className="font-medium">搜索用户</span></Row>
            <Row label="关键词"><span className="font-medium">{(args.keywords || []).join("、")}</span></Row>
          </div>
        );
      }
      if (args.action === "orders") {
        const targetUserId = pickUserId(args.user_id);
        return (
          <div className="flex flex-col gap-1">
            <Row label="操作"><span className="font-medium">查看用户订单</span></Row>
            <Row label="用户ID">{targetUserId}</Row>
            {args.sort_by === "amount" && <Row label="排序">按金额降序</Row>}
            {args.page > 0 && <Row label="分页">第 {args.page + 1} 页</Row>}
          </div>
        );
      }
      if (args.action === "coupons") {
        const targetUserId = pickUserId(args.user_id);
        return (
          <div className="flex flex-col gap-1">
            <Row label="操作"><span className="font-medium">查看用户优惠券</span></Row>
            <Row label="用户ID">{targetUserId}</Row>
          </div>
        );
      }
    }

    if (Object.keys(args).length === 0) return null;

    return (
      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {Object.entries(args).map(([key, value]) => (
          <React.Fragment key={key}>
            <span className="text-gray-500">{key}</span>
            <span className="text-gray-900 font-medium break-all">{typeof value === "object" ? JSON.stringify(value) : String(value)}</span>
          </React.Fragment>
        ))}
      </div>
    );
  };

  const renderResult = () => {
    if (error_message) return <div className="text-red-600 text-sm">{error_message}</div>;

    if (!result) {
      if (!result_summary || !result_summary.toString().trim()) {
        return <div className="text-xs text-gray-400">无返回数据</div>;
      }

      const summaryString = typeof result_summary === "string" ? result_summary : JSON.stringify(result_summary);

      if (summaryString.trim().startsWith("{") || summaryString.trim().startsWith("[")) {
        try {
          const parsed = JSON.parse(summaryString);
          return <pre className="font-mono text-xs text-gray-600 whitespace-pre-wrap overflow-x-auto bg-gray-50 p-2 rounded-lg">{JSON.stringify(parsed, null, 2)}</pre>;
        } catch {
          const truncated = summaryString.length > 500 ? `${summaryString.slice(0, 500)}...` : summaryString;
          return <div className="font-mono text-xs text-gray-600 whitespace-pre-wrap break-all">{truncated}</div>;
        }
      }

      return <div className="font-mono text-xs text-gray-600 whitespace-pre-wrap break-all">{summaryString}</div>;
    }

    if (function_name === "search_products") {
      if (result.multi_query && result.results) {
        const allItems = [];
        Object.values(result.results).forEach((queryResult) => {
          if (queryResult.items) {
            allItems.push(...queryResult.items);
          }
        });

        if (allItems.length === 0) {
          return (
            <div className="flex flex-col items-center justify-center py-4 text-gray-500">
              <Search className="h-8 w-8 mb-2 opacity-20" />
              <span className="text-xs">未找到相关商品</span>
            </div>
          );
        }

        const displayItems = allItems.slice(0, 15);
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>共找到 {result.count || allItems.length} 个商品</span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
              {displayItems.map((item, index) => (
                <div key={index} className="flex flex-col gap-2 bg-white p-2 rounded-lg border border-gray-100 shadow-sm">
                  {item.image && <img src={item.image} className="w-full aspect-square rounded-md object-cover bg-gray-100" alt="" />}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm text-gray-900 line-clamp-2" title={item.name}>
                      {item.name}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs font-semibold text-gray-900">¥{item.price}</span>
                      {item.original_price && parseFloat(item.original_price) > parseFloat(item.price) && <span className="text-xs text-gray-400 line-through">¥{item.original_price}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {allItems.length > 15 && <div className="text-center text-xs text-gray-400 py-1">还有 {allItems.length - 15} 个商品...</div>}
          </div>
        );
      }

      if (!result.items || result.items.length === 0) {
        return (
          <div className="flex flex-col items-center justify-center py-4 text-gray-500">
            <Search className="h-8 w-8 mb-2 opacity-20" />
            <span className="text-xs">未找到相关商品</span>
          </div>
        );
      }

      const displayItems = result.items.slice(0, 15);
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>共找到 {result.count} 个商品</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
            {displayItems.map((item, index) => (
              <div key={index} className="flex flex-col gap-2 bg-white p-2 rounded-lg border border-gray-100 shadow-sm">
                {item.image && <img src={item.image} className="w-full aspect-square rounded-md object-cover bg-gray-100" alt="" />}
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm text-gray-900 line-clamp-2" title={item.name}>
                    {item.name}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs font-semibold text-gray-900">¥{item.price}</span>
                    {item.original_price && parseFloat(item.original_price) > parseFloat(item.price) && <span className="text-xs text-gray-400 line-through">¥{item.original_price}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {result.items.length > 15 && <div className="text-center text-xs text-gray-400 py-1">还有 {result.items.length - 15} 个商品...</div>}
        </div>
      );
    }

    if (function_name === "get_cart") {
      if (!result.total_quantity && !result.total_price) {
        return (
          <div className="flex flex-col items-center justify-center py-4 text-gray-500">
            <ShoppingCart className="h-8 w-8 mb-2 opacity-20" />
            <span className="text-xs">购物车是空的</span>
          </div>
        );
      }

      const formatMoney = (value) => {
        if (value === undefined || value === null || value === "") return "¥0";
        const number = Number(value);
        if (Number.isNaN(number)) return `¥${value}`;
        return `¥${number % 1 === 0 ? number.toFixed(0) : number.toFixed(2)}`;
      };

      const totalQuantity = result.total_quantity ?? 0;
      const itemsSubtotal = result.items_subtotal ?? result.total_price ?? 0;
      const shippingFee = result.shipping_fee ?? 0;
      const totalPrice = result.total_price ?? 0;
      const giftThresholds = Array.isArray(result.gift_thresholds) ? result.gift_thresholds : [];
      const visibleGifts = giftThresholds.filter((threshold) => Array.isArray(threshold.items) && threshold.items.length > 0);

      return (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-gray-100 bg-white p-2 text-center">
              <div className="text-[11px] text-gray-500">总数量</div>
              <div className="text-lg font-semibold text-gray-900">{totalQuantity}</div>
            </div>
            <div className="rounded-lg border border-gray-100 bg-white p-2 text-center">
              <div className="text-[11px] text-gray-500">商品小计</div>
              <div className="text-lg font-semibold text-gray-900">{formatMoney(itemsSubtotal)}</div>
            </div>
            <div className="rounded-lg border border-gray-100 bg-white p-2 text-center">
              <div className="text-[11px] text-gray-500">配送费</div>
              <div className="text-lg font-semibold text-gray-900">{formatMoney(shippingFee)}</div>
            </div>
            <div className="rounded-lg border border-gray-100 bg-white p-2 text-center">
              <div className="text-[11px] text-gray-500">应付金额</div>
              <div className="text-lg font-semibold text-gray-900">{formatMoney(totalPrice)}</div>
            </div>
          </div>

          {visibleGifts.length > 0 && (
            <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-700">
                <Package className="h-4 w-4" />
                <span>本单满额赠品</span>
              </div>
              <div className="mt-2 space-y-2">
                {visibleGifts.map((threshold, index) => (
                  <div key={`${threshold.threshold_amount || index}`} className="rounded-lg border border-amber-100 bg-white/80 p-2">
                    <div className="flex items-center justify-between text-[11px] text-amber-700">
                      <span>满 ¥{threshold.threshold_amount}</span>
                      <span>随单配送</span>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {threshold.items.map((gift, giftIndex) => (
                        <div key={`${gift.name}-${giftIndex}`} className="flex items-start justify-between gap-3 rounded-md border border-gray-100 bg-white p-2">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-900">{gift.name}</div>
                            {gift.category && <div className="text-[11px] text-gray-500">{gift.category}</div>}
                            {gift.description && <div className="mt-1 text-[11px] text-gray-500">{gift.description}</div>}
                          </div>
                          <div className="text-xs font-semibold text-gray-700 shrink-0">×{gift.quantity ?? 1}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (function_name === "get_category") {
      if (!result.categories || result.categories.length === 0) {
        return (
          <div className="flex flex-col items-center justify-center py-4 text-gray-500">
            <List className="h-8 w-8 mb-2 opacity-20" />
            <span className="text-xs">暂无分类信息</span>
          </div>
        );
      }
      return (
        <div className="flex flex-wrap gap-2">
          {result.categories.map((category, index) => (
            <span key={index} className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded-md text-xs font-medium">
              {typeof category === "string" ? category : category.name}
            </span>
          ))}
        </div>
      );
    }

    if (function_name === "update_cart") {
      const actionLabels = {
        add: "添加",
        remove: "移除",
        update: "更新",
        clear: "清空",
      };
      const actionLabel = actionLabels[result.action] || result.action;

      if (result.action === "clear") {
        return (
          <div className="flex items-center gap-2 p-2 bg-white rounded-lg border border-gray-100">
            <div className="flex items-center justify-center w-8 h-8 bg-green-100 rounded-full">
              <Check className="w-4 h-4 text-green-600" />
            </div>
            <span className="text-sm text-gray-700">{result.message || "购物车已清空"}</span>
          </div>
        );
      }

      const processed = result.processed ?? 1;
      const successful = result.successful ?? (result.ok ? 1 : 0);
      const failed = result.failed ?? 0;
      const productNames = result.product_names || [];
      const details = result.details || [];
      const hasErrors = result.has_errors || failed > 0;
      const errorItems = details.filter((item) => item && typeof item === "object" && !item.success && item.error);
      const isFullSuccess = result.ok && !hasErrors && errorItems.length === 0;
      const isPartialSuccess = result.ok && (hasErrors || errorItems.length > 0);

      let namesDisplay = "";
      if (productNames.length > 0) {
        const displayNames = productNames.slice(0, 3).join("、");
        const moreCount = productNames.length - 3;
        namesDisplay = moreCount > 0 ? `${displayNames} 等${productNames.length}件` : displayNames;
      }

      return (
        <div className="flex items-center gap-3 p-2 bg-white rounded-lg border border-gray-100">
          <div className={cx("flex items-center justify-center w-8 h-8 rounded-full shrink-0", isFullSuccess ? "bg-green-100" : isPartialSuccess ? "bg-yellow-100" : "bg-red-100")}>
            {isFullSuccess ? <Check className="w-4 h-4 text-green-600" /> : isPartialSuccess ? <AlertTriangle className="w-4 h-4 text-yellow-600" /> : <XCircle className="w-4 h-4 text-red-600" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900">
              {actionLabel}操作{isFullSuccess ? "成功" : isPartialSuccess ? "部分成功" : "失败"}
            </div>
            {namesDisplay && <div className="text-xs text-gray-600 truncate" title={productNames.join("、")}>{namesDisplay}</div>}
            {processed > 1 && <div className="text-xs text-gray-500">处理 {processed} 项，成功 {successful} 项{failed > 0 && `，失败 ${failed} 项`}</div>}
            {result.message && <div className="text-xs text-gray-500">{result.message}</div>}
          </div>
        </div>
      );
    }

    const isAdminTool = ["manage_products", "manage_orders", "manage_lottery", "manage_gift_thresholds", "manage_coupons", "search_users"].includes(function_name);
    if (isAdminTool && result) {
      const isOk = result.ok !== false;
      const statusIcon = isOk ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-red-600" />;
      const statusBg = isOk ? "bg-green-50" : "bg-red-50";

      if (function_name === "manage_products") {
        if (result.action === "categories" && result.categories) {
          return (
            <div className="space-y-2">
              <div className="text-xs text-gray-500">共 {result.total || result.categories.length} 个分类</div>
              <div className="flex flex-wrap gap-2">
                {result.categories.map((category, index) => (
                  <span key={index} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white rounded-lg border border-gray-100 text-sm">
                    <span className="font-medium text-gray-800">{category.name}</span>
                    <span className="text-xs text-gray-400">{category.product_count}件</span>
                  </span>
                ))}
              </div>
            </div>
          );
        }

        if ((result.action === "list" || result.action === "search") && result.products) {
          if (result.products.length === 0) {
            return <div className="text-sm text-gray-500 p-2">{result.action === "search" ? "未找到匹配商品" : "暂无商品"}</div>;
          }
          return (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>共 {result.total} 件{result.query ? ` · 搜索"${result.query}"` : ""}</span>
                <span>第 {(result.page || 0) + 1} 页{result.has_more ? "" : " (末页)"}</span>
              </div>
              <div className="space-y-1">
                {result.products.slice(0, 15).map((product, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-100 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium text-gray-800 truncate">{product.name}</span>
                      <span className="text-xs text-gray-400 shrink-0">{product.category}</span>
                      {product.is_hot && <span className="text-xs bg-red-50 text-red-500 px-1 rounded shrink-0">热</span>}
                      {!product.is_active && <span className="text-xs bg-gray-100 text-gray-400 px-1 rounded shrink-0">下架</span>}
                    </div>
                    <div className="flex items-center gap-2 ml-2 shrink-0">
                      <span className="text-xs text-gray-400">库存 {product.stock}</span>
                      {product.discount < 10 && <span className="text-xs text-orange-500">{product.discount}折</span>}
                      <span className="font-semibold text-gray-900">¥{product.effective_price ?? product.price}</span>
                    </div>
                  </div>
                ))}
                {result.products.length > 15 && <div className="text-xs text-gray-400 text-center">还有 {result.products.length - 15} 件商品...</div>}
              </div>
            </div>
          );
        }

        if (result.action === "add" && result.product) {
          const product = result.product;
          return (
            <div className={cx("flex items-center gap-3 p-2.5 rounded-lg", statusBg)}>
              {statusIcon}
              <div className="text-sm flex-1 min-w-0">
                <span className="font-medium">已添加: </span>
                <span className="text-gray-800">{product.name}</span>
                <span className="text-gray-500 ml-2">¥{product.price}</span>
                {product.category && <span className="text-gray-400 ml-1 text-xs">({product.category})</span>}
              </div>
            </div>
          );
        }
      }

      if (function_name === "manage_orders") {
        if (result.action === "list" && result.orders) {
          if (result.orders.length === 0) return <div className="text-sm text-gray-500 p-2">暂无订单</div>;
          return (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>已返回 {result.count || result.orders.length} 个订单{result.total ? ` / 共 ${result.total} 个` : ""}</span>
                <span>第 {(result.page || 0) + 1} 页</span>
              </div>
              <div className="space-y-1">
                {result.orders.slice(0, 10).map((order, index) => (
                  <div key={index} className="rounded-lg border border-gray-100 bg-white p-2 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          {renderOrderStatusChip(order.unified_status || order.status)}
                          <span className="text-gray-600 truncate">{order.user_name || pickUserId(order.user_id) || "—"}</span>
                          {order.id && <span className="text-[11px] text-gray-400 font-mono">#{String(order.id).replace(/^order_/, "")}</span>}
                        </div>
                        <div className="mt-1 text-xs text-gray-400">
                          {order.items_count || 0}件
                          {order.created_at ? ` · ${order.created_at}` : ""}
                        </div>
                        {renderOrderDiscountMeta(order)}
                        {renderOrderItemsCompact(order.items)}
                      </div>
                      <span className="font-medium text-gray-900 ml-2 whitespace-nowrap">¥{order.total_amount}</span>
                    </div>
                  </div>
                ))}
                {result.orders.length > 10 && <div className="text-xs text-gray-400 text-center">还有 {result.orders.length - 10} 个订单...</div>}
              </div>
            </div>
          );
        }
      }

      if (function_name === "manage_lottery") {
        if (result.action === "get_config") {
          return (
            <div className="space-y-2">
              <div className="flex items-center gap-3 p-2 bg-amber-50 rounded-lg text-sm">
                <span className="text-amber-600 font-medium">抽奖配置</span>
                <span className={cx("px-2 py-0.5 rounded text-xs font-medium", result.config?.is_enabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500")}>{result.config?.is_enabled ? "已启用" : "已禁用"}</span>
                <span className="text-gray-600">门槛 ¥{result.config?.threshold_amount || 0}</span>
              </div>
              {result.prizes?.length > 0 && (
                <div className="text-xs space-y-1">
                  {result.prizes.map((prize, index) => (
                    <div key={index} className="flex items-center gap-2 p-1.5 bg-white rounded border border-gray-100">
                      <span className={cx("w-2 h-2 rounded-full shrink-0", prize.is_active ? "bg-green-400" : "bg-gray-300")} />
                      <span className="font-medium text-gray-700">{prize.display_name}</span>
                      <span className="text-gray-400 ml-auto">权重 {prize.weight}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        }
      }

      if (function_name === "manage_gift_thresholds") {
        if (result.action === "list" && result.thresholds) {
          if (result.thresholds.length === 0) return <div className="text-sm text-gray-500 p-2">暂无满额门槛配置</div>;
          return (
            <div className="space-y-1.5">
              {result.thresholds.map((threshold, index) => (
                <div key={index} className="flex items-center gap-2 p-2 bg-white rounded-lg border border-gray-100 text-sm">
                  <span className={cx("w-2 h-2 rounded-full shrink-0", threshold.is_active ? "bg-green-400" : "bg-gray-300")} />
                  <span className="font-medium">满 ¥{threshold.threshold_amount}</span>
                  {threshold.gift_products && <span className="text-xs bg-rose-50 text-rose-600 px-1.5 py-0.5 rounded">赠品</span>}
                  {threshold.gift_coupon && <span className="text-xs bg-violet-50 text-violet-600 px-1.5 py-0.5 rounded">券 ¥{threshold.coupon_amount}</span>}
                  {threshold.per_order_limit > 0 && <span className="text-xs text-gray-400 ml-auto">限{threshold.per_order_limit}次/单</span>}
                </div>
              ))}
            </div>
          );
        }
      }

      if (function_name === "manage_coupons") {
        if (result.action === "list" && result.coupons) {
          if (result.coupons.length === 0) return <div className="text-sm text-gray-500 p-2">暂无优惠券</div>;
          return (
            <div className="space-y-1.5">
              <div className="text-xs text-gray-500">共 {result.count || result.total_count || result.coupons.length} 张优惠券</div>
              {result.coupons.slice(0, 10).map((coupon, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-100 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-violet-600">¥{coupon.amount}</span>
                    {coupon.count > 1 && <span className="text-xs text-gray-500">× {coupon.count}</span>}
                    {pickUserId(coupon.user_id) && <span className="text-gray-400 text-xs">{pickUserId(coupon.user_id)}</span>}
                  </div>
                  <span className={cx("text-xs px-1.5 py-0.5 rounded", coupon.is_active ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-400")}>{coupon.is_active ? "有效" : "已失效"}</span>
                </div>
              ))}
            </div>
          );
        }
        if (result.action === "issue") {
          return (
            <div className={cx("flex items-center gap-3 p-2.5 rounded-lg", statusBg)}>
              {statusIcon}
              <div className="text-sm">
                <span className="font-medium">已发放 {result.total_issued || 0} 张优惠券</span>
                {result.success !== undefined && result.total > 1 && <span className="text-gray-500 ml-2">({result.success}/{result.total} 批次成功)</span>}
              </div>
            </div>
          );
        }
      }

      if (function_name === "search_users") {
        if (result.action === "search" && result.users) {
          if (result.users.length === 0) return <div className="text-sm text-gray-500 p-2">未找到匹配用户</div>;
          return (
            <div className="space-y-1.5">
              <div className="text-xs text-gray-500">找到 {result.count} 个用户</div>
              {result.users.slice(0, 15).map((user, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-100 text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <Users className="w-4 h-4 text-gray-400 shrink-0" />
                    <span className="font-medium text-gray-800">{user.name || user.display_name}</span>
                    {user.phone && <span className="text-gray-400 text-xs">{user.phone}</span>}
                  </div>
                  <div className="flex items-center gap-2 ml-2 shrink-0">
                    <span className="text-xs text-gray-400">{user.order_count || 0} 单</span>
                    <span className="text-xs text-gray-500 font-mono">{pickUserId(user.user_id)}</span>
                  </div>
                </div>
              ))}
            </div>
          );
        }
        if (result.action === "orders" && result.orders) {
          const resultUserId = pickUserId(result.user_id);
          if (result.orders.length === 0) return <div className="text-sm text-gray-500 p-2">该用户暂无订单</div>;
          return (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>用户 {resultUserId || "—"} · 共 {result.total} 个订单</span>
                <span>第 {(result.page || 0) + 1} 页</span>
              </div>
              <div className="space-y-1">
                {result.orders.slice(0, 10).map((order, index) => (
                  <div key={index} className="rounded-lg border border-gray-100 bg-white p-2 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          {renderOrderStatusChip(order.unified_status || order.status)}
                          <span className="text-xs text-gray-400">{order.items_count || 0}件</span>
                          {order.id && <span className="text-[11px] text-gray-400 font-mono">#{String(order.id).replace(/^order_/, "")}</span>}
                          {order.created_at && <span className="text-xs text-gray-400">{order.created_at}</span>}
                        </div>
                        {renderOrderDiscountMeta(order)}
                        {renderOrderItemsCompact(order.items)}
                      </div>
                      <span className="font-medium text-gray-900 ml-2 whitespace-nowrap">¥{order.total_amount}</span>
                    </div>
                  </div>
                ))}
                {result.orders.length > 10 && <div className="text-xs text-gray-400 text-center">还有 {result.orders.length - 10} 个订单...</div>}
              </div>
            </div>
          );
        }
        if (result.action === "coupons" && result.coupons) {
          const resultUserId = pickUserId(result.user_id);
          if (result.coupons.length === 0) return <div className="text-sm text-gray-500 p-2">该用户暂无优惠券</div>;
          return (
            <div className="space-y-1.5">
              <div className="text-xs text-gray-500">用户 {resultUserId} · 共 {result.total_count} 张优惠券</div>
              {result.coupons.map((coupon, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-white rounded-lg border border-gray-100 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-violet-600">¥{coupon.amount}</span>
                    <span className="text-xs text-gray-500">× {coupon.count}</span>
                  </div>
                  <span className={cx("text-xs px-1.5 py-0.5 rounded", coupon.is_active ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-400")}>{coupon.is_active ? "有效" : "已失效"}</span>
                </div>
              ))}
            </div>
          );
        }
      }

      if (result.total !== undefined && result.success !== undefined) {
        const failed = result.total - result.success;
        return (
          <div className="space-y-2">
            <div className={cx("flex items-center gap-3 p-2.5 rounded-lg", statusBg)}>
              {statusIcon}
              <div className="text-sm">
                <span className="font-medium">{displayName}</span>
                <span className="text-gray-600 ml-2">成功 {result.success}/{result.total}</span>
                {failed > 0 && <span className="text-red-500 ml-1">({failed} 失败)</span>}
              </div>
            </div>
            {result.results?.length > 0 && result.results.length <= 10 && (
              <div className="text-xs space-y-1 pl-2">
                {result.results.map((item, index) => (
                  <div key={index} className={cx("flex items-center gap-1.5", item.ok ? "text-green-700" : "text-red-600")}>
                    {item.ok ? <Check className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                    <span className="truncate">{item.name || item.product_id || item.order_id || item.prize_id || item.threshold_id || item.coupon_id || `#${index + 1}`}</span>
                    {item.error && <span className="text-red-500 ml-1">- {item.error}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      }

      if (result.error) {
        return (
          <div className="flex items-center gap-2 p-2 bg-red-50 rounded-lg">
            <XCircle className="w-4 h-4 text-red-600" />
            <span className="text-sm text-red-700">{result.error}</span>
          </div>
        );
      }
      if (result.message || result.ok) {
        return (
          <div className={cx("flex items-center gap-3 p-2.5 rounded-lg", statusBg)}>
            {statusIcon}
            <span className="text-sm">{result.message || "操作成功"}</span>
          </div>
        );
      }
    }

    if (result && typeof result === "object") {
      if (result.ok !== undefined) {
        return (
          <div className="flex items-center gap-2 p-2 bg-white rounded-lg border border-gray-100">
            <div className={cx("flex items-center justify-center w-8 h-8 rounded-full", result.ok ? "bg-green-100" : "bg-red-100")}>
              {result.ok ? <Check className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-red-600" />}
            </div>
            <span className="text-sm text-gray-700">
              {result.message || (result.ok ? "操作成功" : result.error || "操作失败")}
            </span>
          </div>
        );
      }
      return <pre className="font-mono text-xs text-gray-600 whitespace-pre-wrap overflow-x-auto bg-gray-50 p-2 rounded-lg">{JSON.stringify(result, null, 2)}</pre>;
    }

    return <div className="font-mono text-xs text-gray-600 whitespace-pre-wrap break-all">{result_summary || "无返回数据"}</div>;
  };

  const renderCollapsed = () => {
    if (isRunning) return <span className="text-blue-600 text-xs">正在执行...</span>;
    if (isError) return <span className="text-red-600 text-xs">{error_message || "执行失败"}</span>;

    if (function_name === "search_products") {
      if (result?.multi_query && result?.queries) {
        const totalCount = result.count ?? 0;
        const queryString = result.queries.join(", ");
        return (
          <div className="flex items-center gap-2 overflow-hidden text-xs">
            <span className="font-medium text-gray-900 shrink-0">搜索 "{queryString}"</span>
            <span className="text-gray-300">|</span>
            <span className="text-gray-600 shrink-0">找到 {totalCount} 个</span>
          </div>
        );
      }

      const query = args?.query;
      const queryString = Array.isArray(query) ? query.join(", ") : query;
      const count = result?.count ?? 0;
      const items = result?.items || [];
      const names = items.slice(0, 2).map((item) => item.name).join(", ");
      return (
        <div className="flex items-center gap-2 overflow-hidden text-xs">
          {queryString && <span className="font-medium text-gray-900 shrink-0">搜索 "{queryString}"</span>}
          <span className="text-gray-300">|</span>
          <span className="text-gray-600 shrink-0">找到 {count} 个</span>
          {names && <span className="text-gray-400 truncate max-w-[120px]">({names}...)</span>}
        </div>
      );
    }

    if (function_name === "get_cart") {
      const count = result?.total_quantity ?? 0;
      return (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-600">找到 {count} 件商品</span>
        </div>
      );
    }

    if (function_name === "get_category") {
      const count = result?.categories?.length ?? 0;
      return (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-600">找到 {count} 个分类</span>
        </div>
      );
    }

    if (function_name === "update_cart") {
      const action = args?.action;
      const actionLabels = { add: "添加购物车", remove: "移除商品", update: "更新数量", clear: "清空购物车" };
      const actionLabel = actionLabels[action] || "更新购物车";
      const productNames = result?.product_names || [];
      const hasErrors = result?.has_errors || result?.failed > 0;
      const failed = result?.failed ?? 0;

      let namesText = "";
      if (productNames.length > 0) {
        const displayNames = productNames.slice(0, 2).join("、");
        const moreCount = productNames.length - 2;
        namesText = moreCount > 0 ? `${displayNames}等${productNames.length}件` : displayNames;
      }

      return (
        <div className="flex items-center gap-2 text-xs overflow-hidden">
          <span className="font-medium text-gray-900 shrink-0">{actionLabel}</span>
          {namesText && <span className="text-gray-600 truncate max-w-[180px]">{namesText}</span>}
          {result?.ok === false && <span className="text-red-500 shrink-0">失败</span>}
          {result?.ok && hasErrors && <span className="text-yellow-600 shrink-0">({failed}项失败)</span>}
        </div>
      );
    }

    if (function_name === "manage_products") {
      const action = result?.action || args?.action;
      if (action === "categories") return <span className="text-xs text-gray-600">找到 {result?.total || result?.categories?.length || 0} 个分类</span>;
      if (action === "list" || action === "search") {
        const total = result?.total ?? 0;
        return (
          <div className="flex items-center gap-2 text-xs overflow-hidden">
            {action === "search" && args?.query && <span className="font-medium text-gray-900 shrink-0">搜索"{args.query}"</span>}
            {action === "search" && args?.query && <span className="text-gray-300">|</span>}
            <span className="text-gray-600 shrink-0">{total} 件商品</span>
          </div>
        );
      }
      if (action === "add") return <span className="text-xs text-gray-600">{result?.ok ? `已添加: ${result?.product?.name || ""}` : "添加失败"}</span>;
      if (action === "edit") return <span className="text-xs text-gray-600">{result?.ok !== false ? `成功 ${result?.success ?? 0}/${result?.total ?? 0}` : "编辑失败"}</span>;
      if (action === "delete") return <span className="text-xs text-gray-600">{result?.ok !== false ? `已删除 ${result?.success ?? 0} 件` : "删除失败"}</span>;
    }

    if (function_name === "manage_orders") {
      const action = result?.action || args?.action;
      if (action === "list") return <span className="text-xs text-gray-600">{result?.count || result?.orders?.length || 0} 个订单</span>;
      if (action === "update_status") return <span className="text-xs text-gray-600">{result?.ok !== false ? `成功 ${result?.success ?? 0}/${result?.total ?? 0}` : "修改失败"}</span>;
    }

    if (function_name === "manage_lottery") {
      const action = result?.action || args?.action;
      if (action === "get_config") return <span className="text-xs text-gray-600">{result?.config?.is_enabled ? "已启用" : "已禁用"} · 门槛 ¥{result?.config?.threshold_amount || 0} · {result?.prizes?.length || 0} 个奖品</span>;
      const actionLabels = { update_config: "已更新配置", add_prize: "已添加奖品", edit_prizes: "已编辑奖品", delete_prizes: "已删除奖品" };
      return <span className="text-xs text-gray-600">{result?.ok !== false ? actionLabels[action] || "操作完成" : "操作失败"}</span>;
    }

    if (function_name === "manage_gift_thresholds") {
      const action = result?.action || args?.action;
      if (action === "list") return <span className="text-xs text-gray-600">{result?.thresholds?.length || 0} 个门槛</span>;
      return <span className="text-xs text-gray-600">{result?.ok !== false ? `成功 ${result?.success ?? 0}/${result?.total ?? 0}` : "操作失败"}</span>;
    }

    if (function_name === "manage_coupons") {
      const action = result?.action || args?.action;
      if (action === "list") return <span className="text-xs text-gray-600">{result?.count || result?.total_count || result?.coupons?.length || 0} 张优惠券</span>;
      if (action === "issue") return <span className="text-xs text-gray-600">{result?.ok !== false ? `已发放 ${result?.total_issued || 0} 张` : "发放失败"}</span>;
      if (action === "revoke") return <span className="text-xs text-gray-600">{result?.ok !== false ? `已撤回 ${result?.success ?? 0} 张` : "撤回失败"}</span>;
    }

    if (function_name === "search_users") {
      const action = result?.action || args?.action;
      if (action === "search") return <span className="text-xs text-gray-600">找到 {result?.count || 0} 个用户</span>;
      if (action === "orders") return <span className="text-xs text-gray-600">{pickUserId(result?.user_id)} · {result?.total || 0} 个订单</span>;
      if (action === "coupons") return <span className="text-xs text-gray-600">{pickUserId(result?.user_id)} · {result?.total_count || 0} 张优惠券</span>;
    }

    if (result?.message) return <span className="text-xs text-gray-600">{result.message}</span>;
    if (result?.ok === false) return <span className="text-xs text-red-500">{result?.error || "操作失败"}</span>;

    return <span className="text-xs text-gray-500">执行完成</span>;
  };

  const hasArguments = renderArguments() !== null;

  return (
    <div className="flex w-full justify-start -mt-2">
      <div className="w-full max-w-[90%] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-md">
        <div
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex cursor-pointer items-center justify-between bg-gray-50/50 px-4 py-3 transition-colors hover:bg-gray-50"
        >
          <div className="flex items-center gap-3 overflow-hidden">
            <div className={cx(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border shadow-sm",
              isRunning ? "bg-blue-50 border-blue-100 text-blue-600" : isSuccess ? `${style.bg} ${style.border} ${style.text}` : "bg-red-50 border-red-100 text-red-600"
            )}>
              {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : isSuccess ? <Icon className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            </div>

            <div className="flex flex-col overflow-hidden">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-900">{displayName}</span>
                {!isExpanded && (
                  <div className="truncate ml-2">
                    {renderCollapsed()}
                  </div>
                )}
              </div>
            </div>
          </div>

          <ChevronDown className={cx("h-4 w-4 text-gray-400 transition-transform duration-200 shrink-0", isExpanded ? "rotate-180" : "")} />
        </div>

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="border-t border-gray-100 bg-gray-50/30"
            >
              <div className="p-4 space-y-4">
                {hasArguments && (
                  <div>
                    <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <div className="h-1.5 w-1.5 rounded-full bg-gray-400"></div>
                      Input
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                      {renderArguments()}
                    </div>
                  </div>
                )}

                {(result_summary || error_message) && (
                  <div>
                    <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <div className={cx("h-1.5 w-1.5 rounded-full", isError ? "bg-red-400" : "bg-green-400")}></div>
                      Output
                    </div>
                    <div className={cx("rounded-xl border p-3 shadow-sm overflow-hidden", isError ? "border-red-100 bg-red-50/30" : "border-gray-200 bg-white")}>
                      {renderResult()}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default ToolCallCard;
