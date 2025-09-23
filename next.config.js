/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // 支持外部CDN脚本
  experimental: {
    optimizePackageImports: ['react', 'react-dom']
  },
  // 允许外部CDN资源
  images: {
    domains: ['cdn.jsdelivr.net']
  },
  async rewrites() {
    const base =
      process.env.NEXT_PUBLIC_IMAGE_BASE_URL ||
      process.env.NEXT_PUBLIC_FILE_BASE_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      (process.env.NODE_ENV === 'development'
        ? 'http://localhost:9099'
        : 'https://chatapi.your_domain.com');
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
