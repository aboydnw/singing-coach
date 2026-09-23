"use client";

import { ChakraProvider } from "@chakra-ui/react";
import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState } from "react";
import { AppToaster } from "@/components/ui/AppToaster";
import { supabase } from "@/lib/supabase";
import { system } from "@/lib/theme";

type AuthState = {
  session: Session | null;
  loading: boolean;
  /** True after the singer arrives from a password-reset email and before they choose a new one. */
  recovering: boolean;
  finishRecovery: () => void;
};

const AuthContext = createContext<AuthState>({
  session: null,
  loading: true,
  recovering: false,
  finishRecovery: () => undefined,
});

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<{ session: Session | null; loading: boolean }>({
    session: null,
    loading: true,
  });
  const [recovering, setRecovering] = useState(
    () => typeof window !== "undefined" && window.location.hash.includes("type=recovery"),
  );

  useEffect(() => {
    let sawAuthEvent = false;
    const { data: subscription } = supabase().auth.onAuthStateChange((event, session) => {
      sawAuthEvent = true;
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      if (event === "SIGNED_OUT") setRecovering(false);
      setAuth({ session, loading: false });
    });
    supabase()
      .auth.getSession()
      .then(({ data }) => {
        if (!sawAuthEvent) setAuth({ session: data.session, loading: false });
      })
      .catch(() => {
        if (!sawAuthEvent) setAuth({ session: null, loading: false });
      });
    return () => subscription.subscription.unsubscribe();
  }, []);

  return (
    <ChakraProvider value={system}>
      <AuthContext.Provider
        value={{ ...auth, recovering, finishRecovery: () => setRecovering(false) }}
      >
        {children}
      </AuthContext.Provider>
      <AppToaster />
    </ChakraProvider>
  );
}
