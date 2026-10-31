/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#24448f", dark: "#1b3470", light: "#eef2fa" },
      },
    },
  },
  plugins: [],
};
