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
  }
}

module.exports = nextConfig
