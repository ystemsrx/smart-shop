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

const getShopName = () => {
  return (process.env.SHOP_NAME || '').trim()
}

const getHeaderLogo = () => {
  return (process.env.HEADER_LOGO || 'logo.png').trim()
}

const getLogo = () => {
  return (process.env.LOGO || 'logo.png').trim()
}

const resolvedApiUrl = getApiUrl()
const resolvedImageBaseUrl = getImageBaseUrl()
const resolvedFileBaseUrl = getFileBaseUrl()
const resolvedShopName = getShopName()
const resolvedHeaderLogo = getHeaderLogo()
const resolvedLogo = getLogo()

// 生产环境检查必需的环境变量
if (!isDevEnv) {
  const requiredEnvs = {
    'NEXT_PUBLIC_API_URL': resolvedApiUrl,
    'NEXT_PUBLIC_IMAGE_BASE_URL': resolvedImageBaseUrl,
    'NEXT_PUBLIC_FILE_BASE_URL': resolvedFileBaseUrl,
    'SHOP_NAME': resolvedShopName,
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
  
  // 压缩优化
  compress: true,
  
  // 生成更小的构建输出
  productionBrowserSourceMaps: false,
  
  // 优化包导入 - 减少初始 bundle 大小
  experimental: {
    optimizePackageImports: [
      'framer-motion',  // 重要: 优化 framer-motion 的 tree shaking
      'lucide-react',   // 图标库优化
      'gl-matrix',      // WebGL 数学库
    ]
  },
  
  // Webpack 配置优化
  webpack: (config, { dev, isServer }) => {
    // 生产环境优化
    if (!dev && !isServer) {
      // 分割大型第三方库到独立 chunk
      config.optimization.splitChunks = {
        ...config.optimization.splitChunks,
        cacheGroups: {
          ...config.optimization.splitChunks?.cacheGroups,
          // framer-motion 单独打包
          framerMotion: {
            test: /[\\/]node_modules[\\/]framer-motion[\\/]/,
            name: 'framer-motion',
            chunks: 'all',
            priority: 30,
          },
          // gl-matrix 单独打包（用于 3D 菜单）
          glMatrix: {
            test: /[\\/]node_modules[\\/]gl-matrix[\\/]/,
            name: 'gl-matrix',
            chunks: 'all',
            priority: 30,
          },
          // gsap 单独打包
          gsap: {
            test: /[\\/]node_modules[\\/]gsap[\\/]/,
            name: 'gsap',
            chunks: 'all',
            priority: 30,
          },
          // 其他大型库
          vendors: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all',
            priority: 10,
          },
        },
      };
    }
    return config;
  },
  
  env: {
    NEXT_PUBLIC_ENV: envFlag,
    NEXT_PUBLIC_API_URL: resolvedApiUrl,
    NEXT_PUBLIC_IMAGE_BASE_URL: resolvedImageBaseUrl,
    NEXT_PUBLIC_FILE_BASE_URL: resolvedFileBaseUrl,
    SHOP_NAME: resolvedShopName,
    HEADER_LOGO: resolvedHeaderLogo,
    LOGO: resolvedLogo,
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
          // 将 /payment/* 代理到后端，用于收款码展示路径
          { source: '/payment/:path*', destination: `${cleanBase}/payment/:path*` },
          // 将 .txt 文件代理到后端，用于域名验证文件等
          { source: '/:filename.txt', destination: `${cleanBase}/:filename.txt` },
        ]
      : [];
  }
}

module.exports = nextConfig
