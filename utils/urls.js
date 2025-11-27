// Utility to resolve media/image URLs consistently on client

import { getRuntimeConfig } from './runtimeConfig'

const { imageBaseUrl, fileBaseUrl, apiUrl } = getRuntimeConfig()

const DEFAULT_API_BASE = imageBaseUrl || fileBaseUrl || apiUrl

export function resolveImageUrl(path) {
  if (!path || typeof path !== 'string') return '';

  // Already absolute or protocol-relative
  if (/^https?:\/\//i.test(path) || path.startsWith('//')) return path;

  // 在浏览器环境中，优先使用相对路径以利用Next.js的rewrites代理
  if (typeof window !== 'undefined') {
    // 确保路径以 / 开头
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return cleanPath;
  }

  // 服务端渲染时使用完整URL
  const base = DEFAULT_API_BASE;
  if (base) {
    const cleanBase = base.replace(/\/+$|\/$/g, '');
    const cleanPath = path.replace(/^\/+/, '');
    return `${cleanBase}/${cleanPath}`;
  }

  // Fallback to same-origin absolute path
  return path.startsWith('/') ? path : `/${path}`;
}

export function getProductImage(product) {
  if (!product) return '';
  const src =
    product.cached_image_url ||
    product.image_url ||
    product.img_url ||
    product.image ||
    product.imgPath ||
    product.img_path ||
    '';
  return resolveImageUrl(src);
}
