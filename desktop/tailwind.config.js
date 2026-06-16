/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        morandi: {
          page: "#F5F0EB",
          card: "#FAF8F5",
          sidebar: "#EDE8E2",
          "sidebar-active": "#E2DCD4",
          accent: "#8B7E74",
          "accent-hover": "#7A6E64",
          "accent-light": "#C4B8AA",
          text: "#4A4540",
          "text-secondary": "#8B8178",
          "text-muted": "#B0A89E",
          border: "#DDD5CB",
          "border-light": "#EBE5DD",
          success: "#8FA68E",
          "success-light": "#D4DFD3",
          warning: "#C2A36B",
          "warning-light": "#ECE0CB",
          danger: "#C4968A",
          "danger-light": "#E8D5CF",
          "drag-over": "#E8E0D6",
          hover: "#F0EAE3",
        },
      },
      fontFamily: { sans: ["Inter", "Noto Sans SC", "-apple-system", "BlinkMacSystemFont", "sans-serif"] },
      boxShadow: {
        morandi: "0 1px 3px rgba(74, 69, 64, 0.06)",
        "morandi-md": "0 4px 12px rgba(74, 69, 64, 0.08)",
        "morandi-lg": "0 8px 24px rgba(74, 69, 64, 0.1)",
      },
    },
  },
  plugins: [],
};
