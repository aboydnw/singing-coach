"use client";

import { useEffect, useReducer, useRef } from "react";

export type LiveEdgeState = { following: boolean; unseen: number };
export const initialLiveEdgeState: LiveEdgeState = { following: true, unseen: 0 };

export type LiveEdgeAction =
  | { type: "SCROLLED"; distanceFromBottom: number }
  | { type: "ITEMS_APPENDED"; count: number }
  | { type: "JUMPED" }
  | { type: "RESET" };

export function conversationLiveEdgeReducer(
  state: LiveEdgeState,
  action: LiveEdgeAction,
): LiveEdgeState {
  if (action.type === "SCROLLED") {
    const following = action.distanceFromBottom <= 64;
    return { following, unseen: following ? 0 : state.unseen };
  }
  if (action.type === "ITEMS_APPENDED") {
    return state.following ? state : { ...state, unseen: state.unseen + action.count };
  }
  return initialLiveEdgeState;
}

export function useConversationLiveEdge(itemCount: number, resetKey: string | null) {
  const [state, dispatch] = useReducer(conversationLiveEdgeReducer, initialLiveEdgeState);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const previousCount = useRef(itemCount);

  const jump = () => {
    sentinelRef.current?.scrollIntoView({
      block: "end",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
    dispatch({ type: "JUMPED" });
  };

  useEffect(() => {
    const onScroll = () => {
      const distance = Math.max(
        0,
        document.documentElement.scrollHeight - (window.scrollY + window.innerHeight),
      );
      dispatch({ type: "SCROLLED", distanceFromBottom: distance });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const added = Math.max(0, itemCount - previousCount.current);
    previousCount.current = itemCount;
    if (added === 0) return;
    dispatch({ type: "ITEMS_APPENDED", count: added });
    if (state.following) sentinelRef.current?.scrollIntoView({ block: "end" });
  }, [itemCount, state.following]);

  useEffect(() => {
    previousCount.current = itemCount;
    dispatch({ type: "RESET" });
  }, [resetKey]);

  return { state, sentinelRef, jump };
}
