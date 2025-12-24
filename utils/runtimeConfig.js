const rawEnv = (process.env.NEXT_PUBLIC_ENV || process.env.ENV || process.env.NODE_ENV || 'production').toLowerCase()
const isDevEnv = rawEnv === 'development' || rawEnv === 'devlopment'

// 获取配置，开发环境优先使用 DEV_ 前缀的配置
const getApiUrl = () => {
  if (isDevEnv) {
    return process.env.DEV_NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL
  }
  return process.env.NEXT_PUBLIC_API_URL
}

const getImageUrl = () => {
  if (isDevEnv) {
    return process.env.DEV_NEXT_PUBLIC_IMAGE_BASE_URL || process.env.NEXT_PUBLIC_IMAGE_BASE_URL
  }
  return process.env.NEXT_PUBLIC_IMAGE_BASE_URL
}

const getFileUrl = () => {
  if (isDevEnv) {
    return process.env.DEV_NEXT_PUBLIC_FILE_BASE_URL || process.env.NEXT_PUBLIC_FILE_BASE_URL
  }
  return process.env.NEXT_PUBLIC_FILE_BASE_URL
}

const apiBase = getApiUrl()
const imageBase = getImageUrl() || apiBase
const fileBase = getFileUrl() || imageBase
const shopName = (process.env.SHOP_NAME || '').trim()
const headerLogo = (process.env.HEADER_LOGO || 'logo.png').trim()
const logo = (process.env.LOGO || 'logo.png').trim()

if (!apiBase) {
  throw new Error('API URL environment variable is required (NEXT_PUBLIC_API_URL or DEV_NEXT_PUBLIC_API_URL for development)')
}

if (!shopName) {
  throw new Error('SHOP_NAME environment variable is required')
}

export const runtimeConfig = Object.freeze({
  env: rawEnv,
  isDev: isDevEnv,
  apiUrl: apiBase,
  imageBaseUrl: imageBase,
  fileBaseUrl: fileBase,
  shopName,
  headerLogo,
  logo,
})

export function getRuntimeConfig() {
  return runtimeConfig
}

export function getApiBaseUrl() {
  return runtimeConfig.apiUrl
}

export function getImageBaseUrl() {
  return runtimeConfig.imageBaseUrl
}

export function getFileBaseUrl() {
  return runtimeConfig.fileBaseUrl
}

export function getShopName() {
  return runtimeConfig.shopName
}

/**
 * 获取网页顶部导航栏 logo 图片路径
 * @returns {string} logo 图片的完整路径，如 '/logo.png'
 */
export function getHeaderLogo() {
  const logo = runtimeConfig.headerLogo
  // 确保返回以 / 开头的路径
  return logo.startsWith('/') ? logo : `/${logo}`
}

/**
 * 获取通用占位 logo 图片路径（用于商品图片加载失败等情况）
 * @returns {string} 占位图片的完整路径，如 '/logo.png'
 */
export function getLogo() {
  const logo = runtimeConfig.logo
  // 确保返回以 / 开头的路径
  return logo.startsWith('/') ? logo : `/${logo}`
}
