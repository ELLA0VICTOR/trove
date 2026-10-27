import { useEffect, useState } from "react";
import { Check, Mail, ShieldCheck } from "lucide-react";
import { Brand } from "../components/Brand.tsx";
import { Button } from "../components/UI.tsx";
import { api, useApp } from "../lib/app-context.tsx";

export function AccountLink({
  purpose,
}: {
  purpose: "verify" | "reset" | "signup";
}) {
  const { refresh } = useApp();
  const [token] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "",
  );
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");
  const [signup, setSignup] = useState<{
    email: string;
    role: string;
    needsPassword: boolean;
  } | null>(null);
  const [username, setUsername] = useState("");
  const passwordRequired =
    purpose === "reset" ||
    (purpose === "signup" && Boolean(signup?.needsPassword));
  useEffect(() => {
    if (purpose !== "signup" || !token) return;
    let active = true;
    void api<{ email: string; role: string; needsPassword: boolean }>(
      "/auth/signup-details",
      "POST",
      {
        token,
      },
    )
      .then((details) => {
        if (active) setSignup(details);
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [purpose, token]);
  useEffect(() => {
    window.history.replaceState(null, "", window.location.pathname);
    const meta = document.createElement("meta");
    meta.name = "referrer";
    meta.content = "no-referrer";
    document.head.append(meta);
    return () => meta.remove();
  }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (passwordRequired && password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ session?: { username?: string } }>(
        `/auth/${purpose === "signup" ? "complete-signup" : purpose === "verify" ? "verify-email" : "reset-password"}`,
        "POST",
        { token, ...(passwordRequired ? { password } : {}) },
      );
      setUsername(result.session?.username ?? "");
      setPassword("");
      setConfirmation("");
      setComplete(true);
      await refresh();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="account-link-page">
      <div className="account-link-panel">
        <Brand compact />
        {complete ? (
          <section>
            <Check className="account-link-icon" size={32} />
            <h1>
              {purpose === "signup"
                ? "Welcome to Trove."
                : purpose === "verify"
                  ? "Email verified."
                  : "Password updated."}
            </h1>
            <p>
              {purpose === "signup"
                ? `Your username is ${username}. You can change it in Settings, or sign in with your email.`
                : purpose === "verify"
                  ? "You can now sign in with your email or username and recover your password."
                  : "Your new password is ready. Sign in to continue."}
            </p>
            <Button to={purpose !== "reset" ? "/app" : "/app?signin=1"}>
              {purpose !== "reset"
                ? "Continue to Trove"
                : "Continue to sign in"}
            </Button>
          </section>
        ) : !token ? (
          <section>
            <h1>Open your email link.</h1>
            <p>
              Request a fresh signup, verification, or password-reset link from
              Trove.
            </p>
            <Button to="/app?signin=1">Back to sign in</Button>
          </section>
        ) : (
          <form
            className="limits-form"
            onSubmit={(event) => void submit(event)}
          >
            {purpose === "verify" ? (
              <Mail className="account-link-icon" size={32} />
            ) : (
              <ShieldCheck className="account-link-icon" size={32} />
            )}
            <h1>
              {purpose === "signup"
                ? signup?.needsPassword
                  ? "Create your account."
                  : "Verify your email."
                : purpose === "verify"
                  ? "Verify your email."
                  : "Choose a new password."}
            </h1>
            <p>
              {purpose === "signup"
                ? signup
                  ? signup.needsPassword
                    ? `Choose a password to finish creating the account for ${signup.email}.`
                    : `Confirm ${signup.email} to activate your ${signup.role === "learner" ? "learner" : "family"} account.`
                  : "Checking your verification link..."
                : purpose === "verify"
                  ? "Confirm this inbox as your Trove recovery email."
                  : "Use at least 12 characters. Updating your password signs this account out on other devices."}
            </p>
            {passwordRequired && (
              <>
                <label className="field-label">
                  {purpose === "signup" ? "Password" : "New password"}
                  <input
                    required
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={128}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </label>
                <label className="field-label">
                  {purpose === "signup"
                    ? "Confirm password"
                    : "Confirm new password"}
                  <input
                    required
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={128}
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                  />
                </label>
              </>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <Button
              type="submit"
              disabled={busy || (purpose === "signup" && !signup)}
            >
              {busy
                ? "Saving…"
                : purpose === "signup"
                  ? signup?.needsPassword
                    ? "Create account"
                    : "Verify email"
                  : purpose === "verify"
                    ? "Verify email"
                    : "Save new password"}
            </Button>
            <Button to="/app?signin=1" secondary>
              Back to sign in
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
