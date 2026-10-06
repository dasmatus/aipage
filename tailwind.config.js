/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  theme: {
    extend: {
      colors: {
        border: "var(--border-color)",
        background: "var(--bg-color)",
        foreground: "var(--text-color)",
        primary: {
          DEFAULT: "var(--accent-color)",
          foreground: "var(--accent-text)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "var(--secondary-text)",
          foreground: "var(--secondary-text)",
        },
      },
      borderRadius: {
        lg: "var(--bubble-radius)",
        md: "calc(var(--bubble-radius) - 2px)",
      },
    },
  },
}
