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
        line: {
          DEFAULT: "#EAE8E3",
          // An unticked tick box's border.
          strong: "#D8D5CE",
        },
        surface: "#FFFFFF",
        canvas: "#F7F6F3",
        // Quieter than `muted`: counts, «ضمن: …», «لا تُطوى».
        faint: "#9A9AA4",
        // A neutral status chip's text and fill, and a bordered icon button's icon.
        slate: {
          DEFAULT: "#5B6273",
          soft: "#F1F2F5",
        },
        // A due-date chip's fill.
        chip: "#F4F3EF",
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
          // An overdue row's border, and the «متأخّرة» count beside its heading.
          line: "#E4CFCB",
          muted: "#B57366",
        },
        urgent: {
          DEFAULT: "#C05A17",
          bg: "#FCEEDF",
        },
        // Per-person avatar swatches — the same five as mobile's `avatarPalette`.
        avatar: {
          blueBg: "#EAEFFB",
          blueFg: "#4A6FD4",
          violetBg: "#F3ECFB",
          violetFg: "#8B5FC7",
          amberBg: "#FBEFE6",
          amberFg: "#B9743A",
          greenBg: "#E6F4EE",
          greenFg: "#1F7A5C",
          slateBg: "#EDEFF3",
          slateFg: "#5B6273",
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
