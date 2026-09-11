import * as React from "react";
import { createElement, isValidElement, type ReactNode } from "react";
import { Analytics } from "@vercel/analytics/next";
import { describe, expect, it } from "vitest";
import RootLayout from "@/app/layout";

function containsAnalytics(node: ReactNode): boolean {
  if (!isValidElement<{ children?: ReactNode }>(node)) {
    return false;
  }

  if (node.type === Analytics) {
    return true;
  }

  const children = node.props.children;
  return Array.isArray(children)
    ? children.some(containsAnalytics)
    : containsAnalytics(children);
}

describe("RootLayout", () => {
  it("includes Vercel Analytics on every route", () => {
    Object.assign(globalThis, { React });
    const layout = RootLayout({ children: createElement("main", null, "Page content") });

    expect(containsAnalytics(layout)).toBe(true);
  });
});
