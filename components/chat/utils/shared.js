import { getHeaderLogo, getShopName } from "../../../utils/runtimeConfig";

export const cx = (...xs) => xs.filter(Boolean).join(" ");

export const SHOP_NAME = getShopName();
export const HEADER_LOGO = getHeaderLogo();
export const SIDEBAR_EXPANDED_WIDTH = 240;
export const SIDEBAR_COLLAPSED_WIDTH = 64;

export const buildPreview = (text = "") => text.trim().replace(/\s+/g, " ").slice(0, 8);

const MODEL_STORAGE_KEY = "ai_selected_model";

export const getStoredModelSelection = () => {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(MODEL_STORAGE_KEY) || "";
  } catch {
    return "";
  }
};

export const persistModelSelection = (value) => {
  if (typeof window === "undefined") return;
  try {
    if (value) {
      localStorage.setItem(MODEL_STORAGE_KEY, value);
    } else {
      localStorage.removeItem(MODEL_STORAGE_KEY);
    }
  } catch {
    // Ignore persistence failures.
  }
};

export const formatRelativeTime = (dateString) => {
  if (!dateString) return "未知时间";

  try {
    let date;
    if (typeof dateString === "string" && !dateString.includes("Z") && !dateString.includes("+")) {
      date = new Date(`${dateString}Z`);
    } else {
      date = new Date(dateString);
    }

    if (isNaN(date.getTime())) return "未知时间";

    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "刚刚";
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const currentYear = now.getFullYear();

    if (year === currentYear) {
      return `${month}-${day}`;
    }
    return `${year}-${month}-${day}`;
  } catch (error) {
    console.error("Failed to format timestamp:", error, dateString);
    return "未知时间";
  }
};

export const WELCOME_TEXTS = [
  "你需要什么？",
  "让我帮你查询",
  "我可以怎么帮你？",
  "有什么需要帮忙的？",
  "需要我帮你找点什么吗？",
  "请告诉我你的需求",
  "我能为你做些什么？",
  "想了解点什么？",
  "需要帮忙吗？",
  "我在这里帮你",
];

export const TEXTTYPE_PROPS = {
  text: WELCOME_TEXTS,
  typingSpeed: 75,
  pauseDuration: 1500,
  deletingSpeed: 50,
  cursorBlinkDuration: 0.5,
  showCursor: true,
  cursorCharacter: "_",
  randomOrder: true,
};
