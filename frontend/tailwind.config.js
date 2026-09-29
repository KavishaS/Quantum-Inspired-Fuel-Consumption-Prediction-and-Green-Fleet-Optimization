/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["'Outfit'", "sans-serif"],
        sans: ["'Inter'", "sans-serif"],
        mono: ["'Fira Code'", "monospace"],
      },
      colors: {
        navy: { DEFAULT: "#09090b", deep: "#000000", 50: "#18181b" },
        steel: "#27272a",
        signal: "#38bdf8", // Sky blue for primary
        foam: "#09090b",   // Zinc 950 for background
        slate: { ink: "#f4f4f5", body: "#a1a1aa", line: "#27272a" },
        positive: "#10b981", // Emerald
        warn: "#f59e0b",     // Amber
        danger: "#ef4444",   // Red
      },
      boxShadow: { 
        card: "0 1px 3px 0 rgba(0, 0, 0, 0.5), 0 1px 2px -1px rgba(0, 0, 0, 0.5)",
        glow: "0 0 20px rgba(56, 189, 248, 0.15)"
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'fade-in-up': 'fadeInUp 0.5s ease-out forwards',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        }
      }
    },
  },
  plugins: [],
};
