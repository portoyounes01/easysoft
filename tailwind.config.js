import colors from 'tailwindcss/colors';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: colors.green,
        secondary: colors.purple,
        neutral: colors.gray,
        error: colors.red,
        warning: colors.amber,
        info: colors.blue,
        valid: colors.green,
      },
      backgroundImage: {
        // Gradient utilities - use as bg-gradient-primary, bg-gradient-valid, etc.
        'gradient-primary': `linear-gradient(135.7deg, ${colors.green[500]} -33%, ${colors.green[700]} 100%)`,
        'gradient-primary-horizontal': `linear-gradient(90deg, ${colors.green[500]} 0%, ${colors.green[700]} 100%)`,
        'gradient-secondary': `linear-gradient(135.7deg, ${colors.purple[500]} -33%, ${colors.purple[700]} 100%)`,
        'gradient-valid': `linear-gradient(135.7deg, ${colors.green[500]} -33%, ${colors.green[700]} 100%)`,
        'gradient-error': `linear-gradient(135.7deg, ${colors.red[500]} -33%, ${colors.red[700]} 100%)`,
        'gradient-warning': `linear-gradient(135.7deg, ${colors.amber[500]} -33%, ${colors.amber[700]} 100%)`,
        'gradient-info': `linear-gradient(135.7deg, ${colors.blue[500]} -33%, ${colors.blue[700]} 100%)`,
      },
    },
  },
  safelist: [
    {
      pattern: /bg-(primary|secondary|neutral|error|warning|info|valid)-(50|100|200|300|400|500|600|700|800|900)/,
    },
    {
      pattern: /bg-gradient-(primary|primary-horizontal|secondary|valid|error|warning|info)/,
    },
  ],
  plugins: [],
};
