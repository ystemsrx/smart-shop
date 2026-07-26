/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./app/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        "primary": "#d97757",
        "primary-deep": "#c85c34",
        "ink": "#1c1917",
        "background-light": "#f8f7f6",
        "background-dark": "#221810",
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.22, 1, 0.36, 1)",
        "drawer": "cubic-bezier(0.32, 0.72, 0, 1)",
      },
      fontFamily: {
        "display": ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "PingFang SC", "Microsoft YaHei", "Helvetica Neue", "Arial", "sans-serif"],
        "serif": ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "PingFang SC", "Microsoft YaHei", "Helvetica Neue", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
}
