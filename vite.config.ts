import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 部署到 GitHub Pages 时，站点地址是 https://<用户名>.github.io/<仓库名>/
// 所以 base 必须写成 "/仓库名/"。如果你的仓库名不是 dorm-duty，
// 改下面这一行即可（末尾的斜杠不能少）。
export default defineConfig({
  base: '/dorm-duty/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    // 微信内置浏览器（尤其是老版本 Android WebView）对最新语法支持有限，
    // 把目标降到 es2015 能显著降低白屏概率。
    target: 'es2015',
    sourcemap: false,
  },
  server: {
    host: true,
    port: 5173,
  },
})
