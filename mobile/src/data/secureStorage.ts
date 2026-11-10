import * as SecureStore from "expo-secure-store";
// Keychain values are chunked; commit the manifest only after all chunks exist.
export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const raw = await SecureStore.getItemAsync(key);
    if (!raw) return null;
    const manifest = JSON.parse(raw) as { version: string; count: number };
    if (
      !Number.isInteger(manifest.count) ||
      manifest.count < 1 ||
      manifest.count > 128 ||
      !/^[a-z0-9-]+$/.test(manifest.version)
    )
      throw new Error("Invalid secure storage.");
    const parts = await Promise.all(
      Array.from({ length: manifest.count }, (_, i) =>
        SecureStore.getItemAsync(`${key}.${manifest.version}.${i}`),
      ),
    );
    if (parts.some((part) => part === null)) return null;
    return parts.join("");
  },
  async setItem(key: string, value: string): Promise<void> {
    const old = await SecureStore.getItemAsync(key);
    const version = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const parts = value.match(/[\s\S]{1,1000}/g) ?? [""];
    if (parts.length > 128) throw new Error("Secure session is too large.");
    for (let i = 0; i < parts.length; i++)
      await SecureStore.setItemAsync(`${key}.${version}.${i}`, parts[i], {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    await SecureStore.setItemAsync(
      key,
      JSON.stringify({ version, count: parts.length }),
      { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY },
    );
    if (old) {
      const prior = JSON.parse(old);
      for (let i = 0; i < prior.count; i++)
        await SecureStore.deleteItemAsync(`${key}.${prior.version}.${i}`);
    }
  },
  async removeItem(key: string): Promise<void> {
    const old = await SecureStore.getItemAsync(key);
    await SecureStore.deleteItemAsync(key);
    if (old) {
      const prior = JSON.parse(old);
      for (let i = 0; i < prior.count; i++)
        await SecureStore.deleteItemAsync(`${key}.${prior.version}.${i}`);
    }
  },
};
