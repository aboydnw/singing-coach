"use client";

import { Flex, Link, Text } from "@chakra-ui/react";
import NextLink from "next/link";
import { SOURCE_URL, buildInfo } from "@/lib/buildInfo";

const BUILD = buildInfo(
  process.env.NEXT_PUBLIC_COMMIT_SHA,
  process.env.NEXT_PUBLIC_BUILT_AT,
);

/** Quiet site footer: privacy policy, source code, and which build is running. */
export function AppFooter() {
  return (
    <Flex
      as="footer"
      gap={{ base: 2, md: 4 }}
      wrap="wrap"
      justify="center"
      fontSize="xs"
      color="fg.muted"
      py={6}
      px={4}
    >
      <Link asChild color="fg.muted" textDecoration="underline">
        <NextLink href="/privacy">Privacy policy</NextLink>
      </Link>
      <Link
        href={SOURCE_URL}
        target="_blank"
        rel="noreferrer"
        color="fg.muted"
        textDecoration="underline"
      >
        Source code
      </Link>
      {BUILD.version && BUILD.versionUrl ? (
        <Link
          href={BUILD.versionUrl}
          target="_blank"
          rel="noreferrer"
          color="fg.muted"
          textDecoration="underline"
        >
          Version {BUILD.version}
        </Link>
      ) : null}
      {BUILD.updated ? <Text>Updated {BUILD.updated}</Text> : null}
    </Flex>
  );
}
