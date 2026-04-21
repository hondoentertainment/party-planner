/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fdf2ff",
          100: "#fae5ff",
          200: "#f5cbff",
          300: "#eda1ff",
          400: "#e069ff",
          500: "#cc38f5",
          600: "#b01ad6",
          700: "#9213b0",
          800: "#761490",
          900: "#621575",
        },
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', "system-ui", "sans-serif"],
        sans: ['"Inter"', "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06)",
        pop: "0 10px 30px -10px rgba(176, 26, 214, 0.35)",
      },
    },
  },
  plugins: [],
};
