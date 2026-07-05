import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        booth: { bg: "#0c0a0f", accent: "#ff3366", glow: "#ffd166" },
      },
      fontFamily: {
        display: ["Georgia", "Times New Roman", "serif"],
      },
      animation: {
        flash: "flash 0.35s ease-out",
        countdown: "countdown 0.9s ease-in-out",
      },
      keyframes: {
        flash: {
          "0%": { opacity: "0.95" },
          "100%": { opacity: "0" },
        },
        countdown: {
          "0%": { transform: "scale(0.6)", opacity: "0" },
          "40%": { transform: "scale(1.1)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "0.85" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
