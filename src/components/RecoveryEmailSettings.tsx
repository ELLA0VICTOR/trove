import { useState } from "react";
import { Check, Mail } from "lucide-react";
import { useApp } from "../lib/app-context.tsx";
import { Button } from "./UI.tsx";

export function RecoveryEmailSettings() {
  const { state, update, busy, notify } = useApp();
  const recovery = state?.session?.recovery;
  const [email, setEmail] = useState(
    recovery?.pendingEmail ?? recovery?.email ?? "",
  );
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await update("/account/email", { email, password });
      setPassword("");
      notify("Verification requested. Check your email.");
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  return (
    <section className="account-setting recovery-settings">
      <h3>
        <Mail size={17} aria-hidden="true" /> Recovery email
      </h3>
      {recovery?.email ? (
        <p className="recovery-verified">
          <Check size={15} aria-hidden="true" /> {recovery.email} · Verified
        </p>
      ) : (
        <p>
          Add and verify an email to sign in by email and reset a forgotten
          password.
        </p>
      )}
      {recovery?.guardianRecovery && (
        <p>
          Your parent’s verified email can receive password-reset links for your
          learner username.
        </p>
      )}
      {!recovery?.ready && <p>Email delivery is not enabled yet.</p>}
      {recovery?.pendingEmail && recovery.delivery === "failed" && (
        <p className="form-error" role="alert">
          The verification email could not be sent. Try again once email
          delivery is available.
        </p>
      )}
      {recovery?.pendingEmail &&
        ["sent", "pending"].includes(recovery.delivery ?? "") && (
          <p role="status">
            Verification requested for {recovery.pendingEmail}. Open the link in
            that inbox to confirm it.
          </p>
        )}
      {recovery?.delivery === "expired" && (
        <p>The verification link expired. Request a new one below.</p>
      )}
      <form className="limits-form" onSubmit={(event) => void submit(event)}>
        <label className="field-label">
          Recovery email
          <input
            required
            type="email"
            autoComplete="email"
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="field-label">
          Current password
          <input
            required
            type="password"
            autoComplete="current-password"
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <Button secondary type="submit" disabled={busy || !recovery?.ready}>
          Send verification link
        </Button>
      </form>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
