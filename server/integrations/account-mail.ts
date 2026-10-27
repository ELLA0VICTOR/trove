import { z } from "zod";

export interface AccountMail {
  send(input: {
    to: string;
    subject: string;
    text: string;
    idempotencyKey: string;
  }): Promise<string>;
}

export class ResendAccountMail implements AccountMail {
  private readonly key: string;
  private readonly from: string;
  private readonly http: typeof fetch;
  constructor(key: string, from: string, http: typeof fetch = fetch) {
    this.key = key;
    this.from = from;
    this.http = http;
    if (/[\r\n]/.test(from)) throw new Error("Invalid account email sender.");
    z.email().parse(from.match(/<([^>]+)>$/)?.[1] ?? from);
  }
  async send(input: Parameters<AccountMail["send"]>[0]) {
    const response = await this.http("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey,
      },
      body: JSON.stringify({
        from: this.from,
        to: [input.to],
        subject: input.subject,
        text: input.text,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw new Error(
        "The account email service could not accept the message.",
      );
    const result = z
      .object({ id: z.string().min(1) })
      .parse(await response.json());
    return result.id;
  }
}
