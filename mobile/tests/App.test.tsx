import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  service: {} as Record<string, ReturnType<typeof vi.fn>>,
  alerts: vi.fn(),
  listeners: [] as Array<(state: string) => void>,
  audio: { state: "ready", take: null as null | { uri: string; durationMs: number } },
  release: vi.fn(),
  client: {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { user: { id: "owner", email: "owner@example.test" } } },
      })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
}));
vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  KeyboardAvoidingView: "KeyboardAvoidingView",
  ScrollView: "ScrollView",
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
  Alert: { alert: h.alerts },
  Platform: { OS: "ios" },
  Linking: { openURL: vi.fn() },
  AppState: {
    currentState: "active",
    addEventListener: (_: string, listener: (s: string) => void) => {
      h.listeners.push(listener);
      return { remove: vi.fn() };
    },
  },
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaProvider: "SafeAreaProvider",
  SafeAreaView: "SafeAreaView",
}));
vi.mock("expo-status-bar", () => ({ StatusBar: "StatusBar" }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "test-id" }));
vi.mock("expo-file-system", () => ({
  File: class {
    async arrayBuffer() {
      return new ArrayBuffer(44);
    }
  },
}));
vi.mock("../src/ui", () => ({
  Button: "Button",
  Card: "Card",
  Copy: "Copy",
  Heading: "Heading",
  Notice: "Notice",
  styles: {},
}));
vi.mock("../src/data", () => ({
  getPublicConfig: () => ({ apiBaseUrl: "https://example.test", googleEnabled: false }),
  getNativeClient: () => h.client,
  createPracticeService: () => h.service,
  secureStorage: {},
  signIn: vi.fn(),
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
  deleteAccount: vi.fn(),
}));
vi.mock("../src/audio/useNativeAudio", async () => {
  const { useState } = await import("react");
  return {
    useNativeAudio: () => {
      const [, render] = useState(0);
      return {
        ...h.audio,
        elapsedMs: 1000,
        playing: null,
        error: null,
        playbackError: null,
        stopPlayback: vi.fn(),
        playTake: vi.fn(),
        playReference: vi.fn(),
        cancel: vi.fn(),
        stop: vi.fn(),
        start: () => {
          h.audio.state = "recording";
          render((n) => n + 1);
        },
        discard: () => {
          h.audio.state = "ready";
          h.audio.take = null;
          render((n) => n + 1);
        },
        releaseTake: () => {
          h.release();
          h.audio.state = "ready";
          h.audio.take = null;
          render((n) => n + 1);
        },
      };
    },
  };
});
import App from "../App";

let tree: ReactTestRenderer;
const active = {
  id: "active",
  status: "in_progress",
  started_at: "2026-11-10",
  starting_direction: "free_sing",
};
const ended = {
  id: "ended",
  status: "ended",
  started_at: "2026-11-09",
  starting_direction: "free_sing",
};
const bundles = {
  active: { practice: active, attempts: [], jobs: [] },
  ended: {
    practice: ended,
    attempts: [{ id: "ended-parent", exercise_spec_json: null, ts: "2026-11-09" }],
    jobs: [],
  },
};
function buttons(label: string) {
  return tree.root.findAll(
    (node) => String(node.type) === "Button" && node.props.children === label,
  );
}
async function press(label: string) {
  const button = buttons(label)[0];
  expect(button, `Button ${label}`).toBeTruthy();
  expect(button.props.disabled).not.toBe(true);
  await act(async () => {
    button.props.onPress();
  });
}
async function mount() {
  await act(async () => {
    tree = create(<App />);
  });
}
async function foreground() {
  await act(async () => {
    h.listeners.forEach((listener) => listener("active"));
  });
}
beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  h.listeners.length = 0;
  h.audio = { state: "ready", take: null };
  h.service = {
    listPractices: vi.fn(async () => [active, ended]),
    latestCalibration: vi.fn(async () => null),
    recoverSend: vi.fn(async () => ({ pending: null, job: null })),
    loadPractice: vi.fn(async (id: keyof typeof bundles) => bundles[id]),
    nextExercise: vi.fn(() => null),
    sendTake: vi.fn(async () => ({ id: "job" })),
  };
});
afterEach(async () => {
  if (tree)
    await act(async () => {
      tree.unmount();
    });
});

describe("native practice UI safety boundaries", () => {
  it("releases a local review take when a late durable job is recovered, preventing resend", async () => {
    h.audio = { state: "review", take: { uri: "file:///take.wav", durationMs: 1000 } };
    await mount();
    expect(buttons("Send for analysis")).toHaveLength(1);
    await press("Send for analysis");
    h.service.sendTake.mockRejectedValue(new Error("Request timed out"));
    h.service.recoverSend.mockResolvedValue({
      pending: { phase: "handoff_unknown" },
      job: null,
    });
    const confirm = h.alerts.mock.calls[0][2].find(
      (choice: { text: string }) => choice.text === "Send for analysis",
    ).onPress;
    await act(async () => {
      confirm();
    });
    expect(h.service.sendTake).toHaveBeenCalledOnce();
    expect(h.release).not.toHaveBeenCalled();
    expect(buttons("Send for analysis")).toHaveLength(0);
    h.service.recoverSend.mockResolvedValue({
      pending: null,
      job: { id: "late-job", status: "completed" },
    });
    await foreground();
    expect(h.release).toHaveBeenCalledOnce();
    expect(buttons("Send for analysis")).toHaveLength(0);
    expect(buttons("Record a take")).toHaveLength(1);
    expect(h.service.sendTake).toHaveBeenCalledOnce();
  });

  it("refreshes the selected ended practice without switching its exercise or retry context", async () => {
    await mount();
    await press("History");
    await press("Review practice");
    expect(h.service.loadPractice).toHaveBeenLastCalledWith("ended");
    await press("Refresh practice");
    expect(h.service.loadPractice).toHaveBeenLastCalledWith("ended");
    expect(buttons("Record a take")).toHaveLength(0);
    expect(buttons("Continue active practice")).toHaveLength(1);
  });

  it("shows the transmission disclosure and cancel never uploads", async () => {
    h.audio = { state: "review", take: { uri: "file:///take.wav", durationMs: 1000 } };
    await mount();
    await press("Send for analysis");
    const [title, disclosure, choices] = h.alerts.mock.calls[0];
    expect(title).toBe("Send this take for coaching?");
    for (const name of ["Supabase", "Vercel", "OpenRouter"])
      expect(disclosure).toContain(name);
    expect(
      choices.find((choice: { style?: string }) => choice.style === "cancel").text,
    ).toBe("Keep reviewing");
    expect(h.service.sendTake).not.toHaveBeenCalled();
    expect(h.release).not.toHaveBeenCalled();
    expect(buttons("Send for analysis")).toHaveLength(1);
  });

  it("allows only one handoff when the confirmed send callback runs twice", async () => {
    h.audio = { state: "review", take: { uri: "file:///take.wav", durationMs: 1000 } };
    let finish!: (value: unknown) => void;
    h.service.sendTake.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await mount();
    await press("Send for analysis");
    const confirm = h.alerts.mock.calls[0][2].find(
      (choice: { text: string }) => choice.text === "Send for analysis",
    ).onPress;
    await act(async () => {
      confirm();
      confirm();
    });
    expect(h.service.sendTake).toHaveBeenCalledOnce();
    await act(async () => {
      finish({ id: "job" });
    });
    expect(h.release).toHaveBeenCalledOnce();
  });
});
