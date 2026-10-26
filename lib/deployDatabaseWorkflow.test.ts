import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/deploy-database.yml", "utf8");
const runbook = readFileSync("docs/database-deployments.md", "utf8");
const readme = readFileSync("README.md", "utf8");

describe("database deployment workflow", () => {
  it("checks the complete push range and requires a manual ancestor", () => {
    expect(workflow).toContain("base_ref:");
    expect(workflow).toMatch(/base_ref:\n\s+description:.*\n\s+required: true/);
    expect(workflow).toContain("PUSH_BASE_REF: ${{ github.event.before }}");
    expect(workflow).toContain("MANUAL_BASE_REF: ${{ inputs.base_ref }}");
    expect(workflow).toContain('BASE_REF="$(git rev-list --max-parents=0 HEAD)"');
    expect(workflow).toContain(
      'BASE_COMMIT="$(git rev-parse --verify "${BASE_REF}^{commit}")"',
    );
    expect(workflow).toContain('HEAD_COMMIT="$(git rev-parse HEAD)"');
    expect(workflow).toContain('if [ "$BASE_COMMIT" = "$HEAD_COMMIT" ] ||');
    expect(workflow).toContain(
      'git merge-base --is-ancestor "$BASE_COMMIT" "$HEAD_COMMIT"',
    );
    expect(workflow).toContain('node scripts/check-migrations.mjs "$BASE_COMMIT"');
  });
});

describe("durable attempt deployment documentation", () => {
  it("documents the migration, workflow routes, secret, and smoke test", () => {
    expect(runbook).toContain("20261026120000_durable_attempt_jobs.sql");
    expect(runbook).toContain("ATTEMPT_JOB_SIGNING_SECRET");
    expect(runbook).toContain("/.well-known/workflow/v1/flow");
    expect(runbook).toContain("background the app");
    expect(runbook).toContain("Rollback");
  });

  it("describes durable practice processing in the project overview", () => {
    expect(readme).toContain("POST /api/practice/attempt-jobs");
    expect(readme).toContain("ATTEMPT_JOB_SIGNING_SECRET");
  });
});
