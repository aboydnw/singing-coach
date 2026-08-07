import type { StorybookConfig } from "@storybook/react-vite";
import { resolve } from "node:path";
import { mergeConfig } from "vite";

const config: StorybookConfig = {
  stories: ["../components/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y"],
  framework: { name: "@storybook/react-vite", options: {} },
  async viteFinal(config) {
    return mergeConfig(config, {
      resolve: { alias: { "@": resolve(process.cwd()) } },
    });
  },
};

export default config;
