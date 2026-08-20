/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      colors: {
        // monday.com-style violet — the single action color of the system
        primary: {
          50: '#f0f0ff',
          100: '#e3e3ff',
          200: '#c9c9ff',
          300: '#a5a5ff',
          400: '#8181ff',
          500: '#6161ff',
          600: '#6161ff',
          700: '#4f4fe6',
          800: '#3f3fd6',
          900: '#3535b0',
        },
        // Pastel accent surfaces (surface treatments only, not for text/borders)
        mint: '#bcfe90',
        sky2: '#abf0ff',
        lavender: '#eddff7',
        periwinkle: '#e7ecff',
        aqua: '#d1faff',
        ink: '#333333',
        slate2: '#535768',
        cloud: '#f5f6f8',
        mist: '#d0d4e4',
        pebble: '#dddfeb',
      },
      boxShadow: {
        monday: 'rgba(205, 208, 223, 0.4) 0px 2px 48px 0px',
        'monday-lift': 'rgba(0, 0, 0, 0.15) 0px 5px 45px 0px',
      },
      borderRadius: {
        card: '24px',
        pill: '160px',
      },
    },
  },
  plugins: [],
}
