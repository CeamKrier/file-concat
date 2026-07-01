import tailwindcssAnimate from "tailwindcss-animate";

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-body)"],
        display: ["var(--font-display)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        input: "10px",
        chip: "8px",
        card: "14px",
        panel: "18px",
        pill: "999px",
      },
      colors: {
        background: "oklch(var(--background))",
        foreground: "oklch(var(--foreground))",
        card: {
          DEFAULT: "oklch(var(--card))",
          foreground: "oklch(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "oklch(var(--popover))",
          foreground: "oklch(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "oklch(var(--primary))",
          foreground: "oklch(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "oklch(var(--secondary))",
          foreground: "oklch(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "oklch(var(--muted))",
          foreground: "oklch(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "oklch(var(--accent))",
          foreground: "oklch(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "oklch(var(--destructive))",
          foreground: "oklch(var(--destructive-foreground))",
        },
        border: "oklch(var(--border))",
        input: "oklch(var(--input))",
        ring: "oklch(var(--ring))",
        // Extended warm-dark palette (redesign)
        surface: {
          DEFAULT: "oklch(var(--card))",
          alt: "oklch(var(--surface-alt))",
          inset: "oklch(var(--surface-inset))",
          cli: "oklch(var(--surface-cli))",
        },
        hairline: "oklch(var(--hairline))",
        "border-strong": "oklch(var(--border-strong))",
        ink: {
          DEFAULT: "oklch(var(--foreground))",
          secondary: "oklch(var(--text-secondary))",
          muted: "oklch(var(--text-muted))",
          faint: "oklch(var(--text-faint))",
        },
        go: {
          DEFAULT: "oklch(var(--go))",
          fg: "oklch(var(--go-text))",
        },
        info: "oklch(var(--info))",
        "neutral-info": "oklch(var(--neutral-info))",
        code: "oklch(var(--code-text))",
        chart: {
          1: "oklch(var(--chart-1))",
          2: "oklch(var(--chart-2))",
          3: "oklch(var(--chart-3))",
          4: "oklch(var(--chart-4))",
          5: "oklch(var(--chart-5))",
        },
      },
      transitionTimingFunction: {
        "out-quart": "cubic-bezier(0.25, 1, 0.5, 1)",
        "out-quint": "cubic-bezier(0.22, 1, 0.36, 1)",
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        float: "float 3.4s ease-in-out infinite",
        "fade-up": "fade-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) both",
      },
      zIndex: {
        dropdown: "30",
        sticky: "40",
        "modal-backdrop": "50",
        modal: "60",
        // Popovers/dropdowns opened from inside a modal (e.g. the settings
        // drawer's model picker) must float above it, not behind.
        popover: "65",
        toast: "70",
        tooltip: "80",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
