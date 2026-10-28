import { COACH_MODEL } from "./jobs/coach-budget.ts";

export type Environment = Record<string, string | undefined>;

/** Placeholder values must never be sent to a provider as credentials. */
export function configuredValue(env: Environment, name: string) {
  const value = env[name]?.trim();
  return !value || /^(REPLACE_ME|YOUR_|<)/i.test(value) ? undefined : value;
}

const settings = [
  ["Tatum Testnet", "TATUM_API_KEY"],
  ["Tatum Mainnet", "TATUM_MAINNET_API_KEY"],
  ["Walrus account", "MEMWAL_ACCOUNT_ID"],
  ["Walrus delegate", "MEMWAL_PRIVATE_KEY"],
  ["Market data", "MARKETSTACK_API_KEY"],
  ["Alpaca Key ID", "ALPACA_API_KEY"],
  ["Alpaca secret", "ALPACA_API_SECRET"],
  ["AI coach", "OPENAI_API_KEY"],
  ["Coach model", "COACH_MODEL"],
  ["Coach allowance", "COACH_BUDGET_USD"],
  ["Hosted database", "DATABASE_URL"],
  ["Account email", "RESEND_API_KEY"],
  ["Account sender", "EMAIL_FROM"],
] as const;

export function setupReport(env: Environment) {
  return settings.map(([service, variable]) => {
    const raw = env[variable]?.trim();
    const value = configuredValue(env, variable);
    let status = !raw ? "missing" : !value ? "placeholder" : "ready-to-check";
    if (
      value &&
      variable === "MEMWAL_ACCOUNT_ID" &&
      !/^0x[\da-f]{1,64}$/i.test(value)
    )
      status = "invalid-format";
    if (
      value &&
      variable === "MEMWAL_PRIVATE_KEY" &&
      !/^(0x)?[\da-f]{64}$/i.test(value)
    )
      status = "invalid-format";
    if (value && variable === "COACH_MODEL" && value !== COACH_MODEL)
      status = "invalid-format";
    if (
      value &&
      variable === "DATABASE_URL" &&
      !/^postgres(?:ql)?:\/\/[^\s]+$/.test(value)
    )
      status = "invalid-format";
    if (
      value &&
      variable === "COACH_BUDGET_USD" &&
      (!/^(0|[1-5])(?:\.\d{1,2})?$/.test(value) ||
        Number(value) <= 0 ||
        Number(value) > 5)
    )
      status = "invalid-format";
    return { service, variable, status };
  });
}
