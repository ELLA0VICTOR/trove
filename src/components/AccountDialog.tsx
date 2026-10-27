import { practiceCapital } from "../../shared/funding.ts";
import { money } from "../../shared/model.ts";
import { useState } from "react";
import { Copy, LogOut, ShieldCheck } from "lucide-react";
import { api, useApp } from "../lib/app-context.tsx";
import { Button, Modal } from "./UI.tsx";
import { ChainAccount } from "./ChainAccount.tsx";
import { RecoveryEmailSettings } from "./RecoveryEmailSettings.tsx";
import { UsernameSettings } from "./UsernameSettings.tsx";

export function AccountDialog({
  onClose,
  initialMode = "login",
}: {
  onClose: () => void;
  initialMode?: "login" | "register" | "join";
}) {
  const { state, update, busy, notify } = useApp();
  const [mode, setMode] = useState<"login" | "register" | "join" | "forgot">(
    initialMode,
  );
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [code, setCode] = useState("");
  const [invitation, setInvitation] = useState(""),
    [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [signupMessage, setSignupMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [consent, setConsent] = useState(false);
  const account = state?.session?.mode === "account";
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSending(true);
    try {
      if (mode === "login") {
        await update("/auth/login", { identifier: username, password });
        setPassword("");
        onClose();
      } else {
        const result = await api<{ message: string }>(`/auth/${mode}`, "POST", {
          email: email.trim(),
          password,
          ...(mode === "join" ? { code } : {}),
        });
        setSignupMessage(result.message);
      }
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSending(false);
    }
  }
  async function forgot(event: React.FormEvent) {
    event.preventDefault();
    setSending(true);
    setError("");
    setResetMessage("");
    try {
      const result = await api<{ message: string }>(
        "/auth/forgot-password",
        "POST",
        { identifier: username },
      );
      setResetMessage(result.message);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSending(false);
    }
  }
  async function invite() {
    try {
      const result = await api<{ code: string }>("/account/invite", "POST", {});
      setInvitation(result.code);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  return (
    <Modal
      title={
        account
          ? "YOUR ACCOUNT"
          : mode === "forgot"
            ? "RESET YOUR PASSWORD"
            : "SIGN IN TO TROVE"
      }
      onClose={onClose}
    >
      {account ? (
        <>
          <h2>{state.session?.username}</h2>
          <p>
            {state.role === "parent" ? "Parent account" : "Learner account"}
          </p>
          <UsernameSettings />
          {state.role === "parent" && (
            <>
              <div className="account-setting">
                <h3>Learner access</h3>
                <Button secondary onClick={() => void invite()}>
                  Create learner invitation
                </Button>
                {invitation && (
                  <div className="invite-code">
                    <label className="field-label">
                      Invitation code (valid for 24 hours)
                      <input
                        readOnly
                        value={invitation}
                        onFocus={(event) => event.target.select()}
                      />
                    </label>
                    <button
                      className="text-link"
                      onClick={() =>
                        void navigator.clipboard
                          .writeText(invitation)
                          .then(() => notify("Invitation copied."))
                          .catch(() =>
                            notify("Select the invitation code to copy it."),
                          )
                      }
                    >
                      <Copy size={14} />
                      Copy code
                    </button>
                    <p>
                      Give this code to your learner. They choose “Join a
                      family”, verify their email, and choose a password.
                    </p>
                  </div>
                )}
              </div>
              <div className="account-setting">
                <h3>
                  <ShieldCheck size={17} /> Remember learning
                </h3>
                {state.session?.memoryEnabled ? (
                  <>
                    <p>
                      Learning history is saved across sessions. Pausing stops
                      new requests and live coaching. In-flight uploads may
                      finish; stored records remain.
                    </p>
                    <Button
                      secondary
                      disabled={busy}
                      onClick={() =>
                        void update("/account/memory", {
                          enabled: false,
                        }).catch(() => {})
                      }
                    >
                      Pause remembering
                    </Button>
                  </>
                ) : (
                  <>
                    <label className="consent-check">
                      <input
                        type="checkbox"
                        checked={consent}
                        onChange={(event) => setConsent(event.target.checked)}
                      />
                      <span>
                        Save this family’s existing and new practice reasons,
                        reflections, and lesson results with Walrus Memory on
                        Mainnet.
                      </span>
                    </label>
                    <p>
                      Do not include personal or financial details. The managed
                      service processes the text; removing a thought from
                      coaching does not erase an uploaded record.
                    </p>
                    <Button
                      disabled={
                        !consent || busy || !state.session?.servicesReady
                      }
                      onClick={() =>
                        void update("/account/memory", { enabled: true }).catch(
                          () => {},
                        )
                      }
                    >
                      Enable remembering
                    </Button>
                    {!state.session?.servicesReady && (
                      <p>
                        The memory and coach services need server configuration.
                      </p>
                    )}
                  </>
                )}
              </div>
            </>
          )}
          {state.role === "learner" && (
            <p>
              {state.session?.memoryEnabled
                ? "Your parent has enabled remembering. New thoughts sync automatically."
                : "Your parent can enable remembering from their account."}
            </p>
          )}
          {state.role === "parent" && state.market?.mode !== "market" && (
            <div className="account-section">
              <h3>Market-price practice</h3>
              <p>
                Start with {money(practiceCapital(state))} in practice capital
                and real daily closes. Your earlier sample activity stays in
                your journal and an archived portfolio.
              </p>
              <Button
                disabled={busy}
                onClick={() =>
                  void update("/account/market", {}).catch(() => {})
                }
              >
                Use market prices
              </Button>
            </div>
          )}
          <RecoveryEmailSettings />
          <ChainAccount />
          <div className="modal-actions">
            <button
              className="text-link"
              disabled={busy}
              onClick={() =>
                void update("/auth/logout", {})
                  .then(() => {
                    setInvitation("");
                    setConsent(false);
                  })
                  .catch(() => {})
              }
            >
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </>
      ) : mode === "forgot" ? (
        <>
          <h2>Forgot your password?</h2>
          <p>
            Enter your username or verified email. Learners without an email can
            use their username to send a reset link to their parent’s verified
            inbox.
          </p>
          <form
            className="limits-form"
            onSubmit={(event) => void forgot(event)}
          >
            <label className="field-label">
              Username or email
              <input
                required
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                maxLength={254}
              />
            </label>
            <Button
              type="submit"
              disabled={sending || !state?.session?.recovery?.ready}
            >
              {sending ? "Requesting…" : "Send reset link"}
            </Button>
          </form>
          {!state?.session?.recovery?.ready && (
            <p>Email recovery is not enabled yet.</p>
          )}
          {resetMessage && <p role="status">{resetMessage}</p>}
          <button
            className="text-link"
            type="button"
            onClick={() => {
              setMode("login");
              setError("");
            }}
          >
            Back to sign in
          </button>
        </>
      ) : (
        <>
          <h2>
            {mode === "register"
              ? "Create your family"
              : mode === "join"
                ? "Join your family"
                : "Welcome back"}
          </h2>
          <div className="simple-tabs auth-tabs">
            {(
              [
                ["login", "Sign in"],
                ["register", "Create family"],
                ["join", "Join a family"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                className={mode === value ? "active" : ""}
                onClick={() => {
                  setMode(value);
                  setError("");
                  setSignupMessage("");
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <form
            className="limits-form"
            onSubmit={(event) => void submit(event)}
          >
            {mode === "join" && (
              <label className="field-label">
                Invitation code
                <input
                  required
                  value={code}
                  onChange={(event) => setCode(event.target.value.trim())}
                  maxLength={32}
                  autoComplete="off"
                />
              </label>
            )}
            {mode === "login" ? (
              <>
                <label className="field-label">
                  Username or email
                  <input
                    required
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    minLength={3}
                    maxLength={254}
                    autoComplete="username"
                  />
                </label>
                <label className="field-label">
                  Password
                  <input
                    required
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    maxLength={128}
                    autoComplete="current-password"
                  />
                </label>
              </>
            ) : (
              <>
                <label className="field-label">
                  Email
                  <input
                    required
                    type="email"
                    autoComplete="email"
                    maxLength={254}
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      setSignupMessage("");
                    }}
                  />
                </label>
                <label className="field-label">
                  Password
                  <input
                    required
                    type="password"
                    minLength={12}
                    maxLength={128}
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </label>
                <p>
                  Use at least 12 characters. Verify your email to activate your
                  account.
                </p>
                {!state?.session?.recovery?.ready && (
                  <p>Email signup is not available yet.</p>
                )}
              </>
            )}
            <Button
              type="submit"
              disabled={
                busy ||
                sending ||
                (mode !== "login" && !state?.session?.recovery?.ready)
              }
            >
              {sending
                ? "Sending..."
                : mode === "login"
                  ? "Sign in"
                  : signupMessage
                    ? "Resend verification link"
                    : "Sign up"}
            </Button>
            {mode !== "login" && signupMessage && (
              <p role="status">{signupMessage}</p>
            )}
            {mode === "login" && (
              <button
                type="button"
                className="text-link"
                onClick={() => {
                  setMode("forgot");
                  setError("");
                  setResetMessage("");
                }}
              >
                Forgot password?
              </button>
            )}
          </form>
        </>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
