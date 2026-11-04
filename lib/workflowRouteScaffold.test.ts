import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { ensureWorkflowRouteScaffold } from "../scripts/prepare-workflow-routes.mjs";

const run = promisify(execFile);
const roots: string[] = [];
const routePaths = [
  "app/.well-known/workflow/v1/flow/route.js",
  "app/.well-known/workflow/v1/webhook/[token]/route.js",
];

async function temporaryRoot() {
  const root = await mkdtemp(join(tmpdir(), "workflow-routes-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("ensureWorkflowRouteScaffold", () => {
  it("creates discoverable flow and webhook routes before Next builds", async () => {
    const root = await temporaryRoot();

    await ensureWorkflowRouteScaffold(root);

    for (const path of routePaths) {
      const route = await readFile(join(root, path), "utf8");
      expect(route).toContain("export async function POST");
      expect(route).toContain("status: 503");
    }
  });

  it("preserves compiled routes on repeated builds", async () => {
    const root = await temporaryRoot();
    await ensureWorkflowRouteScaffold(root);
    for (const path of routePaths) {
      await writeFile(join(root, path), "// Compiled Workflow handler\n");
    }

    await ensureWorkflowRouteScaffold(root);

    for (const path of routePaths) {
      expect(await readFile(join(root, path), "utf8")).toBe(
        "// Compiled Workflow handler\n",
      );
    }
  });

  it("runs from the command line in a clean project", async () => {
    const root = await temporaryRoot();
    const script = fileURLToPath(
      new URL("../scripts/prepare-workflow-routes.mjs", import.meta.url),
    );

    await run(process.execPath, [script], { cwd: root });

    for (const path of routePaths) {
      expect(await readFile(join(root, path), "utf8")).toContain(
        "export async function POST",
      );
    }
  });

  it("prepares routes explicitly in the build command without relying on lifecycle hooks", async () => {
    const manifest = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    );

    // Yarn 4 does not automatically run arbitrary prebuild/postbuild lifecycle hooks.
    expect(manifest.scripts.build).toBe(
      "node scripts/prepare-workflow-routes.mjs && next build",
    );
    expect(manifest.scripts.prebuild).toBeUndefined();
  });
});
