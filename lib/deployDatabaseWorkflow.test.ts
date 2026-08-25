import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/deploy-database.yml", "utf8");

describe("database deployment workflow", () => {
  it("checks the complete push range and requires a manual ancestor", () => {
    expect(workflow).toContain("base_ref:");
    expect(workflow).toMatch(/base_ref:\n\s+description:.*\n\s+required: true/);
    expect(workflow).toContain("PUSH_BASE_REF: ${{ github.event.before }}");
    expect(workflow).toContain("MANUAL_BASE_REF: ${{ inputs.base_ref }}");
    expect(workflow).toContain('BASE_REF="$(git rev-list --max-parents=0 HEAD)"');
    expect(workflow).toContain('node scripts/check-migrations.mjs "$BASE_REF"');
  });
});
