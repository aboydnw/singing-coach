"use client";

import { Button, Center, Spinner } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { useAuth } from "@/app/providers";
import {
  AuthCard,
  type AuthMode,
  type AuthNotice,
  SetPasswordForm,
  SignInPanel,
} from "@/components/auth/AuthForms";
import {
  authRedirectError,
  friendlyAuthMessage,
  newPasswordProblem,
} from "@/lib/authMessages";
import { supabase } from "@/lib/supabase";

/** The whole app sits behind this: no session, no pages. Unlike the Gradio
 * version, signing in controls entry as well as data scope. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, loading, recovering, finishRecovery } = useAuth();

  if (loading) {
    return (
      <Center minH="100vh">
        <Spinner color="coral.500" size="xl" />
      </Center>
    );
  }
  if (!session) {
    return <SignIn />;
  }
  if (recovering) {
    return <ChooseNewPassword onDone={finishRecovery} />;
  }
  return <>{children}</>;
}

function returnUrl(): string {
  return window.location.origin;
}

function SignIn() {
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<AuthNotice>(() => {
    const message = authRedirectError(window.location.href);
    return message
      ? { tone: "danger", title: "Couldn't sign you in", body: message }
      : null;
  });

  useEffect(() => {
    if (authRedirectError(window.location.href)) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const run = async (action: () => Promise<AuthNotice>) => {
    setBusy(true);
    setNotice(null);
    try {
      setNotice(await action());
    } catch {
      setNotice({
        tone: "danger",
        title: "Couldn't reach the server",
        body: friendlyAuthMessage(null),
      });
    } finally {
      setBusy(false);
    }
  };

  const failed = (title: string, error: { code?: string }): AuthNotice => ({
    tone: "danger",
    title,
    body: friendlyAuthMessage(error),
  });

  const submit = (email: string, password: string) =>
    run(async () => {
      if (mode === "sign-in") {
        const { error } = await supabase().auth.signInWithPassword({ email, password });
        return error ? failed("Couldn't sign in", error) : null;
      }
      if (mode === "forgot") {
        const { error } = await supabase().auth.resetPasswordForEmail(email, {
          redirectTo: returnUrl(),
        });
        return error
          ? failed("Couldn't send the reset email", error)
          : {
              tone: "success",
              title: "Check your email",
              body: "If an account exists for that address, a reset link is on its way.",
            };
      }
      const problem = newPasswordProblem(password, password);
      if (problem)
        return { tone: "danger", title: "Choose a different password", body: problem };
      const { data, error } = await supabase().auth.signUp({
        email,
        password,
        options: { emailRedirectTo: returnUrl() },
      });
      if (error) return failed("Couldn't create your account", error);
      if (data.user?.identities?.length === 0) {
        return failed("Couldn't create your account", { code: "user_already_exists" });
      }
      return data.session
        ? null
        : {
            tone: "success",
            title: "Check your email",
            body: "Open the confirmation link we sent to finish creating your account.",
          };
    });

  const google = () =>
    run(async () => {
      const { error } = await supabase().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: returnUrl() },
      });
      return error ? failed("Couldn't start Google sign-in", error) : null;
    });

  return (
    <SignInPanel
      mode={mode}
      busy={busy}
      notice={notice}
      onModeChange={(next) => {
        setMode(next);
        setNotice(null);
      }}
      onSubmit={submit}
      onGoogle={google}
    />
  );
}

function ChooseNewPassword({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<AuthNotice>(null);

  const save = async (password: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const { error } = await supabase().auth.updateUser({ password });
      if (error) {
        setNotice({
          tone: "danger",
          title: "Couldn't save your password",
          body: friendlyAuthMessage(error),
        });
        return;
      }
      window.history.replaceState(null, "", window.location.pathname);
      onDone();
    } catch {
      setNotice({
        tone: "danger",
        title: "Couldn't save your password",
        body: friendlyAuthMessage(null),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard
      heading="Choose a new password"
      lead="You're signed in. Pick a password for next time."
    >
      <SetPasswordForm
        busy={busy}
        notice={notice}
        submitLabel="Save password"
        onSubmit={save}
      />
      <Button variant="plain" size="sm" onClick={onDone}>
        Skip for now
      </Button>
    </AuthCard>
  );
}
