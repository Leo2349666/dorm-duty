/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
      },
      // 移动端安全区：iPhone 底部小黑条 / 刘海屏
      spacing: {
        'safe-bottom': 'env(safe-area-inset-bottom)',
      },
      boxShadow: {
        // 带一点蓝调的弥散投影，比纯黑投影干净，边缘也更柔
        soft: '0 1px 2px rgba(15, 23, 42, 0.03), 0 12px 32px -18px rgba(30, 47, 90, 0.18)',
        lift: '0 2px 6px rgba(15, 23, 42, 0.05), 0 28px 56px -28px rgba(30, 47, 90, 0.3)',
      },
    },
  },
  plugins: [],
}
