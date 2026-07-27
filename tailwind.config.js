/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#080c18",
        line: "#25335f",
        gold: "#d9a441",
        silver: "#afc0da",
        parch: "#efe7d4",
        muted: "#8794b8",
        alarm: "#e57a6f",
        ok: "#6fbf95",
      },
    },
  },
  plugins: [],
};
