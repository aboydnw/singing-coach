import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const files = ["app", "components"]
  .flatMap(walk)
  .filter((file) => file.endsWith(".tsx") && !file.endsWith(".stories.tsx"));
const literal = /#[0-9a-fA-F]{3,8}|rgba?\(/g;
const exceptions = new Set(["components/ExerciseFlow.tsx"]);
const findings = [];

for (const file of files) {
  if (exceptions.has(file)) continue;
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, index) => {
      if (literal.test(line)) findings.push(`${file}:${index + 1}: ${line.trim()}`);
      literal.lastIndex = 0;
    });
}

if (findings.length) {
  console.error(
    "Unexplained product-interface color literals found:\n" + findings.join("\n"),
  );
  process.exit(1);
}
console.log("Design value check passed.");

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : path;
  });
}
