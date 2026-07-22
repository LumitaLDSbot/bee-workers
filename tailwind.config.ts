import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bee: {
          DEFAULT: '#FFB800',
          dark: '#E0A800',
        },
        ink: '#1A1A1A',
        cream: '#FFFAF0',
        card: '#F5F5F0',
        muted: '#8B8B8B',
      },
      fontFamily: {
        sans: ['var(--font-space-grotesk)', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 10px 30px rgba(26, 26, 26, 0.08)',
        card: '0 6px 24px rgba(26, 26, 26, 0.06)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
};

export default config;
