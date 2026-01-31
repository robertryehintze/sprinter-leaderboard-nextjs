/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#0a7ea4',
        success: '#22C55E',
        warning: '#F59E0B',
        error: '#EF4444',
        gold: '#FFD700',
        silver: '#C0C0C0',
        bronze: '#CD7F32',
      },
    },
  },
  plugins: [],
}
