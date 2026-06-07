import { logger } from "../../shared/lib/logger";
import {
  createContext,
  useCallback,
  useEffect,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { supabase, isSupabaseConfigured } from "./supabaseClient";
import type { AuthContextValue, AuthState, AuthAction, Profile } from "./auth.types";
import * as Repo from "../roleplay/repositories/roleplayRepository";

export const AuthContext = createContext<AuthContextValue | null>(null);

const initialState: AuthState = {
  supabaseConfigured: false,
  loading: true,
  session: null,
  user: null,
  profile: null,
  role: null,
  mode: "guest_demo",
};

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "INIT_START":
      return { ...state, loading: true };
    case "INIT_GUEST":
      return {
        ...state,
        loading: false,
        supabaseConfigured: action.supabaseConfigured,
        session: null,
        user: null,
        profile: null,
        role: null,
        mode: "guest_demo",
      };
    case "INIT_AUTHENTICATED":
      return {
        ...state,
        loading: false,
        supabaseConfigured: true,
        session: action.session,
        user: action.user,
        profile: action.profile,
        role: action.role,
        mode: "authenticated",
      };
    case "INIT_ERROR":
      return {
        ...state,
        loading: false,
        supabaseConfigured: false,
        session: null,
        user: null,
        profile: null,
        role: null,
        mode: "guest_demo",
      };
    case "SIGNED_OUT":
      return {
        ...state,
        loading: false,
        session: null,
        user: null,
        profile: null,
        role: null,
        mode: "guest_demo",
      };
    case "PROFILE_UPDATED":
      return { ...state, profile: action.profile };
    default:
      return state;
  }
}

async function fetchProfile(userId: string): Promise<Profile | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (error) return null;
    return data as Profile | null;
  } catch {
    return null;
  }
}

// Safety timeout: if auth init doesn't finish in 5s, force guest mode
const INIT_TIMEOUT_MS = 5000;

// Auto-bootstrap: ensure profile and user_role exist.
// Runs asynchronously via setTimeout — NEVER blocks auth state machine.
async function bootstrapUser(userId: string) {
  if (!supabase) return;
  try {
    const existing = await Repo.getCurrentProfile(supabase, userId);
    if (!existing) {
      await Repo.ensureProfile(supabase, userId);
    }
  } catch { /* non-blocking */ }
  try {
    await Repo.ensureUserRole(supabase, userId, "user");
  } catch { /* non-blocking */ }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialState);
  const configured = isSupabaseConfigured();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!supabase) {
      dispatch({ type: "INIT_GUEST", supabaseConfigured: false });
      return;
    }

    dispatch({ type: "INIT_START" });

    timeoutRef.current = setTimeout(() => {
      logger.warn("[Auth] Init timeout after", INIT_TIMEOUT_MS, "ms — forcing guest mode");
      dispatch({ type: "INIT_ERROR" });
    }, INIT_TIMEOUT_MS);

    supabase.auth
      .getSession()
      .then(async ({ data: { session } }) => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);

        if (!session?.user) {
          dispatch({ type: "INIT_GUEST", supabaseConfigured: true });
          return;
        }

        // Fire-and-forget bootstrap — never block auth init
        void bootstrapUser(session.user.id);

        dispatch({
          type: "INIT_AUTHENTICATED",
          session,
          user: session.user,
          profile: null,
          role: "user",
        });

        // Delayed: fetch profile/role for richer state (non-blocking)
        setTimeout(async () => {
          const profile = await fetchProfile(session.user.id);
          if (profile) dispatch({ type: "PROFILE_UPDATED", profile });
        }, 0);
      })
      .catch((err) => {
        logger.warn("[Auth] getSession failed:", err);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        dispatch({ type: "INIT_ERROR" });
      });

    // CRITICAL: onAuthStateChange MUST return synchronously.
    // Never await Supabase queries inside this callback — it blocks signInWithPassword.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        dispatch({ type: "SIGNED_OUT" });
        return;
      }

      if (event === "SIGNED_IN" && session?.user) {
        // Immediately update state with user info — non-blocking
        dispatch({
          type: "INIT_AUTHENTICATED",
          session,
          user: session.user,
          profile: null,
          role: "user",
        });

        // Bootstrap profile/role asynchronously — NEVER block auth callback
        setTimeout(() => {
          void bootstrapUser(session.user.id);
        }, 0);
      }
    });

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: "Supabase 未配置" };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: "Supabase 未配置" };
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error?.message };
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!supabase || !state.user) return;
    try {
      const profile = await fetchProfile(state.user.id);
      if (profile) dispatch({ type: "PROFILE_UPDATED", profile });
    } catch { /* ignore */ }
  }, [state.user]);

  const value: AuthContextValue = {
    ...state,
    supabaseConfigured: configured,
    signIn,
    signUp,
    signOut,
    refreshProfile,
    isOwner: state.role === "owner",
    isAdmin: state.role === "admin",
    isUser: state.role === "user" || state.mode === "authenticated",
    isGuestOrDemo: state.mode === "guest_demo",
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
