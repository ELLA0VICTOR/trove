import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/app.ts";
import { DemoStore } from "../server/store.ts";
import type { AppSnapshot } from "../shared/model.ts";
async function setup() {
  const store = new DemoStore(":memory:", { liveMemory: true });
  let coachCalls = 0;
  const app = await createApp(store, {
    learning: {
      ready: true,
      coachReady: true,
      explain: async () => {
        coachCalls++;
        return {
          mode: "live",
          concept: "concentration",
          sources: [],
          text: "Test explanation",
        };
      },
    },
  });
  function client() {
    const cookies = new Map<string, string>();
    const request = async (path: string, method = "GET", body?: unknown) => {
      const response = await app.request(`/api${path}`, {
        method,
        headers: {
          Cookie: [...cookies]
            .map(([key, value]) => `${key}=${value}`)
            .join("; "),
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      for (const raw of response.headers.getSetCookie()) {
        const [pair] = raw.split(";");
        const index = pair.indexOf("=");
        const key = pair.slice(0, index),
          value = pair.slice(index + 1);
        if (value) cookies.set(key, value);
        else cookies.delete(key);
      }
      return response;
    };
    return { request, cookies };
  }
  return { store, app, client, coachCalls: () => coachCalls };
}
const password = "a-long-test-password";
test("guests can complete free lessons but cannot ask the coach or change financial and personal records", async () => {
  const fixture = await setup();
  try {
    const guest = fixture.client();
    const state = (await (await guest.request("/state")).json()) as AppSnapshot;
    assert.deepEqual(state.decisions, []);
    assert.deepEqual(state.holdings, []);
    assert.deepEqual(state.memories, []);
    for (const [path, body] of [
      ["/guide", { question: "What have I learned about risk?" }],
      ["/orders/preview", { symbol: "AAPL", side: "buy", amount: "25" }],
      ["/orders/execute", { quoteId: randomUUID() }],
      ["/approvals", { quoteId: randomUUID() }],
      [`/approvals/${randomUUID()}`, { approve: true }],
      ["/policy", { perTrade: "10", daily: "20", paused: false }],
      ["/preview-role", { role: "parent" }],
      ["/memories", { kind: "reflection", text: "An unsigned thought." }],
    ] as const) {
      assert.equal((await guest.request(path, "POST", body)).status, 403, path);
    }
    assert.equal(
      (await guest.request(`/memories/${randomUUID()}`, "DELETE")).status,
      403,
    );
    assert.equal(fixture.coachCalls(), 0);
    const lesson = await (await guest.request("/exercise")).json();
    assert.equal(
      (
        await guest.request("/exercise", "POST", {
          concept: lesson.concept,
          variant: lesson.variant,
          answer: 1,
        })
      ).status,
      200,
    );
    assert.equal((await fixture.store.get(state.id)).attempts.length, 1);
    assert.equal(
      (await fixture.store.memoryStatus(state.id)).dispatchEnabled,
      false,
    );
    assert.equal(fixture.coachCalls(), 0);
    const { parent, learner } = await family(fixture);
    assert.equal(
      (await parent.request("/guide", "POST", { question: "Explain risk" }))
        .status,
      403,
    );
    await parent.request("/account/memory", "POST", { enabled: true });
    assert.equal(
      (await learner.request("/guide", "POST", { question: "Explain risk" }))
        .status,
      200,
    );
    assert.equal(fixture.coachCalls(), 1);
    await fixture.store.db
      .prepare("UPDATE account_sessions SET expires_at=0")
      .run();
    assert.equal(
      (await learner.request("/guide", "POST", { question: "Explain risk" }))
        .status,
      401,
    );
    assert.equal(fixture.coachCalls(), 1);
  } finally {
    await fixture.store.db.close();
  }
});
async function family(fixture: Awaited<ReturnType<typeof setup>>) {
  const parent = fixture.client(),
    learner = fixture.client();
  const registered = await parent.request("/auth/register", "POST", {
    username: `parent_${randomUUID().slice(0, 8)}`,
    password,
  });
  assert.equal(registered.status, 200);
  const state = (await registered.json()) as AppSnapshot;
  const invitation = (await (
    await parent.request("/account/invite", "POST", {})
  ).json()) as {
    code: string;
  };
  const learnerName = `learner_${randomUUID().slice(0, 8)}`;
  assert.equal(
    (
      await learner.request("/auth/join", "POST", {
        code: invitation.code,
        username: learnerName,
        password,
      })
    ).status,
    200,
  );
  return { parent, learner, state, invitation, learnerName };
}
test("password accounts use opaque hashed sessions and cannot be entered through the sample cookie", async () => {
  const fixture = await setup();
  try {
    const { parent, state } = await family(fixture);
    assert.equal(state.session?.role, "parent");
    assert.equal(state.cash, "1000000000");
    assert.deepEqual(state.holdings, []);
    const user = (await fixture.store.db
      .prepare("SELECT password_hash,salt FROM account_members LIMIT 1")
      .get()) as {
      password_hash: string;
      salt: string;
    };
    assert.notEqual(user.password_hash, password);
    assert.equal(user.password_hash.length, 128);
    const token = parent.cookies.get("trove_session")!;
    assert.equal(
      await fixture.store.db
        .prepare("SELECT 1 FROM account_sessions WHERE token_hash=?")
        .get(token),
      undefined,
    );
    const forged = await fixture.app.request("/api/state", {
      headers: { Cookie: `trove_demo=${state.id}` },
    });
    assert.notEqual(((await forged.json()) as AppSnapshot).id, state.id);
  } finally {
    await fixture.store.db.close();
  }
});
test("family invitations are single use and roles cannot be switched or borrowed", async () => {
  const fixture = await setup();
  try {
    const { parent, learner, invitation } = await family(fixture);
    const other = fixture.client();
    assert.equal(
      (
        await other.request("/auth/join", "POST", {
          code: invitation.code,
          username: "another_learner",
          password,
        })
      ).status,
      409,
    );
    assert.equal(
      (await learner.request("/preview-role", "POST", { role: "parent" }))
        .status,
      403,
    );
    assert.equal(
      (await parent.request("/preview-role", "POST", { role: "learner" }))
        .status,
      403,
    );
    assert.equal(
      (
        await learner.request("/policy", "POST", {
          perTrade: "999",
          daily: "999",
          paused: false,
        })
      ).status,
      403,
    );
    assert.equal(
      (await learner.request("/account/invite", "POST", {})).status,
      403,
    );
    assert.equal(
      (await learner.request("/account/memory", "POST", { enabled: true }))
        .status,
      403,
    );
    assert.equal(
      (
        await parent.request("/orders/preview", "POST", {
          symbol: "KO",
          side: "buy",
          amount: "25",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await parent.request("/policy", "POST", {
          perTrade: "50",
          daily: "100",
          paused: false,
        })
      ).status,
      200,
    );
    const childState = (await (
      await learner.request("/state")
    ).json()) as AppSnapshot;
    assert.equal(childState.role, "learner");
    assert.equal(childState.policy.perTrade, "50000000");
    assert.equal((await parent.request("/reset", "POST", {})).status, 403);
  } finally {
    await fixture.store.db.close();
  }
});
test("fresh login retrieves the same family and logout invalidates the previous token", async () => {
  const fixture = await setup();
  try {
    const { learner, learnerName, state } = await family(fixture);
    const response = await learner.request("/memories", "POST", {
      kind: "reflection",
      text: "I want to compare sectors.",
    });
    assert.equal(response.status, 200);
    const returning = fixture.client();
    assert.equal(
      (
        await returning.request("/auth/login", "POST", {
          username: learnerName,
          password,
        })
      ).status,
      200,
    );
    const restored = (await (
      await returning.request("/state")
    ).json()) as AppSnapshot;
    assert.equal(restored.id, state.id);
    assert.equal(restored.memories[0].text, "I want to compare sectors.");
    const oldToken = returning.cookies.get("trove_session")!;
    await returning.request("/auth/logout", "POST", {});
    assert.equal(
      (
        await fixture.app.request("/api/state", {
          headers: { Cookie: `trove_session=${oldToken}` },
        })
      ).status,
      401,
    );
  } finally {
    await fixture.store.db.close();
  }
});
test("a separately signed-in parent approves one exact learner choice without widening limits", async () => {
  const fixture = await setup();
  try {
    const { parent, learner } = await family(fixture);
    await parent.request("/policy", "POST", {
      perTrade: "10",
      daily: "100",
      paused: false,
    });
    const quote = (await (
      await learner.request("/orders/preview", "POST", {
        symbol: "KO",
        side: "buy",
        amount: "25",
        reason: "Compare another business.",
      })
    ).json()) as {
      id: string;
    };
    const requested = (await (
      await learner.request("/approvals", "POST", { quoteId: quote.id })
    ).json()) as AppSnapshot;
    assert.equal(
      (
        await parent.request(
          `/approvals/${requested.approvals[0].id}`,
          "POST",
          { approve: true },
        )
      ).status,
      200,
    );
    assert.equal(
      (await parent.request("/orders/execute", "POST", { quoteId: quote.id }))
        .status,
      403,
    );
    const first = (await (
      await learner.request("/orders/execute", "POST", { quoteId: quote.id })
    ).json()) as AppSnapshot;
    const second = (await (
      await learner.request("/orders/execute", "POST", { quoteId: quote.id })
    ).json()) as AppSnapshot;
    assert.equal(first.role, "learner");
    assert.equal(first.sequence, 1);
    assert.equal(second.cash, first.cash);
    assert.equal(first.policy.perTrade, "10000000");
    assert.equal(first.approvals[0].state, "consumed");
  } finally {
    await fixture.store.db.close();
  }
});
test("memory dispatch requires parent consent and never promotes guest seed/history", async () => {
  const fixture = await setup();
  try {
    const guest = fixture.client();
    assert.equal(
      (
        await guest.request("/memories", "POST", {
          kind: "reflection",
          text: "A guest-only thought.",
        })
      ).status,
      403,
    );
    const guestState = (await (
      await guest.request("/state")
    ).json()) as AppSnapshot;
    const { parent, learner, state } = await family(fixture);
    await learner.request("/memories", "POST", {
      kind: "reflection",
      text: "I will compare industries.",
    });
    assert.equal((await fixture.store.memoryStatus(state.id)).heldLocally, 1);
    assert.equal(
      (await parent.request("/account/memory", "POST", { enabled: true }))
        .status,
      200,
    );
    const submitted: string[] = [];
    await fixture.store.memoryOutbox.processOne(
      {
        submit: async (record) => {
          submitted.push(record.learnerScope);
          return "accepted-job";
        },
        status: async () => ({ state: "confirmed", blobId: "confirmed-blob" }),
      },
      0,
    );
    assert.deepEqual(submitted, [await fixture.store.memoryScope(state.id)]);
    assert.equal(
      (await fixture.store.memoryStatus(state.id)).confirmedMainnet,
      0,
    );
    await fixture.store.memoryOutbox.processOne(
      {
        submit: async () => {
          assert.fail("Must poll accepted job");
        },
        status: async () => ({ state: "confirmed", blobId: "confirmed-blob" }),
      },
      2000,
    );
    assert.equal(
      (await fixture.store.memoryStatus(state.id)).confirmedMainnet,
      1,
    );
    assert.equal(
      (await fixture.store.memoryStatus(guestState.id)).heldLocally,
      0,
    );
    assert.equal(
      (await fixture.store.memoryStatus(guestState.id)).confirmedMainnet,
      0,
    );
    const current = (await (
      await learner.request("/state")
    ).json()) as AppSnapshot;
    assert.equal(current.memories[0].blobId, "confirmed-blob");
    await learner.request("/memories", "POST", {
      kind: "reflection",
      text: "A queued thought before pausing.",
    });
    await parent.request("/account/memory", "POST", { enabled: false });
    assert.equal(
      await fixture.store.memoryOutbox.processOne(
        {
          submit: async () => {
            assert.fail("Paused consent must hold new requests");
          },
          status: async () => ({ state: "waiting" }),
        },
        4000,
      ),
      false,
    );
    assert.equal((await fixture.store.memoryStatus(state.id)).heldLocally, 1);
  } finally {
    await fixture.store.db.close();
  }
});
test("wrong passwords, expired sessions and cross-family memory IDs do not grant access", async () => {
  const fixture = await setup();
  try {
    const first = await family(fixture),
      second = await family(fixture);
    assert.equal(
      (
        await second.parent.request("/auth/login", "POST", {
          username: first.learnerName,
          password: "wrong-long-password",
        })
      ).status,
      401,
    );
    await first.learner.request("/memories", "POST", {
      kind: "reflection",
      text: "A private family reason.",
    });
    const thought = (await fixture.store.get(first.state.id)).memories[0];
    assert.equal(
      (
        await second.learner.request("/memories", "POST", {
          kind: "correction",
          text: "Try replacing another family's text.",
          supersedes: thought.id,
        })
      ).status,
      409,
    );
    const secondStatus = await (
      await second.learner.request("/memory/status")
    ).json();
    assert.ok(!JSON.stringify(secondStatus).includes(thought.id));
    await fixture.store.db
      .prepare("UPDATE account_sessions SET expires_at=0")
      .run();
    assert.equal((await first.learner.request("/state")).status, 401);
  } finally {
    await fixture.store.db.close();
  }
});
