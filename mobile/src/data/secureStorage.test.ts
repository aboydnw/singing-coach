import { it, expect, vi, beforeEach } from "vitest";
const values = vi.hoisted(() => new Map<string, string>());
vi.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "device-only",
  getItemAsync: vi.fn(async (k: string) => values.get(k) ?? null),
  setItemAsync: vi.fn(async (k: string, v: string) => {
    values.set(k, v);
  }),
  deleteItemAsync: vi.fn(async (k: string) => {
    values.delete(k);
  }),
}));
import { secureStorage } from "./secureStorage";
beforeEach(() => values.clear());
it("persists large sessions across chunks and deletes all chunks", async () => {
  const value = "token".repeat(2000);
  await secureStorage.setItem("session", value);
  expect(values.size).toBeGreaterThan(2);
  expect(await secureStorage.getItem("session")).toBe(value);
  await secureStorage.removeItem("session");
  expect(values.size).toBe(0);
});
it("replacing a session clears obsolete chunks", async () => {
  await secureStorage.setItem("session", "a".repeat(4000));
  await secureStorage.setItem("session", "new");
  expect(await secureStorage.getItem("session")).toBe("new");
  expect(values.size).toBe(2);
});
it("does not return partial credentials when a chunk is missing", async () => {
  await secureStorage.setItem("session", "a".repeat(4000));
  const manifest = JSON.parse(values.get("session")!);
  values.delete("session." + manifest.version + ".0");
  expect(await secureStorage.getItem("session")).toBeNull();
});
