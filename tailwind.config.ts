import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          0: "rgb(var(--color-surface-0) / <alpha-value>)",
          50: "rgb(var(--color-surface-50) / <alpha-value>)",
          100: "rgb(var(--color-surface-100) / <alpha-value>)",
          200: "rgb(var(--color-surface-200) / <alpha-value>)",
          300: "rgb(var(--color-surface-300) / <alpha-value>)",
        },
        brand: {
          50: "rgb(var(--color-brand-50) / <alpha-value>)",
          100: "rgb(var(--color-brand-100) / <alpha-value>)",
          200: "rgb(var(--color-brand-200) / <alpha-value>)",
          300: "rgb(var(--color-brand-300) / <alpha-value>)",
          400: "rgb(var(--color-brand-400) / <alpha-value>)",
          500: "rgb(var(--color-brand-500) / <alpha-value>)",
          600: "rgb(var(--color-brand-600) / <alpha-value>)",
          700: "rgb(var(--color-brand-700) / <alpha-value>)",
          800: "rgb(var(--color-brand-800) / <alpha-value>)",
          900: "rgb(var(--color-brand-900) / <alpha-value>)",
        },
        ink: {
          900: "rgb(var(--color-ink-900) / <alpha-value>)",
          700: "rgb(var(--color-ink-700) / <alpha-value>)",
          500: "rgb(var(--color-ink-500) / <alpha-value>)",
          300: "rgb(var(--color-ink-300) / <alpha-value>)",
          200: "rgb(var(--color-ink-200) / <alpha-value>)",
          100: "rgb(var(--color-ink-100) / <alpha-value>)",
        },
        amber: {
          light: "rgb(var(--color-amber-light) / <alpha-value>)",
          DEFAULT: "rgb(var(--color-amber) / <alpha-value>)",
        },
        rose: {
          light: "rgb(var(--color-rose-light) / <alpha-value>)",
          DEFAULT: "rgb(var(--color-rose) / <alpha-value>)",
        },
        emerald: {
          light: "rgb(var(--color-emerald-light) / <alpha-value>)",
          DEFAULT: "rgb(var(--color-emerald) / <alpha-value>)",
        },
        sky: {
          light: "rgb(var(--color-sky-light) / <alpha-value>)",
          DEFAULT: "rgb(var(--color-sky) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["var(--theme-font-sans)"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      borderRadius: {
        app: "1rem",
        card: "0.75rem",
        btn: "2rem",
        input: "0.625rem",
        avatar: "9999px",
      },
      spacing: {
        "safe-top": "env(safe-area-inset-top, 0px)",
        "safe-bottom": "env(safe-area-inset-bottom, 0px)",
        "safe-left": "env(safe-area-inset-left, 0px)",
        "safe-right": "env(safe-area-inset-right, 0px)",
      },
      boxShadow: {
        card: "0 1px 3px rgba(23, 21, 40, 0.06), 0 1px 2px rgba(23, 21, 40, 0.04)",
        elevated:
          "0 4px 12px rgba(23, 21, 40, 0.08), 0 2px 4px rgba(23, 21, 40, 0.04)",
        modal:
          "0 20px 40px rgba(23, 21, 40, 0.15), 0 8px 16px rgba(23, 21, 40, 0.08)",
      },
    },
  },
  plugins: [],
} satisfies Config;
