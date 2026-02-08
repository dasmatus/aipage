/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    './src/**/*.{ts,tsx,html}',
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
        border: "var(--border-color)",
        input: "var(--input-bg)",
        ring: "var(--header-bg)",
        background: "var(--bg-color)",
        foreground: "var(--text-color)",
        primary: {
          DEFAULT: "var(--accent-color)",
          foreground: "var(--accent-text)",
        },
        secondary: {
          DEFAULT: "var(--instruction-bg)",
          foreground: "var(--instruction-text)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "var(--secondary-text)",
          foreground: "var(--secondary-text)",
        },
        accent: {
          DEFAULT: "var(--accent-color)",
          foreground: "var(--accent-text)",
        },
        popover: {
          DEFAULT: "var(--card-bg)",
          foreground: "var(--text-color)",
        },
        card: {
          DEFAULT: "var(--card-bg)",
          foreground: "var(--text-color)",
        },
      },
      borderRadius: {
        lg: "var(--bubble-radius)",
        md: "calc(var(--bubble-radius) - 2px)",
        sm: "calc(var(--bubble-radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
