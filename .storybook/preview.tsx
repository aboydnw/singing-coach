import { ChakraProvider } from "@chakra-ui/react";
import type { Preview } from "@storybook/react-vite";
import { system } from "../lib/theme";

const preview: Preview = {
  decorators: [
    (Story) => (
      <ChakraProvider value={system}>
        <div style={{ minHeight: "100vh", padding: "2rem" }}>
          <Story />
        </div>
      </ChakraProvider>
    ),
  ],
  parameters: {
    controls: { expanded: true },
    a11y: { test: "todo" },
    layout: "fullscreen",
  },
};

export default preview;
