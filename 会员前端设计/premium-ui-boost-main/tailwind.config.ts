import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      fontFamily: {
        sans: ["Plus Jakarta Sans", "system-ui", "-apple-system", "sans-serif"],
        mono: ["Space Mono", "monospace"],
      },
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
        /* Financial palette */
        gold: {
          DEFAULT: "hsl(var(--gold))",
          soft: "hsl(var(--gold-soft))",
          deep: "hsl(var(--gold-deep))",
          muted: "hsl(var(--gold-muted))",
        },
        emerald: {
          DEFAULT: "hsl(var(--emerald))",
          soft: "hsl(var(--emerald-soft))",
        },
        rose: {
          DEFAULT: "hsl(var(--rose))",
          soft: "hsl(var(--rose-soft))",
        },
        silver: {
          DEFAULT: "hsl(var(--silver))",
          soft: "hsl(var(--silver-soft))",
        },
        navy: {
          DEFAULT: "hsl(var(--navy))",
          deep: "hsl(var(--navy-deep))",
        },
        /* Backward compat aliases */
        violet: {
          DEFAULT: "hsl(var(--violet))",
          soft: "hsl(var(--violet-soft))",
          deep: "hsl(var(--violet-deep))",
        },
        mint: {
          DEFAULT: "hsl(var(--mint))",
          soft: "hsl(var(--mint-soft))",
        },
        coral: {
          DEFAULT: "hsl(var(--coral))",
          soft: "hsl(var(--coral-soft))",
        },
        "slate-cool": "hsl(var(--slate-cool))",
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
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        "2xl": "1.25rem",
        "3xl": "1.5rem",
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
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { transform: "scale(0.95)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "glow-pulse": "glow-pulse 3s ease-in-out infinite",
        "float": "float 4s ease-in-out infinite",
        "fade-in": "fade-in 0.3s ease-out",
        "scale-in": "scale-in 0.2s ease-out",
      },
      boxShadow: {
        "glow-gold": "0 4px 20px -6px hsl(219 100% 65% / 0.5)",
        "glow-emerald": "0 4px 20px -6px hsl(160 50% 42% / 0.45)",
        "glow-rose": "0 4px 16px -6px hsl(0 55% 55% / 0.4)",
        "glow-violet": "0 4px 20px -6px hsl(252 100% 68% / 0.5)",
        "glow-mint": "0 4px 20px -6px hsl(160 50% 42% / 0.45)",
        "glow-coral": "0 4px 16px -6px hsl(0 55% 55% / 0.4)",
        "surface": "0 2px 8px -2px rgb(0 0 0 / 0.06)",
        "surface-lg": "0 8px 24px -8px rgb(0 0 0 / 0.1)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
