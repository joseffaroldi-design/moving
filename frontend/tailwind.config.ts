import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        heading: ["var(--font-chivo)", "sans-serif"],
        sans: ["var(--font-plex)", "sans-serif"],
      },
      colors: {
        navy: {
          DEFAULT: "#0B1527",
          900: "#0B1527",
        },
        slate: {
          50: "#F8FAFC",
          100: "#F1F5F9",
          200: "#E2E8F0",
          300: "#CBD5E1",
          400: "#94A3B8",
          500: "#64748B",
          600: "#475569",
          700: "#334155",
          800: "#1E293B",
          900: "#0F172A",
        },
        accent: {
          DEFAULT: "#2563EB",
          hover: "#1D4ED8",
          muted: "#EFF6FF",
        },
      },
      borderRadius: {
        md: "6px",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(15 23 42 / 0.06)",
        dropdown: "0 10px 25px -5px rgb(15 23 42 / 0.15)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.25s ease-out",
        shimmer: "shimmer 1.5s infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
