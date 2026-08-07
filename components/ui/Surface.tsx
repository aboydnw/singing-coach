import { Box, type BoxProps } from "@chakra-ui/react";

export type SurfaceVariant = "base" | "raised" | "subtle" | "inverse";

const VARIANTS: Record<SurfaceVariant, BoxProps> = {
  base: {
    bg: "bg.surface",
    borderWidth: "1px",
    borderColor: "border.default",
    rounded: "surface",
  },
  raised: {
    bg: "bg.surface",
    borderWidth: "1px",
    borderColor: "border.default",
    rounded: "surface",
    boxShadow: "raised",
  },
  subtle: { bg: "bg.subtle", rounded: "inner" },
  inverse: { bg: "bg.inverse", color: "fg.inverse", rounded: "surface" },
};

export function Surface({
  variant = "base",
  ...props
}: BoxProps & { variant?: SurfaceVariant }) {
  return <Box {...VARIANTS[variant]} {...props} />;
}
