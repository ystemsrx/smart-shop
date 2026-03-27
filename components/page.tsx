'use client'

import { motion, useScroll, useTransform, useInView } from 'framer-motion'
import { useRef, useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { getShopName } from '../utils/runtimeConfig'

// Hero Section Component
function HeroSection({ onLearnMore, shopName }: { onLearnMore?: () => void; shopName: string }) {
  const ref = useRef(null)
  const router = useRouter()
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"]
  })
  
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0])
  const scale = useTransform(scrollYProgress, [0, 0.5], [1, 0.8])
  
  return (
    <motion.section 
      ref={ref}
      style={{ opacity, scale }}
      className="min-h-screen flex items-center justify-center relative overflow-hidden bg-gradient-to-b from-gray-50 to-white"
    >
      <div className="absolute top-20 right-20 w-96 h-96 bg-yellow-400/10 rounded-full blur-3xl" />
      <div className="absolute bottom-20 left-20 w-96 h-96 bg-purple-400/10 rounded-full blur-3xl" />
      
      <div className="container mx-auto px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.2 }}
          className="text-center"
        >
          <div className="mb-8">
            <span className="text-sm tracking-[0.3em] text-gray-400 uppercase">
              future of commerce
            </span>
          </div>
          
          <h1 className="text-7xl md:text-9xl font-black leading-none mb-6 tracking-tight">
            <span className="block text-gray-900">{shopName}</span>
          </h1>
          
          <p className="text-2xl md:text-4xl text-gray-400 font-light tracking-wide mb-12">
            The Next Generation Marketplace
          </p>
          
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.8 }}
            className="flex items-center justify-center gap-8"
          >
          <button 
            onClick={() => router.push('/shop')}
            className="px-8 py-4 bg-gray-900 text-white rounded-full text-lg font-medium hover:bg-gray-800 transition-colors"
          >
            开始探索
          </button>
            <button 
              onClick={onLearnMore}
              className="px-8 py-4 border-2 border-gray-900 text-gray-900 rounded-full text-lg font-medium hover:bg-gray-50 transition-colors"
            >
              Learn More
            </button>
          </motion.div>
        </motion.div>
      </div>
      
      <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2">
        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <i className="fas fa-chevron-down text-gray-400 text-2xl"></i>
        </motion.div>
      </div>
    </motion.section>
  )
}


// Features Section Component
function FeaturesSection() {
  const ref = useRef(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"]
  })
  
  const features = [
    {
      title: "智能助手",
      subtitle: "Smart Assistant",
      description: "AI-powered recommendation system",
      icon: "fa-brain",
      color: "purple-400",
      detailedContent: {
        intro: "通过自然语言对话，为每位用户提供个性化的商品推荐。我们的AI助手不仅能理解您的需求，更能帮助您进行实际操作。"
      }
    },
    {
      title: "安全支付",
      subtitle: "Secure Payment",
      description: "Advanced encryption technology",
      icon: "fa-shield-halved",
      color: "accent-green",
      detailedContent: {
        intro: "直接使用微信扫码支付，保障每一笔交易的安全与隐私。"
      }
    },
    {
      title: "极速配送",
      subtitle: "Express Delivery",
      description: "Lightning-fast shipping service",
      icon: "fa-truck-fast",
      color: "accent-purple",
      detailedContent: {
        intro: "从下单到收货，全程可追踪，享受闪电般的配送体验。"
      }
    }
  ]
  
  return (
    <section id="features" ref={ref} className="py-32 bg-gray-50 relative">
      <div className="container mx-auto px-6">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1 }}
          className="mb-20"
        >
          <h2 className="text-6xl md:text-8xl font-black text-gray-900 mb-4">
            核心功能
          </h2>
          <p className="text-xl text-gray-400">Core Features</p>
        </motion.div>
        
        <div className="space-y-32">
          {features.map((feature, index) => (
            <FeatureCard key={index} feature={feature} index={index} />
          ))}
        </div>
      </div>
    </section>
  )
}

function FeatureCard({ feature, index }: { feature: any, index: number }) {
  const ref = useRef(null)
  const router = useRouter()
  const isInView = useInView(ref, { once: true, margin: "-100px" })
  const isEven = index % 2 === 0
  const [isExpanded, setIsExpanded] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)
  
  // 检测是否为桌面端
  useEffect(() => {
    const checkDesktop = () => {
      setIsDesktop(window.innerWidth >= 768) // md breakpoint
    }
    checkDesktop()
    window.addEventListener('resize', checkDesktop)
    return () => window.removeEventListener('resize', checkDesktop)
  }, [])
  
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, x: isEven ? -100 : 100 }}
      animate={isInView ? { opacity: 1, x: 0 } : {}}
      transition={{ duration: 1 }}
      className="relative"
    >
      <div className={`flex flex-col ${isEven ? 'md:flex-row' : 'md:flex-row-reverse'} items-center gap-16`}>
        {/* 图标部分 - 奇数行在左(固定),偶数行在右(移动) */}
        <motion.div 
          className="flex-1"
          animate={{ 
            x: isDesktop && isExpanded && !isEven ? -80 : 0,
          }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
        >
          <div className="relative inline-block mb-8">
            <div className={`absolute inset-0 bg-${feature.color}/20 rounded-3xl blur-2xl`} />
            <i className={`fas ${feature.icon} text-[12rem] text-${feature.color} relative`}></i>
          </div>
        </motion.div>
        
        {/* 主内容部分 - 奇数行在右(移动),偶数行在左(固定) */}
        <motion.div 
          className="flex-1"
          animate={{ 
            x: isDesktop && isExpanded && isEven ? -80 : 0,
          }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
        >
          <h3 className="text-6xl md:text-7xl font-black text-gray-900 mb-4">
            {feature.title}
          </h3>
          <p className="text-2xl text-gray-400 mb-6">{feature.subtitle}</p>
          <p className="text-lg text-gray-500 leading-relaxed">
            {feature.description}
          </p>
          <div className="mt-8 flex items-center gap-4 flex-wrap">
            <button 
              onClick={() => setIsExpanded(!isExpanded)}
              className="px-6 py-3 border border-gray-900 text-gray-900 rounded-full hover:bg-gray-900 hover:text-white transition-colors inline-flex items-center gap-2"
            >
              {isExpanded ? '收起' : '了解更多'}
              <motion.i 
                className="fas fa-arrow-right text-sm"
                animate={{ 
                  rotate: isExpanded ? 180 : 0,
                }}
                transition={{ duration: 0.3 }}
              ></motion.i>
            </button>
            {index === 0 && (
              <button 
                onClick={() => router.push('/c')}
                className="px-6 py-3 bg-gray-900 text-white rounded-full hover:bg-gray-800 transition-colors inline-flex items-center gap-2"
              >
                立即尝试
                <i className="fas fa-comment-dots text-sm"></i>
              </button>
            )}
          </div>
        </motion.div>
      </div>
      
      {/* 移动端：下方展开的详细内容 */}
      <div className="md:hidden">
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ 
            height: isExpanded ? 'auto' : 0,
            opacity: isExpanded ? 1 : 0,
          }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
          className="overflow-hidden mt-8"
        >
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl p-6 border border-gray-200">
            <h4 className="text-2xl font-bold text-gray-900 mb-4">详细介绍</h4>
            <p className="text-base text-gray-600 leading-relaxed">
              {feature.detailedContent.intro}
            </p>
          </div>
        </motion.div>
      </div>
      
      {/* 桌面端：右侧弹出的详细内容 */}
      <div className="hidden md:block">
        <motion.div
          initial={{ opacity: 0, x: 100, width: 0 }}
          animate={{ 
            opacity: isExpanded ? 1 : 0,
            x: isExpanded ? 0 : 100,
            width: isExpanded ? 'auto' : 0,
          }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
          className="absolute right-0 top-0 overflow-hidden rounded-2xl"
          style={{ pointerEvents: isExpanded ? 'auto' : 'none' }}
        >
          <div className="w-80 bg-white/95 backdrop-blur-sm rounded-2xl p-8 shadow-xl">
            <h4 className="text-2xl font-bold text-gray-900 mb-4">详细介绍</h4>
            <p className="text-base text-gray-600 leading-relaxed">
              {feature.detailedContent.intro}
            </p>
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}

// Data Visualization Section - Line Chart
function DataVisualization() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: "-100px" })
  
  // 更平滑的贝塞尔曲线路径
  const pathData = "M 0 300 C 150 300, 150 200, 300 200 C 450 200, 450 100, 600 150 C 750 200, 800 50, 1100 20"
  
  return (
    <section ref={ref} className="py-32 bg-white relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-purple-400/5 rounded-full blur-3xl" />
      
      <div className="container mx-auto px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="text-center mb-20"
        >
          <h2 className="text-6xl md:text-8xl font-black text-gray-900 mb-4">
            增长
          </h2>
          <p className="text-xl text-gray-400">Growth Trajectory</p>
        </motion.div>
        
        <div className="max-w-6xl mx-auto">
          {/* 图表区域 - 玻璃拟态卡片 */}
          <div className="flex-1 w-full">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={isInView ? { opacity: 1, scale: 1 } : {}}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative bg-white/60 backdrop-blur-xl border border-white/50 rounded-3xl shadow-2xl p-8 aspect-[16/10]"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent rounded-3xl pointer-events-none" />
              
              {/* 简单的图表UI元素 */}
              <div className="flex justify-between mb-8 opacity-50">
                 <div className="space-y-2">
                    <div className="w-20 h-2 bg-gray-300 rounded-full" />
                    <div className="w-12 h-2 bg-gray-200 rounded-full" />
                 </div>
                 <div className="w-8 h-8 bg-gray-200 rounded-full" />
              </div>

              <svg viewBox="0 0 1100 350" className="w-full h-[70%] overflow-visible">
                <defs>
                  <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {/* 填充区域 - 跟随线条运动 */}
                <motion.path
                  d={`${pathData} L 1100 350 L 0 350 Z`}
                  fill="url(#chartGradient)"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={isInView ? { pathLength: 1, opacity: 1 } : {}}
                  transition={{ duration: 2, ease: "easeInOut" }}
                  style={{ pathLength: 1 }}
                />
                {/* 线条 */}
                <motion.path
                  d={pathData}
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth="6"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={isInView ? { pathLength: 1 } : {}}
                  transition={{ duration: 2, ease: "easeInOut" }}
                />
              </svg>
              
              {/* 悬浮的数据点示意 */}
              <motion.div 
                className="absolute top-[30%] right-[20%] bg-white p-3 rounded-xl shadow-lg border border-gray-100"
                initial={{ opacity: 0, y: 10 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 2, duration: 0.5 }}
              >
                <span className="text-indigo-600 font-bold text-lg">+128%</span>
                <span className="text-xs text-gray-400 block">本月增长</span>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  )
}



// CTA Section
function CTASection() {
  const ref = useRef(null)
  const router = useRouter()
  const isInView = useInView(ref, { once: true })
  
  return (
    <section ref={ref} className="py-32 bg-gray-900 text-white relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px]">
        <div className="absolute top-0 left-0 w-full h-full bg-purple-500/20 rounded-full blur-3xl animate-pulse" />
      </div>
      
      <div className="container mx-auto px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 1 }}
          className="text-center"
        >
          <h2 className="text-6xl md:text-8xl font-black mb-8">
            开始旅程
          </h2>
          <p className="text-2xl md:text-3xl text-gray-400 mb-12 font-light">
            Join us
          </p>
          
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => router.push('/login')}
            className="px-12 py-6 bg-white text-gray-900 rounded-full text-xl font-bold hover:bg-gray-100 transition-colors inline-flex items-center gap-3"
          >
            立即登录
            <i className="fas fa-arrow-right"></i>
          </motion.button>
          
          <div className="mt-16 flex items-center justify-center gap-12 text-gray-400">
            <div className="text-center">
              <div className="text-4xl font-black text-white mb-2">免费</div>
              <div className="text-sm">Free to Start</div>
            </div>
            <div className="w-px h-12 bg-gray-700" />
            <div className="text-center">
              <div className="text-4xl font-black text-white mb-2">安全</div>
              <div className="text-sm">100% Secure</div>
            </div>
            <div className="w-px h-12 bg-gray-700" />
            <div className="text-center">
              <div className="text-4xl font-black text-white mb-2">快速</div>
              <div className="text-sm">Instant Setup</div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

// Footer
function Footer({ shopName }: { shopName: string }) {
  const currentYear = new Date().getFullYear()
  
  return (
    <footer className="bg-gray-50 py-12 border-t border-gray-200">
      <div className="container mx-auto px-6">
        <div className="flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="text-center md:text-left">
            <h3 className="text-3xl font-black text-gray-900 mb-2">{shopName}</h3>
            <p className="text-gray-400">Future Marketplace</p>
          </div>
          
          <div className="flex gap-6">
            <a 
              href="https://github.com/ystemsrx/smart-shop" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="w-12 h-12 bg-gray-900 text-white rounded-full flex items-center justify-center hover:bg-gray-800 transition-colors"
              aria-label="查看GitHub源码"
            >
              <i className="fab fa-github"></i>
            </a>
          </div>
        </div>
        
        <div className="mt-8 pt-8 border-t border-gray-200 text-center text-gray-400 text-sm">
          <p>© {currentYear} {shopName}. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}

// Main Page Component
export default function Home() {
  const shopName = getShopName()
  
  const smoothScrollTo = (targetPosition: number, duration = 1200) => {
    if (typeof window === 'undefined') return
    const root = document.documentElement
    // Temporarily disable global smooth scroll so custom easing renders correctly
    const previousBehavior = root.style.scrollBehavior
    root.style.scrollBehavior = 'auto'
    const startPosition = window.scrollY || window.pageYOffset
    const distance = targetPosition - startPosition
    let startTime: number | null = null
    let animationFrameId: number | null = null

    const easeInOutCubic = (t: number) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

    const animation = (currentTime: number) => {
      if (startTime === null) startTime = currentTime
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      const ease = easeInOutCubic(progress)

      window.scrollTo(0, startPosition + distance * ease)

      if (elapsed < duration) {
        animationFrameId = requestAnimationFrame(animation)
      } else {
        window.scrollTo(0, targetPosition)
        root.style.scrollBehavior = previousBehavior
      }
    }

    animationFrameId = requestAnimationFrame(animation)

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId)
      root.style.scrollBehavior = previousBehavior
    }
  }

  const handleLearnMoreClick = () => {
    if (typeof window === 'undefined') return
    const target = document.getElementById('features')
    if (!target) return

    const targetPosition = target.getBoundingClientRect().top + window.pageYOffset
    smoothScrollTo(targetPosition, 1400)
  }

  return (
    <main className="overflow-x-hidden">
      <HeroSection onLearnMore={handleLearnMoreClick} shopName={shopName} />
      <FeaturesSection />
      <DataVisualization />
      <CTASection />
      <Footer shopName={shopName} />
    </main>
  )
}

