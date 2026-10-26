import type { StartingDirection } from "@/lib/schema";

type ResumeContract = {
  focus?: string;
  tryCue?: string;
  compass?: { nextDirection?: string; overallTrend?: string; currentSession?: string };
} | null;

export function practiceResumeSummary(contract: ResumeContract): string {
  const source =
    contract?.compass?.nextDirection?.trim() ||
    contract?.tryCue?.trim() ||
    contract?.focus?.trim() ||
    "Your coach will pick up from your latest attempt.";
  const clean = source
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/_/g, " ")
    .replace(/\s+-\s+/g, " — ")
    .replace(/\s+/g, " ")
    .trim();
  const first = clean.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() ?? clean;
  if (first.length <= 140) return first;
  const clipped = first.slice(0, 139);
  const boundary = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, boundary > 80 ? boundary : 139).trimEnd()}…`;
}

export async function replaceActivePractice<TAttempt, TContract, T>(
  activeId: string,
  direction: StartingDirection,
  deps: {
    load: (id: string) => Promise<{ attempts: TAttempt[]; contract: TContract }>;
    end: (id: string, attempts: TAttempt[], contract: TContract) => Promise<void>;
    create: (direction: StartingDirection) => Promise<T>;
  },
): Promise<T> {
  const current = await deps.load(activeId);
  await deps.end(activeId, current.attempts, current.contract);
  return deps.create(direction);
}
