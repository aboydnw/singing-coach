"use client";

import { ChakraProvider } from "@chakra-ui/react";
import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState } from "react";
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
    supabase()
      .auth.getSession()
      .then(({ data }) => setAuth({ session: data.session, loading: false }));
    const { data: subscription } = supabase().auth.onAuthStateChange(
      (_event, session) => setAuth({ session, loading: false }),
    );
    return () => subscription.subscription.unsubscribe();
  }, []);

  return (
    <ChakraProvider value={system}>
      <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
    </ChakraProvider>
  );
}
