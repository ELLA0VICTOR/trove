import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { AppSnapshot } from "../../shared/model.ts";

export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response
    .json()
    .catch(() => ({ error: "The local API could not be reached." }));
  if (!response.ok)
    throw new Error(data.error ?? "This action could not be completed.");
  return data;
}
interface AppContextValue {
  state: AppSnapshot | null;
  error: string;
  busy: boolean;
  toast: string;
  refresh: () => Promise<void>;
  update: (
    path: string,
    body?: unknown,
    method?: string,
  ) => Promise<AppSnapshot>;
  notify: (message: string) => void;
  paused: boolean;
  setPaused: (value: boolean) => void;
}
const Context = createContext<AppContextValue | null>(null);
export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppSnapshot | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState("");
  const [paused, setPaused] = useState(false),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    refreshPending = useRef<Promise<void> | null>(null);
  useEffect(() => {
    document.documentElement.removeAttribute("data-theme");
    try {
      localStorage.removeItem("trove-theme");
    } catch {
      /* storage is optional */
    }
  }, []);
  useEffect(() => {
    document.documentElement.dataset.motion = paused ? "paused" : "playing";
  }, [paused]);
  useEffect(() => () => clearTimeout(timer.current), []);
  function refresh() {
    // Strict Mode can mount twice before the first session cookie arrives.
    // Share the request so both mounts resolve to the same sample family.
    if (refreshPending.current) return refreshPending.current;
    refreshPending.current = (async () => {
      try {
        setState(await api<AppSnapshot>("/state"));
        setError("");
      } catch (e) {
        setError((e as Error).message);
      } finally {
        refreshPending.current = null;
      }
    })();
    return refreshPending.current;
  }
  function notify(message: string) {
    clearTimeout(timer.current);
    setToast(message);
    timer.current = setTimeout(() => setToast(""), 6000);
  }
  async function update(path: string, body?: unknown, method = "POST") {
    setBusy(true);
    try {
      const next = await api<AppSnapshot>(path, method, body);
      setState(next);
      return next;
    } catch (e) {
      notify((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  return (
    <Context.Provider
      value={{
        state,
        error,
        busy,
        toast,
        refresh,
        update,
        notify,
        paused,
        setPaused,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useApp() {
  const context = useContext(Context);
  if (!context) throw new Error("Trove needs its application provider.");
  return context;
}
