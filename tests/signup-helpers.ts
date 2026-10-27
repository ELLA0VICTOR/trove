import { randomUUID } from "node:crypto";
import type { AccountMail } from "../server/integrations/account-mail.ts";

export function emailFixture() {
  const sent: Parameters<AccountMail["send"]>[0][] = [];
  const work: Promise<unknown>[] = [];
  const mail: AccountMail = {
    send: async (input) => {
      sent.push(input);
      return randomUUID();
    },
  };
  return {
    sent,
    mail,
    defer: (promise: Promise<unknown>) => {
      work.push(promise);
    },
    flush: () => Promise.all(work),
  };
}
export function emailToken(text: string) {
  return new URLSearchParams(
    new URL(text.match(/https?:\/\/[^\s]+/)![0]).hash.slice(1),
  ).get("token")!;
}
