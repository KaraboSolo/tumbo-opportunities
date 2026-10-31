/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#24448f", dark: "#1b3470", light: "#eef2fb" },
        ink: { DEFAULT: "#1d1d1f", soft: "#6e6e73", faint: "#86868b" },
        canvas: "#f5f5f7",
        hairline: "rgba(0, 0, 0, 0.08)",
      },
      fontFamily: {
        sans: [
          "-apple-system", "BlinkMacSystemFont", "SF Pro Text", "Segoe UI", "Roboto", "Helvetica Neue", "Arial",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.05)",
        lift: "0 2px 4px rgba(0,0,0,0.05), 0 16px 40px rgba(0,0,0,0.08)",
      },
      keyframes: {
        rise: { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "none" } },
        fade: { from: { opacity: "0" }, to: { opacity: "1" } },
      },
      animation: {
        rise: "rise 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) both",
        fade: "fade 0.6s ease both",
      },
    },
  },
  plugins: [],
};
