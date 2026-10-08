/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {
    colors: { ink: '#261912', ember: '#bd4a27', spice: '#e6a36e', cream: '#fbf7f1', sand: '#e9d8c6' },
    fontFamily: { sans: ['DM Sans', 'Noto Sans Bengali', 'sans-serif'], display: ['Playfair Display', 'Noto Sans Bengali', 'serif'] }
  } },
  plugins: []
};
