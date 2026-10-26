import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.request.get("/api/state");
  await page.request.post("/api/reset", { data: {} });
});

test("a first visit creates one consistent sample session", async ({
  page,
  context,
}) => {
  await context.clearCookies();
  const familyIds: string[] = [];
  page.on("response", async (response) => {
    if (response.url().endsWith("/api/state"))
      familyIds.push((await response.json()).id);
  });
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: "A little wiser, every day." }),
  ).toBeVisible();
  const snapshot = await (await page.request.get("/api/state")).json();
  expect(familyIds.length).toBeGreaterThan(0);
  expect(new Set(familyIds)).toEqual(new Set([snapshot.id]));
});

test("intro can be skipped and hands control back to the page", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("dialog", { name: "Trove introduction" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".character-intro")).toHaveCount(0);
  await expect(page.locator("#root")).not.toHaveAttribute("inert");
  await page.getByRole("link", { name: "Try now", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A little wiser, every day." }),
  ).toBeVisible();
});
test("a practice buy persists after reload with its original explanation", async ({
  page,
}) => {
  await page.goto("/app/explore/KO");
  await page.getByRole("button", { name: "Make a practice move" }).click();
  await page.getByLabel("Practice amount").fill("50");
  await page
    .getByPlaceholder("I’m choosing this because…")
    .fill("I want to understand a different sector.");
  await page.getByRole("button", { name: "Review my practice move" }).click();
  await page.getByRole("button", { name: "Confirm practice move" }).click();
  await expect(
    page.getByRole("heading", { name: "One small move. Something to learn." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep growing" }).click();
  await page.goto("/app/decisions");
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: /I want to understand a different sector/,
    }),
  ).toBeVisible();
  const snapshot = await (await page.request.get("/api/state")).json();
  expect(
    snapshot.decisions.filter((d: { origin: string }) => d.origin === "local"),
  ).toHaveLength(1);
});
test("the exact parent-approved action can return to the learner and execute once", async ({
  page,
}) => {
  await page.goto("/app/explore/KO");
  await page.getByRole("button", { name: "Make a practice move" }).click();
  await page.getByLabel("Practice amount").fill("150");
  await page.getByRole("button", { name: "Review my practice move" }).click();
  await expect(
    page.getByText("This is above your per-investment limit."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ask for guidance" }).click();
  await page.getByRole("link", { name: "Open parent preview" }).click();
  await page.getByRole("button", { name: "Enter parent preview" }).click();
  await page.getByRole("button", { name: "Approve this choice" }).click();
  await page.getByRole("link", { name: /Back to Maya/ }).click();
  await page
    .getByRole("button", { name: "Review this approved choice" })
    .click();
  await page.getByRole("button", { name: "Confirm practice move" }).click();
  await expect(
    page.getByRole("heading", { name: "One small move. Something to learn." }),
  ).toBeVisible();
  const snapshot = await (await page.request.get("/api/state")).json();
  expect(snapshot.approvals[0].state).toBe("consumed");
  expect(snapshot.policy.perTrade).toBe("100000000");
});
test("a learning attempt changes the next task without changing spending authority", async ({
  page,
}) => {
  await page.goto("/app");
  await page.getByRole("button", { name: "Try this thought" }).click();
  await page
    .getByRole("button", {
      name: /Different names can still share the same risks/,
    })
    .click();
  await page.getByRole("button", { name: "Let’s think about it" }).click();
  await expect(page.getByText("That’s a thought worth keeping.")).toBeVisible();
  await page.getByRole("button", { name: "Take the lesson with you" }).click();
  await expect(
    page.getByRole("heading", { name: "A long-term goal. A short-term move." }),
  ).toBeVisible();
  const snapshot = await (await page.request.get("/api/state")).json();
  expect(snapshot.policy.revision).toBe(1);
});
test("a corrected memory changes the local guide response", async ({
  page,
}) => {
  await page.goto("/app/guide");
  await page.getByRole("button", { name: "See or correct a memory" }).click();
  await page
    .getByRole("button", { name: "Correct this thought" })
    .first()
    .click();
  await page
    .getByRole("textbox", { name: "WHAT SHOULD THE GUIDE UNDERSTAND INSTEAD?" })
    .fill("I now understand the shared technology exposure.");
  await page
    .getByRole("button", { name: "Save correction", exact: true })
    .click();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", { name: "Have I really spread my risk?" })
    .click();
  await expect(page.locator(".message-guide")).toContainText(
    "I now understand the shared technology exposure.",
  );
});
test("replay allocation controls change only the comparison", async ({
  page,
}) => {
  await page.goto("/app/replay");
  const before = await page
    .locator(".replay-results strong")
    .nth(1)
    .textContent();
  await page.getByLabel("AAPL allocation percentage").focus();
  await page.keyboard.press("Home");
  await expect(page.locator(".replay-results strong").nth(1)).not.toHaveText(
    before!,
  );
  const snapshot = await (await page.request.get("/api/state")).json();
  expect(snapshot.sequence).toBe(0);
});
test("theme persists and reduced motion bypasses the intro", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".character-intro")).toHaveCount(0);
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
test("consumer pages fit a narrow mobile viewport without runtime errors", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const route of [
    "/app",
    "/app/explore",
    "/app/explore/AAPL",
    "/app/decisions",
    "/app/replay",
    "/app/guide",
    "/app/parent",
    "/app/evidence",
  ]) {
    await page.goto(route);
    await expect(page.locator(".app-main h1")).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(360);
  }
  expect(errors).toEqual([]);
});
