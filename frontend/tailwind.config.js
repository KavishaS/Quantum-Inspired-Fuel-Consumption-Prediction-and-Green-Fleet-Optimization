/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        brand: ["'Montserrat'", "'Inter'", "sans-serif"],
        display: ["'Outfit'", "'Montserrat'", "sans-serif"],
        sans: ["'Inter'", "sans-serif"],
        mono: ["'Fira Code'", "monospace"],
      },
      colors: {
        /* ── Light theme palette ─────────────────────────── */
        navy:    { DEFAULT: "#ffffff", deep: "#f8fafc", 50: "#f1f5f9" },
        steel:   "#64748b",
        signal:  "#0284c7",       // Sky-600 — primary accent
        foam:    "#f8fafc",       // Slate-50 background
        slate:   {
          ink:  "#0f172a",        // Very dark text
          body: "#64748b",        // Mid-gray body text
          line: "#e2e8f0",        // Light border
        },
        positive: "#059669",      // Emerald-600
        warn:     "#d97706",      // Amber-600
        danger:   "#dc2626",      // Red-600
      },
      boxShadow: {
        card: "0 1px 3px 0 rgba(0, 0, 0, 0.06), 0 1px 2px -1px rgba(0, 0, 0, 0.06)",
        glow: "0 0 20px rgba(2, 132, 199, 0.10)",
        soft: "0 4px 24px -2px rgba(0, 0, 0, 0.06)",
        elevated: "0 10px 40px -8px rgba(0, 0, 0, 0.08)",
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
