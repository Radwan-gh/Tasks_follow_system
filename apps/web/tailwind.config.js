import defaultTheme from "tailwindcss/defaultTheme";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Cairo"', ...defaultTheme.fontFamily.sans],
      },
      // v2 design tokens — docs/app_design/v2-new-style.md §2.
      colors: {
        ink: "#23232A",
        muted: "#8B8B95",
        line: "#EAE8E3",
        surface: "#FFFFFF",
        canvas: "#F7F6F3",
        accent: {
          DEFAULT: "#4A6FD4",
          soft: "#EAEFFB",
        },
        status: {
          new: "#A9AEC0",
          ready: "#6E8AD8",
          inProgress: "#E0A34A",
          done: "#59B08A",
          closed: "#8B8B95",
        },
        alert: {
          DEFAULT: "#C0503C",
          bg: "#FBE9E7",
        },
        urgent: {
          DEFAULT: "#C05A17",
          bg: "#FCEEDF",
        },
      },
      borderRadius: {
        card: "20px",
        sheet: "30px",
        field: "16px",
      },
    },
  },
  plugins: [],
};
