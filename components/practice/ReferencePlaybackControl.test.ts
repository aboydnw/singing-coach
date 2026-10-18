import { ChakraProvider } from "@chakra-ui/react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  ReferencePlaybackControl,
  type ReferencePlaybackState,
} from "@/components/practice/ReferencePlaybackControl";
import { system } from "@/lib/theme";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

function renderControl(state: ReferencePlaybackState, referenceFallback = false): string {
  return renderToStaticMarkup(
    React.createElement(
      ChakraProvider,
      { value: system },
      React.createElement(ReferencePlaybackControl, {
        state,
        referenceFallback,
        disabled: false,
        onPlay: () => undefined,
        onStop: () => undefined,
      }),
    ),
  );
}

describe("ReferencePlaybackControl", () => {
  it("offers reference playback when ready", () => {
    const markup = renderControl("ready");
    expect(markup).toContain("Hear reference");
    expect(markup).not.toContain("Playing reference");
  });

  it("shows preparation without allowing duplicate activation", () => {
    const markup = renderControl("preparing");
    expect(markup).toContain("Preparing sound…");
    expect(markup).toContain("disabled");
    expect(markup).toContain('role="status"');
  });

  it("offers stop while playback is audible", () => {
    const markup = renderControl("playing");
    expect(markup).toContain("Stop reference");
    expect(markup).toContain("Playing reference…");
    expect(markup).toContain('role="status"');
  });

  it("offers retry after a playback failure", () => {
    const markup = renderControl("error");
    expect(markup).toContain("Reference sound couldn’t play");
    expect(markup).toContain("Retry");
    expect(markup).not.toContain("Playing reference…");
  });

  it("labels the generated pitch fallback", () => {
    expect(renderControl("playing", true)).toContain(
      "Vocal example unavailable—playing pitch guide",
    );
  });
});
