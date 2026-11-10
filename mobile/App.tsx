import { useEffect, useRef, useState, type ComponentRef } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { File } from "expo-file-system";
import { randomUUID } from "expo-crypto";
import type { Session } from "@supabase/supabase-js";
import {
  coachingResponseSchema,
  exerciseSpecSchema,
  measurementsSchema,
  type Calibration,
  type ExerciseSpec,
} from "@/lib/schema";
import { parseStoredJson } from "@/lib/storedJson";
import { midiToName } from "@/lib/exercises";
import { useNativeAudio } from "./src/audio/useNativeAudio";
import {
  createPracticeService,
  deleteAccount,
  getNativeClient,
  getPublicConfig,
  secureStorage,
  signIn,
  signInWithGoogle,
  signOut,
  type Attempt,
  type Practice,
  type PracticeBundle,
  type SendStage,
} from "./src/data";
import { Button, Card, Copy, Heading, Notice, styles } from "./src/ui";

type Runtime = {
  config: ReturnType<typeof getPublicConfig>;
  client: ReturnType<typeof getNativeClient>;
  service: ReturnType<typeof createPracticeService>;
};
type Recovery = Awaited<ReturnType<Runtime["service"]["recoverSend"]>>;
function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}
function date(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default function App() {
  const [runtime] = useState<{ value?: Runtime; error?: string }>(() => {
    try {
      const config = getPublicConfig();
      const client = getNativeClient();
      return {
        value: {
          config,
          client,
          service: createPracticeService(client, config.apiBaseUrl, {
            storage: secureStorage,
            randomUUID,
          }),
        },
      };
    } catch (error) {
      return { error: message(error) };
    }
  });
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.page}>
        <StatusBar style="dark" />
        {runtime.value ? (
          <AuthenticatedApp runtime={runtime.value} />
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            <Heading>Singing Coach</Heading>
            <Notice error>{runtime.error ?? "This beta has not been configured."}</Notice>
            <Copy>
              Ask the beta owner for a configured build. No account or recording has been
              sent.
            </Copy>
          </ScrollView>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function AuthenticatedApp({ runtime }: { runtime: Runtime }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    runtime.client.auth
      .getSession()
      .then(({ data, error }) => {
        if (current) {
          setSession(data.session);
          setAuthError(error?.message ?? null);
          setLoading(false);
        }
      })
      .catch((error) => {
        if (current) {
          setAuthError(message(error));
          setLoading(false);
        }
      });
    const { data } = runtime.client.auth.onAuthStateChange((_event, value) => {
      if (current) {
        setSession(value);
        setLoading(false);
      }
    });
    return () => {
      current = false;
      data.subscription.unsubscribe();
    };
  }, [runtime]);
  if (loading)
    return (
      <View style={styles.content}>
        <ActivityIndicator accessibilityLabel="Restoring sign-in" />
        <Copy>Opening your practice…</Copy>
      </View>
    );
  return session ? (
    <PracticeApp
      key={session.user.id}
      runtime={runtime}
      email={session.user.email ?? "Your account"}
    />
  ) : (
    <SignIn runtime={runtime} initialError={authError} />
  );
}

function SignIn({
  runtime,
  initialError,
}: {
  runtime: Runtime;
  initialError: string | null;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  const [notice, setNotice] = useState<string | null>(null);
  const action = async (google: boolean) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const session = google ? await signInWithGoogle() : await signIn(email, password);
      setPassword("");
      if (!session) setNotice("Sign-in canceled. You can try again when you’re ready.");
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>SINGING COACH · TESTFLIGHT BETA</Text>
        <Heading>
          A little practice.<Text>{"\n"}A clearer next step.</Text>
        </Heading>
        <Copy>
          Listen to a pitch guide, sing a short take, and choose one useful thing to try
          next.
        </Copy>
        <Card>
          <Heading small>Welcome back</Heading>
          <Copy muted>
            Sign in to your existing account to keep your practice and recordings
            together.
          </Copy>
          {error && <Notice error>{error}</Notice>}
          {notice && <Notice>{notice}</Notice>}
          {runtime.config.googleEnabled && (
            <Button onPress={() => void action(true)} disabled={busy}>
              Continue with Google
            </Button>
          )}
          <Text nativeID="email-label" style={styles.label}>
            Email
          </Text>
          <TextInput
            accessibilityLabel="Email"
            textContentType="emailAddress"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            editable={!busy}
            value={email}
            onChangeText={setEmail}
            style={styles.input}
          />
          <Text style={styles.label}>Password</Text>
          <TextInput
            accessibilityLabel="Password"
            textContentType="password"
            secureTextEntry
            autoCapitalize="none"
            editable={!busy}
            value={password}
            onChangeText={setPassword}
            style={styles.input}
            onSubmitEditing={() => {
              if (email && password) void action(false);
            }}
          />
          <Button
            disabled={busy || !email.trim() || !password}
            onPress={() => void action(false)}
          >
            {busy ? "Signing in…" : "Sign in with email"}
          </Button>
        </Card>
        <Copy muted>
          Your recordings are private to your account. You choose when to send each take.
          AI feedback can be wrong; stop if singing feels uncomfortable.
        </Copy>
        <Button
          secondary
          onPress={() => void Linking.openURL(runtime.config.apiBaseUrl + "/privacy")}
        >
          Privacy policy
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function PracticeApp({ runtime, email }: { runtime: Runtime; email: string }) {
  const service = runtime.service;
  const audio = useNativeAudio();
  const [screen, setScreen] = useState<"practice" | "history" | "account" | "feedback">(
    "practice",
  );
  const [practices, setPractices] = useState<Practice[]>([]);
  const [bundle, setBundle] = useState<PracticeBundle | null>(null);
  const [calibration, setCalibration] = useState<Calibration | null>(null);
  const [spec, setSpec] = useState<ExerciseSpec | null>(null);
  const [parentId, setParentId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Attempt | null>(null);
  const [recovery, setRecovery] = useState<Recovery>({ pending: null, job: null });
  const [busy, setBusy] = useState(false);
  const [initial, setInitial] = useState(true);
  const [stage, setStage] = useState<SendStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const selection = useRef<string | null>(null);
  const actionBusy = useRef(false);
  const mounted = useRef(true);
  const cursor = useRef(0);
  const scroll = useRef<ComponentRef<typeof ScrollView> | null>(null);
  const refreshId = useRef(0);
  const lockedAudio = ["requesting", "recording", "stopping", "review"].includes(
    audio.state,
  );
  const locked = busy || lockedAudio || Boolean(recovery.pending);
  const currentJob = bundle?.jobs.find((job) =>
    ["queued", "analyzing", "coaching", "failed"].includes(job.status),
  );
  const processing = Boolean(currentJob && currentJob.status !== "failed");
  const active = bundle?.practice.status === "in_progress";
  const refresh = async (selectedId = selection.current, initialize = false) => {
    const id = ++refreshId.current;
    const [rows, cal, recovered] = await Promise.all([
      service.listPractices(),
      service.latestCalibration(),
      service.recoverSend(),
    ]);
    const target =
      selectedId ?? rows.find((row) => row.status === "in_progress")?.id ?? null;
    const loaded = target ? await service.loadPractice(target) : null;
    if (!mounted.current || id !== refreshId.current) return;
    setPractices(rows);
    setCalibration(cal);
    setRecovery(recovered);
    setBundle(loaded);
    selection.current = target;
    if (initialize && loaded) chooseInitial(loaded, cal);
    if (recovered.job) {
      audio.releaseTake();
      setNotice("Your recording is saved. Processing status has been restored.");
    }
    setInitial(false);
  };
  const chooseInitial = (loaded: PracticeBundle, cal: Calibration | null) => {
    const recent = loaded.attempts[0];
    const existing = recent
      ? parseStoredJson(recent.exercise_spec_json, exerciseSpecSchema)
      : null;
    const pending = loaded.jobs.find((j) =>
      ["queued", "analyzing", "coaching", "failed"].includes(j.status),
    );
    setSpec(
      pending
        ? parseStoredJson(pending.exercise_spec_json, exerciseSpecSchema)
        : recent
          ? existing
          : cal
            ? service.nextExercise(cal, loaded)
            : null,
    );
    setParentId(recent?.id ?? null);
  };
  useEffect(() => {
    mounted.current = true;
    void refresh(null, true).catch((err) => {
      if (mounted.current) {
        setError(message(err));
        setInitial(false);
      }
    });
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active")
        void refresh().catch((err) => {
          if (mounted.current) setError(message(err));
        });
    });
    return () => {
      mounted.current = false;
      ++refreshId.current;
      listener.remove();
    };
  }, [service]);
  useEffect(() => {
    if (!processing && !recovery.pending) return;
    const timer = setInterval(() => {
      if (AppState.currentState === "active" && !actionBusy.current)
        void refresh().catch((err) => {
          if (mounted.current) setError(message(err));
        });
    }, 5000);
    return () => clearInterval(timer);
  }, [processing, recovery.pending, service]);
  const run = async (action: () => Promise<void>) => {
    if (actionBusy.current) return;
    actionBusy.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      if (mounted.current) setError(message(err));
    } finally {
      actionBusy.current = false;
      if (mounted.current) {
        setBusy(false);
        setStage(null);
      }
    }
  };
  useEffect(() => {
    if (!bundle || lockedAudio || busy || currentJob || recovery.pending) return;
    const recent = bundle.attempts[0];
    if (recent) {
      setParentId(recent.id);
      setSpec(parseStoredJson(recent.exercise_spec_json, exerciseSpecSchema));
    }
  }, [bundle?.attempts[0]?.id]);

  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [screen, detail?.id, bundle?.practice.id]);

  const openPractice = (practice: Practice) =>
    void run(async () => {
      await audio.stopPlayback();
      selection.current = practice.id;
      await refresh(practice.id, true);
      setScreen("practice");
      setDetail(null);
    });
  const startPractice = () =>
    void run(async () => {
      const created = await service.createPractice(
        calibration ? "coach_pick" : "free_sing",
      );
      selection.current = created.id;
      await refresh(created.id, true);
      setScreen("practice");
      setNotice(null);
    });
  const endPractice = () => {
    if (!bundle) return;
    Alert.alert(
      "End this practice?",
      "Your attempts stay available, but this practice will become read-only.",
      [
        { text: "Keep practicing", style: "cancel" },
        {
          text: "End practice",
          style: "destructive",
          onPress: () =>
            void run(async () => {
              await audio.stopPlayback();
              await service.endPractice(bundle.practice.id);
              await refresh();
              setNotice("Practice ended. Your attempts are saved.");
            }),
        },
      ],
    );
  };
  const send = () => {
    if (!audio.take || !bundle || busy) return;
    Alert.alert(
      "Send this take for coaching?",
      "Supabase will store your recording privately. Vercel will analyze the audio. OpenRouter receives measurements and recent coaching history to generate AI feedback, not the recording. Your recording stays saved for playback.",
      [
        { text: "Keep reviewing", style: "cancel" },
        {
          text: "Send for analysis",
          onPress: () =>
            void run(async () => {
              if (!audio.take || !bundle) return;
              await audio.stopPlayback();
              const wav = await new File(audio.take.uri).arrayBuffer();
              try {
                await service.sendTake(
                  {
                    practiceId: bundle.practice.id,
                    wav,
                    spec,
                    metadata: {
                      reason:
                        spec?.instructions ??
                        "Sing something familiar without trying to fix it yet.",
                      activity_id: spec?.activity_id ?? null,
                      activity_version: spec?.activity_version ?? null,
                      transposition_semitones: spec?.transposition_semitones ?? null,
                      reference_fallback: true,
                    },
                    parentAttemptId: parentId,
                  },
                  setStage,
                );
                audio.releaseTake();
                setNotice(
                  "Recording uploaded. You can leave the app while analysis and coaching continue.",
                );
              } finally {
                await refresh();
              }
            }),
        },
      ],
    );
  };
  const changeExercise = () => {
    if (!calibration || !bundle) return;
    cursor.current += 1;
    setSpec(
      service.nextExercise(
        calibration,
        { ...bundle, practice: { ...bundle.practice, starting_direction: "coach_pick" } },
        cursor.current,
      ),
    );
    setParentId(null);
    setNotice(null);
    audio.stopPlayback();
  };
  const retry = (attempt: Attempt) => {
    setSpec(parseStoredJson(attempt.exercise_spec_json, exerciseSpecSchema));
    setParentId(attempt.id);
    setDetail(null);
    setScreen("practice");
    setNotice("Try the same exercise with one useful change.");
  };
  const status =
    stage === "uploading"
      ? "Uploading your recording. Keep the app open."
      : stage === "handing_off"
        ? "Confirming server processing. Keep the app open."
        : audio.state === "requesting"
          ? "Waiting for microphone permission…"
          : audio.state === "recording"
            ? "Recording · " + Math.floor(audio.elapsedMs / 1000) + "s / 60s"
            : audio.state === "stopping"
              ? "Finishing your take…"
              : audio.state === "review"
                ? "Your take is local. Listen, send, or discard."
                : null;
  const pending = recovery.pending;

  return (
    <ScrollView
      ref={scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.label}>SINGING COACH · BETA</Text>
      <View style={styles.row}>
        {(["practice", "history", "account"] as const).map((tab) => (
          <Button
            key={tab}
            secondary
            disabled={locked || screen === tab}
            onPress={() => {
              audio.stopPlayback();
              setScreen(tab);
            }}
          >
            {tab[0].toUpperCase() + tab.slice(1)}
          </Button>
        ))}
      </View>
      {error && <Notice error>{error}</Notice>}
      {notice && <Notice>{notice}</Notice>}
      {initial && (
        <>
          <ActivityIndicator accessibilityLabel="Loading practice" />
          <Copy>Finding where you left off…</Copy>
        </>
      )}
      {pending && (
        <Card>
          <Heading small>Check your recording</Heading>
          <Copy>
            {pending.phase === "handoff_unknown"
              ? "The server has not confirmed this recording yet. It may already be processing. We will check instead of sending a duplicate."
              : pending.phase === "uploaded"
                ? "Your recording uploaded, but processing has not been requested yet."
                : "The upload did not finish or its response was interrupted. Nothing new will be sent automatically."}
          </Copy>
          <Button
            disabled={busy}
            onPress={() =>
              void run(async () => {
                await refresh();
              })
            }
          >
            Check status
          </Button>
          {pending.phase === "uploaded" && (
            <Button
              disabled={busy}
              onPress={() =>
                void run(async () => {
                  await service.resumeHandoff();
                  audio.releaseTake();
                  await refresh();
                })
              }
            >
              Continue processing
            </Button>
          )}
          {pending.phase !== "handoff_unknown" && (
            <Button
              secondary
              disabled={busy}
              onPress={() =>
                Alert.alert(
                  "Remove this upload?",
                  "This removes the unfinished uploaded copy. Your local take can still be reviewed.",
                  [
                    { text: "Keep it", style: "cancel" },
                    {
                      text: "Remove upload",
                      style: "destructive",
                      onPress: () =>
                        void run(async () => {
                          await service.discardUnsentUpload();
                          await refresh();
                        }),
                    },
                  ],
                )
              }
            >
              Remove unfinished upload
            </Button>
          )}
          {pending.phase === "handoff_unknown" && (
            <Copy muted>
              If this does not resolve, contact the beta owner before making another
              recording. Do not send the same take again.
            </Copy>
          )}
        </Card>
      )}
      {screen === "practice" && !initial && (
        <>
          <Heading>
            {bundle
              ? active
                ? "Make room for your voice."
                : "Practice saved."
              : "A few minutes for your voice."}
          </Heading>
          {!bundle ? (
            <Card>
              <Copy>
                One short take is enough to begin. Sing comfortably and stop if anything
                hurts.
              </Copy>
              <Button disabled={busy || Boolean(pending)} onPress={startPractice}>
                Start practice
              </Button>
            </Card>
          ) : (
            <>
              {active ? (
                <Card>
                  <Heading small>{spec?.display_name ?? "Free sing"}</Heading>
                  <Copy>
                    {spec?.instructions ??
                      "Sing a short, familiar passage at a comfortable pitch. This take has no target-note pitch score."}
                  </Copy>
                  {spec && (
                    <Copy muted>
                      {spec.target_notes_midi.map(midiToName).join(" · ")}
                      {spec.vowel ? " · “" + spec.vowel + "”" : ""}
                    </Copy>
                  )}
                  {!calibration && (
                    <>
                      <Notice>
                        No saved range yet. Free singing keeps the pitch choice with you.
                      </Notice>
                      <Button
                        secondary
                        disabled={locked}
                        onPress={() =>
                          void Linking.openURL(runtime.config.apiBaseUrl + "/calibrate")
                        }
                      >
                        Calibrate in the web app
                      </Button>
                    </>
                  )}
                  {spec && (
                    <>
                      <Copy muted>Pitch guide: computer tones, not a vocal example.</Copy>
                      <Button
                        secondary
                        disabled={locked || Boolean(currentJob)}
                        onPress={() =>
                          void audio.playReference(
                            spec.events ??
                              spec.target_notes_midi.map((midi) => ({
                                kind: "note" as const,
                                midi,
                                duration_s: spec.duration_per_note_s,
                              })),
                          )
                        }
                      >
                        {audio.playing === "reference"
                          ? "Replay pitch guide"
                          : "Play pitch guide"}
                      </Button>
                    </>
                  )}
                  {audio.playing && (
                    <Button secondary onPress={audio.stopPlayback}>
                      Stop playback
                    </Button>
                  )}
                  {status && <Notice>{status}</Notice>}
                  {audio.error && <Notice error>{audio.error}</Notice>}
                  {audio.playbackError && <Notice error>{audio.playbackError}</Notice>}
                  {audio.state === "requesting" && (
                    <Button secondary onPress={audio.cancel}>
                      Cancel microphone request
                    </Button>
                  )}
                  {(audio.state === "recording" || audio.state === "stopping") && (
                    <>
                      <Button
                        disabled={audio.state === "stopping"}
                        onPress={() => void audio.stop()}
                      >
                        Stop recording
                      </Button>
                      <Button secondary onPress={() => void audio.discard()}>
                        Discard take
                      </Button>
                    </>
                  )}
                  {audio.state === "review" && !pending && (
                    <>
                      <Button
                        secondary
                        disabled={busy}
                        onPress={() => void audio.playTake()}
                      >
                        Listen to your take
                      </Button>
                      <Button disabled={busy || Boolean(currentJob)} onPress={send}>
                        {busy ? "Sending…" : "Send for analysis"}
                      </Button>
                      <Button
                        secondary
                        disabled={busy}
                        onPress={() => void audio.discard()}
                      >
                        Discard take
                      </Button>
                    </>
                  )}
                  {(audio.state === "ready" || audio.state === "error") && (
                    <Button
                      disabled={busy || Boolean(currentJob) || Boolean(pending)}
                      onPress={() => void audio.start()}
                    >
                      Record a take
                    </Button>
                  )}
                  <Copy muted>
                    Up to 60 seconds. Keep the app open while recording and sending.
                    Stopping never uploads.
                  </Copy>
                  {currentJob && (
                    <Notice error={currentJob.status === "failed"}>
                      {currentJob.status === "failed"
                        ? (currentJob.error_message ??
                          "Processing paused. Retry the saved recording.")
                        : currentJob.status === "coaching"
                          ? "Measurements saved. Your coaching is being prepared."
                          : currentJob.status === "analyzing"
                            ? "Your recording is being analyzed."
                            : "Your saved recording is queued for analysis."}
                    </Notice>
                  )}
                  {currentJob?.status === "failed" && (
                    <>
                      <Button
                        disabled={busy || Boolean(pending)}
                        onPress={() =>
                          void run(async () => {
                            await service.retryJob(currentJob);
                            await refresh();
                          })
                        }
                      >
                        Retry processing
                      </Button>
                      <Button
                        secondary
                        disabled={busy || Boolean(pending)}
                        onPress={() =>
                          Alert.alert(
                            "Move on from this recording?",
                            "Processing will not be retried. Any saved measurements stay in your history.",
                            [
                              { text: "Keep it", style: "cancel" },
                              {
                                text: "Move on",
                                onPress: () =>
                                  void run(async () => {
                                    await service.abandonJob(currentJob);
                                    await refresh();
                                  }),
                              },
                            ],
                          )
                        }
                      >
                        Move on
                      </Button>
                    </>
                  )}
                  <Button
                    secondary
                    disabled={locked || Boolean(currentJob) || !calibration}
                    onPress={changeExercise}
                  >
                    Different exercise
                  </Button>
                  <Button
                    secondary
                    disabled={locked || Boolean(currentJob)}
                    onPress={() => {
                      setSpec(null);
                      setParentId(null);
                      audio.stopPlayback();
                    }}
                  >
                    Free sing instead
                  </Button>
                  <Button
                    secondary
                    disabled={locked || Boolean(currentJob)}
                    onPress={endPractice}
                  >
                    End practice
                  </Button>
                </Card>
              ) : (
                <Card>
                  <Copy>This practice is read-only. Your feedback is below.</Copy>
                  <Button
                    disabled={busy || Boolean(pending)}
                    onPress={() => {
                      const existing = practices.find((p) => p.status === "in_progress");
                      if (existing) openPractice(existing);
                      else startPractice();
                    }}
                  >
                    {practices.some((p) => p.status === "in_progress")
                      ? "Continue active practice"
                      : "Start another practice"}
                  </Button>
                </Card>
              )}
              <Heading small>Your attempts</Heading>
              {!bundle.attempts.length && (
                <Copy muted>Your saved attempts and feedback will appear here.</Copy>
              )}
              {bundle.attempts.map((attempt) => (
                <Card key={attempt.id}>
                  <Copy>
                    {parseStoredJson(attempt.exercise_spec_json, exerciseSpecSchema)
                      ?.display_name ?? "Free sing"}{" "}
                    · {date(attempt.ts)}
                  </Copy>
                  <Button
                    secondary
                    disabled={locked}
                    onPress={() => {
                      audio.stopPlayback();
                      setDetail(attempt);
                      setScreen("feedback");
                    }}
                  >
                    {attempt.coaching_json ? "Read feedback" : "View saved measurements"}
                  </Button>
                </Card>
              ))}
            </>
          )}
          <Button
            secondary
            disabled={busy || lockedAudio}
            onPress={() =>
              void run(async () => {
                await refresh(selection.current, !bundle);
              })
            }
          >
            Refresh practice
          </Button>
        </>
      )}
      {screen === "feedback" && detail && (
        <Feedback
          attempt={bundle?.attempts.find((attempt) => attempt.id === detail.id) ?? detail}
          canRetry={Boolean(active) && !locked && !currentJob}
          onBack={() => setScreen("practice")}
          onRetry={() => retry(detail)}
        />
      )}
      {screen === "history" && (
        <>
          <Heading>Your practices</Heading>
          {!practices.length && (
            <Copy>No saved practices yet. Start with one short take.</Copy>
          )}
          {practices.map((practice) => (
            <Card key={practice.id}>
              <Heading small>{date(practice.started_at)}</Heading>
              <Copy>
                {practice.status === "in_progress" ? "In progress" : "Ended"} ·{" "}
                {practice.summary_json?.attemptCount ?? "Saved"} attempts
              </Copy>
              <Copy muted>
                {practice.learning_contract_json?.focus ??
                  "A little practice for your voice"}
              </Copy>
              <Button secondary disabled={busy} onPress={() => openPractice(practice)}>
                {practice.status === "in_progress"
                  ? "Continue practice"
                  : "Review practice"}
              </Button>
            </Card>
          ))}
        </>
      )}
      {screen === "account" && (
        <>
          <Heading>Your account</Heading>
          <Card>
            <Copy>{email}</Copy>
            <Copy>
              Recordings and history are private to your account. Unsent takes are
              temporary on this device. Sent recordings are retained for playback.
            </Copy>
            <Copy muted>
              This beta covers the core practice loop. Calibration, detailed charts and
              attempt conversations are available in the web app.
            </Copy>
            <Button
              secondary
              onPress={() => void Linking.openURL(runtime.config.apiBaseUrl + "/privacy")}
            >
              Privacy policy
            </Button>
            <Button
              secondary
              onPress={() => void Linking.openURL(runtime.config.apiBaseUrl + "/account")}
            >
              Open web account
            </Button>
            <Button
              secondary
              disabled={busy || Boolean(pending)}
              onPress={() =>
                void run(async () => {
                  await audio.discard();
                  await signOut();
                })
              }
            >
              Sign out
            </Button>
            <Button
              danger
              disabled={busy || Boolean(pending) || processing}
              onPress={() =>
                Alert.alert(
                  "Permanently delete your account?",
                  "This removes your account, recordings, calibration, practice history and coaching on all devices. This cannot be undone.",
                  [
                    { text: "Keep my account", style: "cancel" },
                    {
                      text: "Delete everything",
                      style: "destructive",
                      onPress: () =>
                        void run(async () => {
                          await audio.discard();
                          await deleteAccount();
                        }),
                    },
                  ],
                )
              }
            >
              Delete account
            </Button>
          </Card>
        </>
      )}
    </ScrollView>
  );
}

function Feedback({
  attempt,
  canRetry,
  onBack,
  onRetry,
}: {
  attempt: Attempt;
  canRetry: boolean;
  onBack: () => void;
  onRetry: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const coach = parseStoredJson(attempt.coaching_json, coachingResponseSchema);
  const measurements = parseStoredJson(attempt.measurements_json, measurementsSchema);
  return (
    <>
      <Button secondary onPress={onBack}>
        Back to practice
      </Button>
      <Heading>Your next step</Heading>
      {coach ? (
        <Card>
          {coach.calibrating && (
            <Notice>
              The coach is still learning your usual pattern. This is early feedback, not
              a diagnosis.
            </Notice>
          )}
          <Heading small>{coach.top_issue}</Heading>
          <Copy>{coach.why}</Copy>
          <Heading small>Try this</Heading>
          <Copy>{coach.resolved.drill.instructions}</Copy>
          {coach.resolved.cues.map((cue, i) => (
            <Copy key={i}>{cue}</Copy>
          ))}
          {coach.resolved.caution && <Notice>{coach.resolved.caution}</Notice>}
          <Heading small>Keep this</Heading>
          <Copy>{coach.encouragement}</Copy>
        </Card>
      ) : (
        <Notice>Your measurements are saved. Coaching is not available yet.</Notice>
      )}
      <Button disabled={!canRetry} onPress={onRetry}>
        Try again
      </Button>
      <Button secondary onPress={() => setExpanded((value) => !value)}>
        {expanded ? "Hide measurements" : "Show measurements"}
      </Button>
      {expanded && (
        <Card>
          <Heading small>Measurements</Heading>
          <Copy muted>
            These are reference measurements, not universal healthy targets.
          </Copy>
          {measurements ? (
            <>
              <Copy>
                {measurements.accuracy?.mean_abs_cents_off == null
                  ? "No target-note pitch score for this take."
                  : "Average distance from target: " +
                    Math.round(measurements.accuracy.mean_abs_cents_off) +
                    " cents"}
              </Copy>
              <Copy>HNR: {measurements.hnr_mean?.toFixed(1) ?? "Not available"} dB</Copy>
              <Copy>
                Vibrato rate:{" "}
                {measurements.vibrato_rate_hz?.toFixed(1) ?? "Not available"} Hz
              </Copy>
            </>
          ) : (
            <Copy>No measurements available.</Copy>
          )}
        </Card>
      )}
    </>
  );
}
