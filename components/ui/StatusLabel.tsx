import { Badge } from "@chakra-ui/react";

export function StatusLabel({
  status,
}: {
  status: "in_progress" | "ended" | "streaming" | "failed" | "complete";
}) {
  const contract = {
    in_progress: { label: "In progress", palette: "teal" },
    ended: { label: "Ended", palette: "gray" },
    streaming: { label: "Responding", palette: "coral" },
    failed: { label: "Failed", palette: "red" },
    complete: { label: "Complete", palette: "teal" },
  }[status];
  return (
    <Badge colorPalette={contract.palette} variant="subtle">
      {contract.label}
    </Badge>
  );
}
