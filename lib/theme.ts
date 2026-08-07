"use client";

import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

/** The warm cream/coral palette carried over from the Gradio THEME in app.py. */
const config = defineConfig({
  globalCss: {
    html: {
      scrollBehavior: "smooth",
    },
    body: {
      bg: "cream.100",
      color: "ink.900",
      fontFeatureSettings: '"kern", "liga", "tnum"',
      backgroundImage:
        "radial-gradient(circle at 8% 2%, rgba(238,156,124,.11), transparent 28rem), radial-gradient(circle at 92% 38%, rgba(0,145,124,.055), transparent 30rem)",
    },
    "button, a": {
      transition:
        "transform 180ms ease, background-color 180ms ease, border-color 180ms ease, color 180ms ease",
    },
    "button:active": {
      transform: "translateY(1px)",
    },
  },
  theme: {
    tokens: {
      colors: {
        coral: {
          50: { value: "#FDF1EC" },
          100: { value: "#FADFD4" },
          200: { value: "#F5BFA9" },
          300: { value: "#EE9C7C" },
          400: { value: "#E37450" },
          500: { value: "#D64B2A" },
          600: { value: "#B93E20" },
          700: { value: "#973219" },
          800: { value: "#742713" },
          900: { value: "#521B0D" },
          950: { value: "#3A1309" },
        },
        teal: {
          50: { value: "#E9F7F4" },
          100: { value: "#CDEEE7" },
          200: { value: "#9CDDD0" },
          300: { value: "#66C9B7" },
          400: { value: "#2FAD99" },
          500: { value: "#00917C" },
          600: { value: "#007A68" },
          700: { value: "#006254" },
          800: { value: "#004B40" },
          900: { value: "#00352D" },
          950: { value: "#00251F" },
        },
        cream: {
          50: { value: "#FFFDF8" },
          100: { value: "#FFF8EF" },
          200: { value: "#F5EBDD" },
          300: { value: "#E8D9C5" },
          400: { value: "#C9B39C" },
          500: { value: "#A98F77" },
          600: { value: "#8A7566" },
          700: { value: "#6B594C" },
          800: { value: "#4E4038" },
          900: { value: "#3D2C29" },
          950: { value: "#2A1E1C" },
        },
        ink: {
          900: { value: "#3D2C29" },
        },
        panel: {
          DEFAULT: { value: "#FFFDF6" },
        },
        grid: {
          DEFAULT: { value: "#EADFCE" },
        },
        healthy: {
          DEFAULT: { value: "#4C9A70" },
        },
      },
      shadows: {
        raised: { value: "0 18px 50px rgba(92, 61, 43, .08)" },
        active: { value: "0 18px 45px rgba(135, 76, 46, .10)" },
        overlay: { value: "0 -8px 30px rgba(92, 61, 43, .07)" },
      },
      radii: {
        surface: { value: "1rem" },
        inner: { value: "0.625rem" },
      },
      durations: {
        fast: { value: "120ms" },
        normal: { value: "180ms" },
        slow: { value: "260ms" },
      },
      easings: {
        standard: { value: "cubic-bezier(.2, .8, .2, 1)" },
      },
    },
    semanticTokens: {
      colors: {
        bg: {
          canvas: { value: "{colors.cream.100}" },
          surface: { value: "{colors.panel}" },
          subtle: { value: "{colors.cream.50}" },
          inverse: { value: "{colors.cream.900}" },
          overlay: { value: "rgba(255, 248, 239, .94)" },
        },
        fg: {
          default: { value: "{colors.ink.900}" },
          muted: { value: "{colors.cream.700}" },
          subtle: { value: "{colors.cream.500}" },
          inverse: { value: "{colors.cream.50}" },
        },
        border: {
          default: { value: "{colors.grid}" },
          focus: { value: "{colors.coral.500}" },
        },
        action: {
          primary: { value: "{colors.coral.600}" },
          secondary: { value: "{colors.teal.700}" },
        },
        feedback: {
          danger: { value: "{colors.coral.700}" },
          dangerSurface: { value: "{colors.coral.50}" },
          success: { value: "{colors.teal.700}" },
          successSurface: { value: "{colors.teal.50}" },
        },
        coaching: {
          focus: { value: "{colors.coral.700}" },
          surface: { value: "{colors.coral.50}" },
        },
        singer: {
          agency: { value: "{colors.teal.700}" },
          surface: { value: "{colors.teal.50}" },
        },
        coral: {
          solid: { value: "{colors.coral.500}" },
          contrast: { value: "white" },
          fg: { value: "{colors.coral.600}" },
          muted: { value: "{colors.coral.100}" },
          subtle: { value: "{colors.coral.50}" },
          emphasized: { value: "{colors.coral.200}" },
          focusRing: { value: "{colors.coral.500}" },
        },
      },
    },
  },
});

export const system = createSystem(defaultConfig, config);
