import { z } from "zod";
import { attemptJobRequestSchema } from "@/lib/attemptJobRequest";
export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
export const sendJournalSchema = z.object({
  userId: z.string().uuid(),
  request: attemptJobRequestSchema,
  phase: z.enum(["uploading", "uploaded", "handoff_unknown"]),
  createdAt: z.string(),
});
export type SendJournal = z.infer<typeof sendJournalSchema>;
export function createJournal(storage: KeyValueStorage, namespace: string) {
  const key = (uid: string) => `send.${namespace}.${uid}`;
  return {
    async read(uid: string) {
      const raw = await storage.getItem(key(uid));
      if (!raw) return null;
      const value = sendJournalSchema.parse(JSON.parse(raw));
      if (value.userId !== uid) throw new Error("Recording belongs to another account.");
      return value;
    },
    async write(value: SendJournal) {
      await storage.setItem(
        key(value.userId),
        JSON.stringify(sendJournalSchema.parse(value)),
      );
    },
    async clear(uid: string) {
      await storage.removeItem(key(uid));
    },
  };
}
