import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        serif: ["var(--font-playfair)", "Georgia", "serif"],
        heading: ["var(--font-chivo)", "sans-serif"],
        sans: ["var(--font-plex)", "sans-serif"],
      },
      colors: {
        navy: {
          DEFAULT: "#0E2A4A",
          900: "#0B2038",
          800: "#13385F",
          700: "#1C4372",
        },
        gold: {
          DEFAULT: "#C89A3D",
          hover: "#B0842E",
          soft: "#F0E6C8",
          light: "#EFDFB4",
        },
        cream: {
          DEFAULT: "#F7F0DF",
          100: "#FBF7EC",
        },
        ink: "#10233F",
        muted: "#667085",
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
          DEFAULT: "#0E2A4A",
          hover: "#0B2038",
          muted: "#F0E6C8",
        },
      },
      borderRadius: { md: "6px" },
      boxShadow: {
        card: "0 1px 2px 0 rgb(14 42 74 / 0.06)",
        dropdown: "0 10px 25px -5px rgb(14 42 74 / 0.18)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: { "100%": { transform: "translateX(100%)" } },
      },
      animation: {
        "fade-in": "fade-in 0.25s ease-out",
        shimmer: "shimmer 1.5s infinite",
      },
    },
  },
  plugins: [animate],
};

export default config;
