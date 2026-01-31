import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#0a7ea4',
        background: '#ffffff',
        'background-dark': '#151718',
        surface: '#f5f5f5',
        'surface-dark': '#1e2022',
        foreground: '#11181C',
        'foreground-dark': '#ECEDEE',
        muted: '#687076',
        'muted-dark': '#9BA1A6',
        border: '#E5E7EB',
        'border-dark': '#334155',
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
};

export default config;
