import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 纯前端直连武大网关（CORS 已实测通过），无需代理。
export default defineConfig({
  // 相对路径：GitHub Pages 的 /<repo>/ 子路径和 Netlify 根路径都能直接用，不会白屏
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    open: false,
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
})
