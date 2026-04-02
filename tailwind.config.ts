import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";
import tailwindcssTypography from "@tailwindcss/typography";

export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        pending: {
          DEFAULT: "hsl(var(--pending))",
          foreground: "hsl(var(--pending-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
        /* ── Legacy `gold.*` utilities：与会员端默认主色 #4d8cff 对齐（新代码请用 pu-gold*） ── */
        gold: {
          DEFAULT: "#4d8cff",
          soft: "#93c5fd",
          deep: "#2563eb",
          muted: "rgba(77,140,255,0.12)",
        },
        emerald: {
          DEFAULT: "#34D399",
          soft: "rgba(52,211,153,0.15)",
        },
        rose: {
          DEFAULT: "#FB7185",
          soft: "rgba(251,113,133,0.15)",
        },
        violet: {
          DEFAULT: "#A78BFA",
          soft: "rgba(167,139,250,0.15)",
          deep: "#7C3AED",
        },
        navy: {
          DEFAULT: "#0F172A",
          deep: "#070B14",
        },
        /* HSL components from .member-portal-wrap (--pu-*) — premium-ui-boost parity */
        "pu-gold": "hsl(var(--pu-gold) / <alpha-value>)",
        "pu-gold-soft": "hsl(var(--pu-gold-soft) / <alpha-value>)",
        "pu-gold-deep": "hsl(var(--pu-gold-deep) / <alpha-value>)",
        "pu-primary": "hsl(var(--pu-primary) / <alpha-value>)",
        "pu-emerald": "hsl(var(--pu-emerald) / <alpha-value>)",
        "pu-emerald-soft": "hsl(var(--pu-emerald-soft) / <alpha-value>)",
        "pu-rose": "hsl(var(--pu-rose) / <alpha-value>)",
        "pu-rose-soft": "hsl(var(--pu-rose-soft) / <alpha-value>)",
        "pu-violet": "hsl(var(--pu-violet) / <alpha-value>)",
        "pu-violet-soft": "hsl(var(--pu-violet-soft) / <alpha-value>)",
        "pu-silver": "hsl(var(--pu-silver) / <alpha-value>)",
        "pu-silver-soft": "hsl(var(--pu-silver-soft) / <alpha-value>)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        serif: ["var(--font-serif)"],
        mono: ["var(--font-mono)"],
      },
      boxShadow: {
        soft: "0 10px 30px rgba(15, 23, 42, 0.08)",
        glow: "0 0 0 1px rgba(212, 168, 83, 0.25), 0 16px 40px rgba(212, 168, 83, 0.16)",
        "glow-gold": "0 4px 20px -6px rgba(212,168,83,0.5)",
        "glow-emerald": "0 4px 20px -6px rgba(52,211,153,0.45)",
        "glow-rose": "0 4px 16px -6px rgba(251,113,133,0.4)",
        "glow-violet": "0 4px 20px -6px rgba(167,139,250,0.5)",
        "pu-glow-gold": "0 6px 20px -6px hsl(var(--pu-gold) / 0.4)",
        "pu-glow-rose": "0 6px 20px -6px hsl(var(--pu-rose) / 0.35)",
        "pu-glow-emerald": "0 6px 20px -6px hsl(var(--pu-emerald) / 0.35)",
        surface: "0 2px 8px -2px rgb(0 0 0 / 0.06)",
        "surface-lg": "0 8px 24px -8px rgb(0 0 0 / 0.1)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "glow-pulse": {
          "0%, 100%": { opacity: "0.6" },
          "50%": { opacity: "1" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { transform: "scale(0.95)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "shimmer-slide": {
          "0%": { backgroundPosition: "-100% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "slide-in-from-top": {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(0)" },
        },
        "slide-in-from-bottom": {
          "0%": { transform: "translateY(100%)" },
          "100%": { transform: "translateY(0)" },
        },
        "slide-in-from-left": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(0)" },
        },
        "slide-in-from-right": {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "shimmer-slide": "shimmer-slide 2s ease-in-out infinite",
        "fade-in": "fade-in 0.3s ease-out",
        "glow-pulse": "glow-pulse 3s ease-in-out infinite",
        "float": "float 4s ease-in-out infinite",
        "scale-in": "scale-in 0.2s ease-out",
        "slide-in-from-top": "slide-in-from-top 0.3s ease-out",
        "slide-in-from-bottom": "slide-in-from-bottom 0.3s ease-out",
        "slide-in-from-left": "slide-in-from-left 0.3s ease-out",
        "slide-in-from-right": "slide-in-from-right 0.3s ease-out",
      },
    },
  },
  plugins: [tailwindcssAnimate, tailwindcssTypography],
} satisfies Config;
