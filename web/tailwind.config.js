/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        arena: {
          sidebar: "hsl(var(--arena-sidebar))",
          "sidebar-foreground": "hsl(var(--arena-sidebar-foreground))",
          "sidebar-border": "hsl(var(--arena-sidebar-border))",
          "sidebar-active": "hsl(var(--arena-sidebar-active))",
          "sidebar-active-fg": "hsl(var(--arena-sidebar-active-fg))",
          accent: "hsl(var(--arena-accent))",
          "accent-soft": "hsl(var(--arena-accent-soft))",
          "header-blur": "hsl(var(--arena-header-blur))",
          code: {
            DEFAULT: "hsl(var(--arena-code-bg))",
            fg: "hsl(var(--arena-code-fg))",
          },
        },
      },
      boxShadow: {
        arena: "0 1px 0 0 hsl(var(--border) / 0.6), 0 12px 40px -24px hsl(var(--arena-card-shadow) / 0.45)",
        "arena-card": "0 0 0 1px hsl(var(--border) / 0.5), 0 16px 48px -28px hsl(0 0% 0% / 0.35)",
      },
    },
  },
  plugins: [],
}