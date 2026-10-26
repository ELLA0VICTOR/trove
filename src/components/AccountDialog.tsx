import { useState } from "react";
import { Copy, LogOut, ShieldCheck } from "lucide-react";
import { api, useApp } from "../lib/app-context.tsx";
import { Button, Modal } from "./UI.tsx";

export function AccountDialog({ onClose }: { onClose: () => void }) {
  const { state, update, busy, notify } = useApp();
  const [mode, setMode] = useState<"login" | "register" | "join">("login");
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [code, setCode] = useState("");
  const [invitation, setInvitation] = useState(""),
    [error, setError] = useState("");
  const [consent, setConsent] = useState(false);
  const account = state?.session?.mode === "account";
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await update(`/auth/${mode}`, {
        username,
        password,
        ...(mode === "join" ? { code } : {}),
      });
      setPassword("");
      onClose();
    } catch (cause) {
      setError((cause as Error).message);
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
      title={account ? "YOUR ACCOUNT" : "SIGN IN TO TROVE"}
      onClose={onClose}
    >
      {account ? (
        <>
          <h2>{state.session?.username}</h2>
          <p>
            {state.role === "parent" ? "Parent account" : "Learner account"}
          </p>
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
                      family” and create their own username and password.
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
            <label className="field-label">
              Username
              <input
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                minLength={3}
                maxLength={32}
                pattern="[A-Za-z0-9_]+"
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
                minLength={12}
                maxLength={128}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
              />
            </label>
            <p>
              {mode === "register"
                ? "Creates a parent account with $1,000 in practice funds. Use a username, not an email address."
                : "Passwords need at least 12 characters."}
            </p>
            <Button type="submit" disabled={busy}>
              {mode === "register"
                ? "Create family account"
                : mode === "join"
                  ? "Join family"
                  : "Sign in"}
            </Button>
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
