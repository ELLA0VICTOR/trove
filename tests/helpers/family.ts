import { randomUUID } from "node:crypto";
import { Accounts } from "../../server/auth.ts";
import type { DemoStore } from "../../server/store.ts";
import { seedState } from "../../shared/fixtures.ts";

/** Authenticated actors with an explicit accounting fixture for domain/API tests. */
export async function seededFamily(store: DemoStore) {
  const accounts = new Accounts(store);
  const suffix = randomUUID().slice(0, 8);
  const parent = await accounts.register({
    username: `parent_${suffix}`,
    password: "synthetic-test-password",
  });
  const invitation = await accounts.invite(parent.member);
  const learner = await accounts.join({
    code: invitation.code,
    username: `learner_${suffix}`,
    password: "synthetic-test-password",
  });
  const family = parent.member.family;
  await store.set(seedState(family));
  return { family, parent, learner };
}
