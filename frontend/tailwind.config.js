/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        dark: {
          50: '#c9d1d9',
          100: '#b1bac4',
          200: '#8b949e',
          300: '#6e7681',
          400: '#484f58',
          500: '#30363d',
          600: '#21262d',
          700: '#161b22',
          800: '#0d1117',
          900: '#010409',
        },
        attack: {
          DEFAULT: '#ff3b3b',
          light: '#ff6b6b',
          dark: '#cc0000',
        },
        benign: {
          DEFAULT: '#3fb950',
          light: '#56d364',
          dark: '#2ea043',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}
