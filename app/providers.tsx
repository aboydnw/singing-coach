"use client";

import { ChakraProvider } from "@chakra-ui/react";
import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState } from "react";
import { AppToaster } from "@/components/ui/AppToaster";
import { supabase } from "@/lib/supabase";
import { system } from "@/lib/theme";

type AuthState = { session: Session | null; loading: boolean };

const AuthContext = createContext<AuthState>({ session: null, loading: true });

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({ session: null, loading: true });

  useEffect(() => {
    let sawAuthEvent = false;
    const { data: subscription } = supabase().auth.onAuthStateChange(
      (_event, session) => {
        sawAuthEvent = true;
        setAuth({ session, loading: false });
      },
    );
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
      <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
      <AppToaster />
    </ChakraProvider>
  );
}
