import { Box, Button, Flex, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Surface } from "@/components/ui/Surface";

function Foundations() {
  return (
    <Stack gap={8}>
      <Box>
        <Eyebrow>Semantic foundations</Eyebrow>
        <Text mt={2} fontSize="2xl" fontWeight="semibold">
          Meaning before copied values
        </Text>
      </Box>
      <SimpleGrid columns={{ base: 1, md: 4 }} gap={4}>
        <Surface p={4}>Base surface</Surface>
        <Surface variant="raised" p={4}>
          Raised surface
        </Surface>
        <Surface variant="subtle" p={4}>
          Subtle surface
        </Surface>
        <Surface variant="inverse" p={4}>
          Inverse surface
        </Surface>
      </SimpleGrid>
      <Flex gap={3} wrap="wrap">
        <Button colorPalette="coral">Primary action</Button>
        <Button colorPalette="teal" variant="outline">
          Singer choice
        </Button>
        <Button variant="plain">Quiet action</Button>
      </Flex>
    </Stack>
  );
}

const meta = {
  title: "Foundations/Semantic roles",
  component: Foundations,
} satisfies Meta<typeof Foundations>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
