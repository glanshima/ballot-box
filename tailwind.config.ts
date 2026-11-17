import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: '#0A2A66',
          royal: '#1B4DD8',
          azure: '#3B76E8',
          sky: '#EAF2FF',
          mist: '#F4F8FF',
        },
      },
      fontFamily: {
        landing: ['Segoe UI Variable Text', 'Segoe UI', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Segoe UI Variable Display', 'Segoe UI', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 28px 70px -28px rgba(10, 42, 102, 0.45)',
        pill: '0 10px 30px -18px rgba(10, 42, 102, 0.4)',
      },
    },
  },
  plugins: [],
};
export default config;
