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
        "primary": "#ec6d13",
        "background-light": "#f8f7f6",
        "background-dark": "#221810",
      },
      fontFamily: {
        "display": ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "PingFang SC", "Microsoft YaHei", "Helvetica Neue", "Arial", "sans-serif"],
        "serif": ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "PingFang SC", "Microsoft YaHei", "Helvetica Neue", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
}
