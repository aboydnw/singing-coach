"use client";

import { Center, Spinner } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { useAuth } from "@/app/providers";
import { type AuthNotice, SignInPanel } from "@/components/auth/AuthForms";
import { authRedirectError, friendlyAuthMessage } from "@/lib/authMessages";
import { supabase } from "@/lib/supabase";

/** The whole app sits behind this: no session, no pages. Unlike the Gradio
 * version, signing in controls entry as well as data scope. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();

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
  return <>{children}</>;
}

/** Visiting any page with `?signin=email` reveals the password form, kept as a
 * fallback for accounts created before sign-in moved to Google. */
function wantsEmailFallback(): boolean {
  return new URLSearchParams(window.location.search).get("signin") === "email";
}

function accountWasDeleted(): boolean {
  return new URLSearchParams(window.location.search).get("account") === "deleted";
}

function SignIn() {
  const [busy, setBusy] = useState(false);
  const [emailFallback] = useState(wantsEmailFallback);
  const [notice, setNotice] = useState<AuthNotice>(() => {
    if (accountWasDeleted()) {
      return { tone: "success", title: "Your account has been deleted" };
    }
    const message = authRedirectError(window.location.href);
    return message
      ? { tone: "danger", title: "Couldn't sign you in", body: message }
      : null;
  });

  useEffect(() => {
    if (accountWasDeleted() || authRedirectError(window.location.href)) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const run = async (title: string, action: () => Promise<{ code?: string } | null>) => {
    setBusy(true);
    setNotice(null);
    try {
      const error = await action();
      if (error) setNotice({ tone: "danger", title, body: friendlyAuthMessage(error) });
    } catch {
      setNotice({ tone: "danger", title, body: friendlyAuthMessage(null) });
    } finally {
      setBusy(false);
    }
  };

  const google = () =>
    run("Couldn't start Google sign-in", async () => {
      const { error } = await supabase().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      return error;
    });

  const emailSignIn = (email: string, password: string) =>
    run("Couldn't sign in", async () => {
      const { error } = await supabase().auth.signInWithPassword({ email, password });
      return error;
    });

  return (
    <SignInPanel
      busy={busy}
      notice={notice}
      onGoogle={google}
      onEmailSignIn={emailFallback ? emailSignIn : undefined}
    />
  );
}
