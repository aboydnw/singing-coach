import { Box } from "@chakra-ui/react";
import ReactMarkdown from "react-markdown";

export function CoachMarkdown({ children }: { children: string }) {
  return (
    <Box
      fontSize="md"
      fontWeight="normal"
      lineHeight="1.65"
      minW={0}
      overflowWrap="anywhere"
      css={{
        "& > * + *": { marginTop: "0.8em" },
        "& h1, & h2, & h3, & h4, & h5, & h6": { fontSize: "1em", fontWeight: "semibold" },
        "& a": { textDecoration: "underline", textUnderlineOffset: "0.2em" },
        "& pre": { whiteSpace: "pre-wrap" },
        "& strong": { fontWeight: "700" },
        "& em": { fontStyle: "italic" },
        "& ul, & ol": { paddingInlineStart: "1.4em" },
        "& ul": { listStyleType: "disc" },
        "& ol": { listStyleType: "decimal" },
        "& li + li": { marginTop: "0.35em" },
        "& blockquote": {
          borderInlineStartWidth: "3px",
          borderInlineStartColor: "singer.agency",
          paddingInlineStart: "1em",
          color: "inherit",
        },
        "& code": {
          fontFamily: "mono",
          fontSize: "0.9em",

          borderRadius: "sm",
          paddingInline: "0.25em",
        },
      }}
    >
      <ReactMarkdown skipHtml components={{ img: ({ alt }) => <span>{alt}</span> }}>
        {children}
      </ReactMarkdown>
    </Box>
  );
}
