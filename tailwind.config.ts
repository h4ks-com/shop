import type { Config } from "tailwindcss";

// Theme variables mirrored from h4kslanding/interface/webapp/templates/base.html
// so the shop matches h4ks.com's terminal aesthetic.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#11131c",
        "bg-panel": "#191d2a",
        border: "#2e3550",
        text: "#f0f4ff",
        "text-dim": "#7b8ab0",
        "text-mid": "#b0bfe0",
        accent: "#5c9eff",
        accent2: "#ff8c4b",
        "code-bg": "#11131c",
        "tag-bg": "#1d2238",
      },
      fontFamily: {
        mono: ['"Courier New"', "ui-monospace", "monospace"],
        sans: ["system-ui", "-apple-system", "sans-serif"],
      },
      borderRadius: {
        none: "0",
        DEFAULT: "0",
      },
      maxWidth: {
        container: "1280px",
      },
    },
  },
  plugins: [],
  // Match h4kslanding's `* { border-radius: 0 !important }` directive.
  corePlugins: { borderRadius: false },
};
export default config;
