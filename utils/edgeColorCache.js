/**
 * 图片边缘颜色缓存模块
 * 
 * 预处理所有商品图片，提取最外圈像素的主色调，
 * 用于商品详情全屏展示时的背景色填充（避免 object-contain 裁切露白）。
 * 
 * 对外提供：
 *  - preExtractEdgeColors(products)  异步批量预处理
 *  - getEdgeColor(imageUrl)          同步查缓存
 *  - extractEdgeColorAsync(imageUrl) 单张异步提取
 */

import { getProductImage } from './urls';
import { getLogo } from './runtimeConfig';

// ============ 缓存 ============
const cache = new Map(); // key: imageUrl → value: rgb string

// ============ 核心算法 ============
/**
 * 从 HTMLImageElement 的最外圈像素提取出现频率最高的颜色
 * 返回 "rgb(r,g,b)" 字符串
 */
function extractFromImgElement(imgEl) {
  const nw = imgEl.naturalWidth;
  const nh = imgEl.naturalHeight;
  if (!nw || !nh) return null;

  const canvas = document.createElement('canvas');
  const scale = Math.min(200 / Math.max(nw, nh), 1);
  const w = Math.max(Math.round(nw * scale), 1);
  const h = Math.max(Math.round(nh * scale), 1);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imgEl, 0, 0, w, h);

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  const SHIFT = 3; // 32 级量化
  const buckets = {};

  const addPixel = (x, y) => {
    const idx = (y * w + x) * 4;
    const rr = data[idx], gg = data[idx + 1], bb = data[idx + 2];
    const key = `${rr >> SHIFT},${gg >> SHIFT},${bb >> SHIFT}`;
    if (!buckets[key]) buckets[key] = { count: 0, sumR: 0, sumG: 0, sumB: 0 };
    const b = buckets[key];
    b.count++;
    b.sumR += rr;
    b.sumG += gg;
    b.sumB += bb;
  };

  // 采样最外 3 像素
  const DEPTH = Math.min(3, Math.floor(Math.min(w, h) / 2));
  for (let d = 0; d < DEPTH; d++) {
    for (let x = d; x < w - d; x++) {
      addPixel(x, d);
      addPixel(x, h - 1 - d);
    }
    for (let y = d + 1; y < h - 1 - d; y++) {
      addPixel(d, y);
      addPixel(w - 1 - d, y);
    }
  }

  let maxCount = 0;
  let best = null;
  for (const bucket of Object.values(buckets)) {
    if (bucket.count > maxCount) { maxCount = bucket.count; best = bucket; }
  }
  if (!best) return null;

  const r = Math.round(best.sumR / best.count);
  const g = Math.round(best.sumG / best.count);
  const b = Math.round(best.sumB / best.count);
  return `rgb(${r},${g},${b})`;
}

// ============ 单张提取（Promise） ============
function loadAndExtract(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const color = extractFromImgElement(img);
        resolve(color || '#111');
      } catch {
        resolve('#111');
      }
    };
    img.onerror = () => {
      // 如果同源失败，重试 crossOrigin
      const img2 = new Image();
      img2.crossOrigin = 'anonymous';
      img2.onload = () => {
        try {
          const color = extractFromImgElement(img2);
          resolve(color || '#111');
        } catch {
          resolve('#111');
        }
      };
      img2.onerror = () => resolve('#111');
      img2.src = url;
    };
    img.src = url;
  });
}

// ============ 对外 API ============

/**
 * 同步查缓存，命中返回颜色字符串，未命中返回 null
 */
export function getEdgeColor(imageUrl) {
  return cache.get(imageUrl) || null;
}

/**
 * 单张异步提取（带缓存），返回 Promise<string>
 */
export async function extractEdgeColorAsync(imageUrl) {
  if (!imageUrl) return '#111';
  const cached = cache.get(imageUrl);
  if (cached) return cached;

  const color = await loadAndExtract(imageUrl);
  cache.set(imageUrl, color);
  return color;
}

/**
 * 批量预处理：接收商品数组，后台逐个提取边缘颜色并缓存
 * 使用 requestIdleCallback 避免阻塞主线程
 */
export function preExtractEdgeColors(products) {
  if (!products || !products.length) return;
  if (typeof window === 'undefined') return;

  // 收集需要处理的 URL（去重 + 跳过已缓存）
  const urls = [];
  const seen = new Set();
  for (const p of products) {
    const url = getProductImage(p) || getLogo();
    if (url && !seen.has(url) && !cache.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  }

  if (!urls.length) return;

  // 逐个异步处理，用 requestIdleCallback 分批避免卡顿
  let idx = 0;
  const processNext = () => {
    if (idx >= urls.length) return;
    const url = urls[idx++];
    loadAndExtract(url).then((color) => {
      cache.set(url, color);
      // 处理下一个
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(processNext);
      } else {
        setTimeout(processNext, 0);
      }
    });
  };

  // 启动：用 idle callback 或 setTimeout 延迟开始
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(processNext);
  } else {
    setTimeout(processNext, 100);
  }
}
