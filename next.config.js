/** @type {import('next').NextConfig} */
const envFlag = (process.env.ENV || process.env.NEXT_PUBLIC_ENV || process.env.NODE_ENV || 'production').toLowerCase()
const isDevEnv = envFlag === 'development' || envFlag === 'devlopment'

// 获取配置，开发环境优先使用 DEV_ 前缀的配置
const getApiUrl = () => {
  if (isDevEnv) {
    return process.env.DEV_NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL
  }
  return process.env.NEXT_PUBLIC_API_URL
}

const getImageBaseUrl = () => {
  if (isDevEnv) {
    return process.env.DEV_NEXT_PUBLIC_IMAGE_BASE_URL || process.env.NEXT_PUBLIC_IMAGE_BASE_URL
  }
  return process.env.NEXT_PUBLIC_IMAGE_BASE_URL
}

const getFileBaseUrl = () => {
  if (isDevEnv) {
    return process.env.DEV_NEXT_PUBLIC_FILE_BASE_URL || process.env.NEXT_PUBLIC_FILE_BASE_URL
  }
  return process.env.NEXT_PUBLIC_FILE_BASE_URL
}

const resolvedApiUrl = getApiUrl()
const resolvedImageBaseUrl = getImageBaseUrl()
const resolvedFileBaseUrl = getFileBaseUrl()

// 生产环境检查必需的环境变量
if (!isDevEnv) {
  const requiredEnvs = {
    'NEXT_PUBLIC_API_URL': resolvedApiUrl,
    'NEXT_PUBLIC_IMAGE_BASE_URL': resolvedImageBaseUrl,
    'NEXT_PUBLIC_FILE_BASE_URL': resolvedFileBaseUrl
  }
  
  const missingEnvs = Object.entries(requiredEnvs)
    .filter(([, value]) => !value)
    .map(([key]) => key)
  
  if (missingEnvs.length > 0) {
    throw new Error(`生产环境缺失必需的环境变量: ${missingEnvs.join(', ')}`)
  }
}

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // 支持外部CDN脚本
  experimental: {
    optimizePackageImports: ['react', 'react-dom']
  },
  env: {
    NEXT_PUBLIC_ENV: envFlag,
    NEXT_PUBLIC_API_URL: resolvedApiUrl,
    NEXT_PUBLIC_IMAGE_BASE_URL: resolvedImageBaseUrl,
    NEXT_PUBLIC_FILE_BASE_URL: resolvedFileBaseUrl
  },
  // 允许外部CDN资源
  images: {
    domains: ['cdn.jsdelivr.net']
  },
  async rewrites() {
    const base = resolvedImageBaseUrl || resolvedFileBaseUrl || resolvedApiUrl
    const cleanBase = (base || '').replace(/\/$/, '');
    return cleanBase
      ? [
          // 将前端同源的 /items/* 代理到后端文件服务，解决相对路径图片 404
          { source: '/items/:path*', destination: `${cleanBase}/items/:path*` },
          // 将 /public/* 代理到后端，用于收款码等动态生成的静态文件
          { source: '/public/:path*', destination: `${cleanBase}/public/:path*` },
        ]
      : [];
  }
}

module.exports = nextConfig