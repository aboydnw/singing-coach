import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function checkActivityAudio(catalogue, projectRoot = process.cwd()) {
  const errors = [];
  for (const activity of catalogue.activities ?? []) {
    for (const reference of activity.reference_audio ?? []) {
      if (!reference.reviewed) {
        errors.push(`${activity.id}: unreviewed ${reference.src}`);
      }
      for (const field of ["engine", "voice", "license"]) {
        if (!reference[field]?.trim()) {
          errors.push(`${activity.id}: ${reference.src} is missing ${field}`);
        }
      }
      if (typeof reference.src !== "string" || !reference.src.startsWith("/")) {
        errors.push(`${activity.id}: invalid asset path ${reference.src ?? "(missing)"}`);
        continue;
      }
      const filePath = path.join(projectRoot, "public", reference.src);
      try {
        if (fs.statSync(filePath).size === 0) {
          errors.push(`${activity.id}: empty ${reference.src}`);
        }
      } catch {
        errors.push(`${activity.id}: missing ${reference.src}`);
      }
    }
  }
  return errors;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const projectRoot = process.cwd();
  const catalogue = JSON.parse(
    fs.readFileSync(path.join(projectRoot, "prompts", "activities.json"), "utf8"),
  );
  const errors = checkActivityAudio(catalogue, projectRoot);
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else {
    const count = catalogue.activities.reduce(
      (total, activity) => total + (activity.reference_audio?.length ?? 0),
      0,
    );
    console.log(`Verified ${count} reviewed activity audio assets.`);
  }
}
