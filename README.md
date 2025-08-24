# AI Chat - Next.js版本

这是一个基于Next.js的现代AI聊天界面，支持Markdown渲染、代码高亮、数学公式和实时流式响应。

## 功能特性

- 🎨 现代化UI设计，支持响应式布局
- 📝 完整的Markdown和LaTeX渲染支持
- 🎯 代码高亮和复制功能
- ⚡ Server-Sent Events (SSE) 流式响应
- 🛠️ 工具调用可视化
- 🚀 基于Next.js的高性能架构

## 项目结构

```
chatui/
├── components/
│   └── ChatUI.jsx          # 主要聊天组件
├── pages/
│   ├── _app.js             # Next.js应用入口
│   ├── _document.js        # HTML文档配置
│   └── index.js           # 首页
├── styles/
│   └── globals.css        # 全局样式
├── next.config.js         # Next.js配置
├── tailwind.config.js     # Tailwind CSS配置
└── postcss.config.js      # PostCSS配置
```

## 开发环境设置

### 安装依赖

```bash
npm install
```

### 环境变量配置

创建 `.env.local` 文件来配置API URL（可选）：

```bash
# API服务器地址（可选，默认使用内置地址）
NEXT_PUBLIC_API_URL=https://your-api-server.com/v1/chat
```

### 开发模式

```bash
npm run dev
```

应用将在 `http://localhost:3000` 启动。

### 生产构建

```bash
npm run build
npm start
```

## 技术栈

- **框架**: Next.js 14
- **UI库**: React 18
- **样式**: Tailwind CSS
- **Markdown渲染**: markdown-it (CDN)
- **代码高亮**: Prism.js (CDN)
- **数学公式**: KaTeX (CDN)
- **构建工具**: Next.js内置

## API集成

项目支持通过SSE与聊天API进行通信。API需要支持以下消息格式：

### 请求格式
```json
{
  "messages": [
    {"role": "user", "content": "用户消息"},
    {"role": "assistant", "content": "AI回复"},
    {"role": "tool", "content": "工具结果"}
  ]
}
```

### 响应格式
使用Server-Sent Events，支持以下事件类型：
- `message`: 流式文本响应
- `tool_status`: 工具调用状态
- `completed`: 对话完成
- `error`: 错误信息

## 自定义配置

### 修改API地址
在 `.env.local` 中设置 `NEXT_PUBLIC_API_URL`

### 添加新的工具类型
在 `components/ChatUI.jsx` 的 `getDisplayName` 函数中添加新的工具映射

### 自定义样式
修改 `styles/globals.css` 中的CSS变量和类

## 从Vite迁移说明

本项目已从Vite完全迁移到Next.js：

### 主要变化
1. **环境变量**: `import.meta.env` → `process.env`
2. **HTML配置**: `index.html` → `pages/_document.js`
3. **样式导入**: 自动导入 → 在`_app.js`中导入
4. **SSR支持**: 添加了`typeof window`检查
5. **路由**: 文件系统路由

### 保持的功能
- ✅ 所有UI组件和交互
- ✅ Markdown和LaTeX渲染
- ✅ 代码高亮和复制
- ✅ 工具调用显示
- ✅ 流式响应
- ✅ 响应式设计

## 许可证

MIT License
