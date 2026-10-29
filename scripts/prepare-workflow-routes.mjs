import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const SCAFFOLD = `// Replaced by withWorkflow during the Next.js build.
export async function POST() {
  return Response.json({ error: "Workflow handler is not ready." }, { status: 503 });
}
`;

async function writeIfMissing(path) {
  try {
    await access(path);
  } catch {
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, SCAFFOLD);
  }
}

export async function ensureWorkflowRouteScaffold(root = process.cwd()) {
  const workflowRoot = join(root, "app/.well-known/workflow/v1");
  await Promise.all([
    writeIfMissing(join(workflowRoot, "flow/route.js")),
    writeIfMissing(join(workflowRoot, "webhook/[token]/route.js")),
  ]);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await ensureWorkflowRouteScaffold();
}
