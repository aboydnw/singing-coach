"use client";

import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

/** The warm cream/coral palette carried over from the Gradio THEME in app.py. */
const config = defineConfig({
  globalCss: {
    body: {
      bg: "cream.100",
      color: "ink.900",
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
    },
    semanticTokens: {
      colors: {
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
