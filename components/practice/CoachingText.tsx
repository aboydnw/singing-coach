import { Box, Text } from "@chakra-ui/react";
import { CoachMarkdown } from "@/components/practice/CoachMarkdown";
import { practiceResumeSummary } from "@/lib/practiceHome";

/** A short reading layer, not a new diagnosis. The complete source is never discarded. */
export function CoachingText({
  text,
  label,
  inverse = false,
}: {
  text: string;
  label: string;
  inverse?: boolean;
}) {
  const long = text.length > 220 || text.split("\n").length > 3;
  if (!long) return <CoachMarkdown>{text}</CoachMarkdown>;
  return (
    <Box minW={0}>
      <Text lineHeight="1.65" overflowWrap="anywhere">
        {practiceResumeSummary({ focus: text })}
      </Text>
      <Box
        as="details"
        mt={2}
        css={{
          "& > summary": {
            cursor: "pointer",
            minHeight: "44px",
            display: "list-item",
            alignContent: "center",
            fontSize: "sm",
            fontWeight: "medium",
            color: inverse ? "coral.200" : "singer.agency",
            borderRadius: "sm",
          },
          "& > summary:focus-visible": { outline: "2px solid", outlineOffset: "3px" },
          "&[open] > summary": { marginBottom: "0.5rem" },
          "&[open] .coaching-more": { display: "none" },
          "&:not([open]) .coaching-less": { display: "none" },
        }}
      >
        <summary>
          <span className="coaching-more">Read full {label}</span>
          <span className="coaching-less">Hide full {label}</span>
        </summary>
        <CoachMarkdown>{text}</CoachMarkdown>
      </Box>
    </Box>
  );
}
