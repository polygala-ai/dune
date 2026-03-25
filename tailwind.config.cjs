/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'app-accent': 'var(--app-accent)',
        'app-accent-ink': 'var(--app-accent-ink)',
        'app-accent-soft': 'var(--app-accent-soft)',
        'app-bg': 'var(--app-bg)',
        'app-border': 'var(--app-border)',
        'app-border-strong': 'var(--app-border-strong)',
        'app-card': 'var(--app-card)',
        'app-muted': 'var(--app-muted)',
        'app-muted-strong': 'var(--app-muted-strong)',
        'app-panel': 'var(--app-panel)',
        'app-panel-strong': 'var(--app-panel-strong)',
        'app-text': 'var(--app-text)',
      },
      fontFamily: {
        mono: ['var(--font-mono)'],
        sans: ['var(--font-sans)'],
      },
    },
  },
  plugins: [],
};
