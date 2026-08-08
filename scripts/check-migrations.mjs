import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";

const migrationDirectory = "supabase/migrations";
const migrationPattern = /^(\d{14})_[a-z0-9][a-z0-9_-]*\.sql$/;
const files = readdirSync(migrationDirectory).filter((file) => file.endsWith(".sql"));
const invalidNames = files.filter((file) => !migrationPattern.test(file));

if (invalidNames.length > 0) {
  throw new Error(
    `Migration files must use the timestamped Supabase format:\n${invalidNames.join("\n")}`,
  );
}

const versions = files.map((file) => migrationPattern.exec(file)[1]);
const duplicateVersions = versions.filter(
  (version, index) => versions.indexOf(version) !== index,
);

if (duplicateVersions.length > 0) {
  throw new Error(
    `Duplicate migration timestamps: ${[...new Set(duplicateVersions)].join(", ")}`,
  );
}

const baseRef = process.env.GITHUB_BASE_REF
  ? `origin/${process.env.GITHUB_BASE_REF}`
  : process.argv[2] || "origin/main";

try {
  execFileSync("git", ["rev-parse", "--verify", baseRef], { stdio: "ignore" });
} catch {
  console.warn(`Migration immutability check skipped: ${baseRef} is unavailable.`);
  process.exit(0);
}

const changed = execFileSync(
  "git",
  ["diff", "--name-status", `${baseRef}...HEAD`, "--", `${migrationDirectory}/`],
  { encoding: "utf8" },
)
  .trim()
  .split("\n")
  .filter(Boolean);

const rewrittenHistory = changed.filter((line) => {
  const [status, path] = line.split("\t");
  return status !== "A" && migrationPattern.test(path?.split("/").at(-1) || "");
});

if (rewrittenHistory.length > 0) {
  throw new Error(
    `Applied migration history is immutable; add a forward migration instead:\n${rewrittenHistory.join("\n")}`,
  );
}

console.log(`Validated ${files.length} timestamped, forward-only migrations.`);
