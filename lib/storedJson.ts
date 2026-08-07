import type { z } from "zod";

export function parseStoredJson<Schema extends z.ZodType>(
  value: string | null,
  schema: Schema,
): z.output<Schema> | null {
  if (!value) return null;
  try {
    const result = schema.safeParse(JSON.parse(value));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
