import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ensureWorkflowRouteScaffold } from "../scripts/prepare-workflow-routes.mjs";

describe("ensureWorkflowRouteScaffold", () => {
  it("creates discoverable flow and webhook routes before Next builds", async () => {
    const root = await mkdtemp(join(tmpdir(), "workflow-routes-"));

    await ensureWorkflowRouteScaffold(root);

    const flow = await readFile(
      join(root, "app/.well-known/workflow/v1/flow/route.js"),
      "utf8",
    );
    const webhook = await readFile(
      join(root, "app/.well-known/workflow/v1/webhook/[token]/route.js"),
      "utf8",
    );
    expect(flow).toContain("export async function POST");
    expect(webhook).toContain("export async function POST");
  });
});
