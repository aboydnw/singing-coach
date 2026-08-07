import { Button } from "@chakra-ui/react";

export function ContextAction({
  onClick,
  children = "Explain this",
  inverse = false,
}: {
  onClick: () => void;
  children?: React.ReactNode;
  inverse?: boolean;
}) {
  return (
    <Button
      variant="plain"
      color={inverse ? "cream.400" : "singer.agency"}
      px={0}
      size="xs"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
