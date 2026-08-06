import { Text } from "@chakra-ui/react";

export function Eyebrow({
  children,
  tone = "focus",
}: {
  children: React.ReactNode;
  tone?: "focus" | "agency" | "muted" | "inverse";
}) {
  const color = {
    focus: "coaching.focus",
    agency: "singer.agency",
    muted: "fg.muted",
    inverse: "coral.200",
  }[tone];
  return (
    <Text
      color={color}
      fontSize="xs"
      fontWeight="semibold"
      letterSpacing="0.08em"
      textTransform="uppercase"
    >
      {children}
    </Text>
  );
}
