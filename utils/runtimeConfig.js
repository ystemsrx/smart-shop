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

if (!apiBase) {
  throw new Error('API URL environment variable is required (NEXT_PUBLIC_API_URL or DEV_NEXT_PUBLIC_API_URL for development)')
}

export const runtimeConfig = Object.freeze({
  env: rawEnv,
  isDev: isDevEnv,
  apiUrl: apiBase,
  imageBaseUrl: imageBase,
  fileBaseUrl: fileBase,
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
