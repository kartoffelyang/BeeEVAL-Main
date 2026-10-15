/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#20221f",
        border: "#dedfd8",
        primary: {
          DEFAULT: '#88672e',
          light: '#c69d48',
          dark: '#735624',
        },
        secondary: {
          DEFAULT: '#697a61',
          light: '#879880',
          dark: '#4f6247',
        },
        surface: {
          DEFAULT: '#f7f7f3',
          raised: '#ffffff',
          overlay: '#eeefea',
        },
        sidebar: {
          bg: '#f1f2ec',
        },
        text: {
          primary: '#20221f',
          secondary: '#656a61',
          muted: '#72766e',
          inverse: '#ffffff',
        },
        accent: {
          green: '#36715a',
          red: '#b34840',
          blue: '#697a61',
          amber: '#a17b35',
        },
      },
      fontFamily: {
        sans: ['Geist', 'SF Pro Display', 'PingFang SC', 'Microsoft YaHei', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },
      borderColor: {
        DEFAULT: '#dedfd8',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
    require('tailwind-scrollbar'),
  ],
}
