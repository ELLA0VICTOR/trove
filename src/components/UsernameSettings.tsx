import { useState } from "react";
import { useApp } from "../lib/app-context.tsx";
import { Button } from "./UI.tsx";

export function UsernameSettings() {
  const { state, update, busy, notify } = useApp();
  const current = state?.session?.username ?? "";
  const [username, setUsername] = useState(current);
  const [error, setError] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await update("/account/username", { username });
      notify("Username updated.");
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  return (
    <section className="account-setting">
      <h3>Username</h3>
      <form className="limits-form" onSubmit={(event) => void save(event)}>
        <label className="field-label">
          Username
          <input
            required
            autoComplete="username"
            minLength={3}
            maxLength={32}
            pattern="[A-Za-z0-9_]+"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            aria-describedby="username-hint"
          />
        </label>
        <p id="username-hint">3–32 letters, numbers, or underscores.</p>
        <Button
          secondary
          type="submit"
          disabled={busy || username.trim().toLowerCase() === current}
        >
          Save username
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
