import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        vazir: ["var(--font-vazirmatn)", "sans-serif"],
      },
      colors: {
        brand: {
          50: "#fff8f1",
          100: "#feefdc",
          200: "#fcdab7",
          300: "#f9be86",
          400: "#f59752",
          500: "#f1762c",
          600: "#e25920",
          700: "#bb421c",
          800: "#95361e",
          900: "#792e1c",
        },
      },
    },
  },
  plugins: [],
};

export default config;
