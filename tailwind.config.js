/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink:     "#15140F",
        panel:   "#211F18",
        panel2:  "#2A2820",
        line:    "#3A3629",
        gold:    "#D3B45F",   // brass — timer, buttons, key numbers
        goldDim: "#8A7838",
        silver:  "#4E86C6",   // Allies
        silverDim:"#33587F",
        parch:   "#EDE4CE",
        muted:   "#948C77",
        alarm:   "#F03B2E",
        ok:      "#8FAE5C",
      },
      fontFamily: {
        display: ['"Noto Kufi Arabic"', "system-ui", "sans-serif"],
        body:    ['"IBM Plex Sans Arabic"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
