import { describe, expect, it } from "vitest";
import {
  initialLiveEdgeState,
  conversationLiveEdgeReducer as reduce,
} from "@/components/practice/useConversationLiveEdge";

describe("conversation live edge", () => {
  it("stops following beyond the 64px live-edge threshold", () => {
    expect(reduce(initialLiveEdgeState, { type: "SCROLLED", distanceFromBottom: 64 }).following).toBe(true);
    expect(reduce(initialLiveEdgeState, { type: "SCROLLED", distanceFromBottom: 65 }).following).toBe(false);
  });

  it("does not drag a reader to new coaching", () => {
    const reading = reduce(initialLiveEdgeState, { type: "SCROLLED", distanceFromBottom: 180 });
    expect(reduce(reading, { type: "ITEMS_APPENDED", count: 1 })).toEqual({ following: false, unseen: 1 });
  });

  it("jumping restores the live edge and clears unseen updates", () => {
    expect(reduce({ following: false, unseen: 3 }, { type: "JUMPED" })).toEqual(initialLiveEdgeState);
  });
});
