import { test, expect } from "@playwright/test";

test("family sign-in and learner invitations preserve separate roles and returning history", async ({
  page,
  browser,
}) => {
  const suffix = Date.now().toString(36);
  const parent = `parent_${suffix}`,
    learner = `learner_${suffix}`,
    password = "browser-test-password";
  await page.goto("/app");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Create family", exact: true })
    .click();
  await dialog.getByLabel("Username", { exact: true }).fill(parent);
  await dialog.getByLabel("Password", { exact: true }).fill(password);
  await dialog
    .getByRole("button", { name: "Create family account", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: parent, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: parent, exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Create learner invitation" })
    .click();
  const code = await dialog
    .getByLabel("Invitation code (valid for 24 hours)")
    .inputValue();
  expect(code).toHaveLength(32);
  // Memory remains off in this browser test: it must never upload test records.
  await expect(
    dialog.getByRole("button", { name: "Enable remembering" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  const context = await browser.newContext();
  try {
    const child = await context.newPage();
    await child.goto("http://127.0.0.1:5173/app");
    await child.getByRole("button", { name: "Sign in", exact: true }).click();
    const join = child.getByRole("dialog");
    await join
      .getByRole("button", { name: "Join a family", exact: true })
      .click();
    await join.getByLabel("Invitation code", { exact: true }).fill(code);
    await join.getByLabel("Username", { exact: true }).fill(learner);
    await join.getByLabel("Password", { exact: true }).fill(password);
    await join
      .getByRole("button", { name: "Join family", exact: true })
      .click();
    await expect(
      child.getByRole("button", { name: learner, exact: true }),
    ).toBeVisible();
    expect(
      (
        await child.request.post("http://127.0.0.1:5173/api/preview-role", {
          data: { role: "parent" },
        })
      ).status(),
    ).toBe(403);
    await child.request.post("http://127.0.0.1:5173/api/memories", {
      data: {
        kind: "reflection",
        text: "I want to understand how industries differ.",
      },
    });
    await child.getByRole("button", { name: learner, exact: true }).click();
    await child
      .getByRole("dialog")
      .getByRole("button", { name: "Sign out", exact: true })
      .click();
    const login = child.getByRole("dialog");
    await login.getByLabel("Username", { exact: true }).fill(learner);
    await login.getByLabel("Password", { exact: true }).fill(password);
    await login
      .getByRole("button", { name: "Sign in", exact: true })
      .last()
      .click();
    await expect(
      child.getByRole("button", { name: learner, exact: true }),
    ).toBeVisible();
    const snapshot = await (
      await child.request.get("http://127.0.0.1:5173/api/state")
    ).json();
    expect(snapshot.role).toBe("learner");
    expect(snapshot.memories[0].text).toBe(
      "I want to understand how industries differ.",
    );
    expect(snapshot.session.memoryEnabled).toBe(false);
    await child.setViewportSize({ width: 390, height: 844 });
    await child.getByRole("button", { name: learner, exact: true }).click();
    expect(
      await child.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await context.close();
  }
  expect((await (await page.request.get("/api/state")).json()).role).toBe(
    "parent",
  );
});
test.beforeEach(async ({ page }) => {
  await page.request.get("/api/state");
  await page.request.post("/api/reset", { data: {} });
});

test("company discovery supports industries, official logos, and direct mobile navigation", async ({
  page,
}) => {
  await page.goto("/app/explore");
  await expect(
    page.getByRole("heading", { name: "Explore", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".stock-card")).toHaveCount(12);
  await expect
    .poll(() =>
      page
        .locator(".stock-card .company-logo img")
        .evaluateAll(
          (images) =>
            images.length === 12 &&
            images.every(
              (image) =>
                (image as HTMLImageElement).complete &&
                (image as HTMLImageElement).naturalWidth > 0,
            ),
        ),
    )
    .toBe(true);
  await page.getByLabel("Search companies").fill("healthcare");
  await expect(page.locator(".stock-card")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Johnson & Johnson" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await page.getByRole("button", { name: "Funds", exact: true }).click();
  await expect(page.locator(".stock-card")).toHaveCount(2);
  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.getByLabel("Search companies").fill("MSFT");
  await page.locator(".stock-card").click();
  await expect(page).toHaveURL(/\/app\/explore\/MSFT$/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("link", { name: "Learn", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/guide$/);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(
    page.getByRole("dialog", { name: "Main navigation" }),
  ).toBeVisible();
  await expect(page.locator(".app-body")).toHaveAttribute("inert");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toBeFocused();
  await expect(page.locator(".app-body")).not.toHaveAttribute("inert");
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
    page.getByRole("heading", { name: "Your portfolio" }),
  ).toBeVisible();
  const snapshot = await (await page.request.get("/api/state")).json();
  expect(familyIds.length).toBeGreaterThan(0);
  expect(new Set(familyIds)).toEqual(new Set([snapshot.id]));
});

test("intro replays after refresh and can be skipped", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("dialog", { name: "Trove introduction" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".character-intro")).toHaveCount(0);
  await expect(page.locator("#root")).not.toHaveAttribute("inert");
  await page.reload();
  await expect(
    page.getByRole("dialog", { name: "Trove introduction" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Skip intro/ }).click();
  await expect(page.locator(".character-intro")).toHaveCount(0);
  await expect(page.locator("#root")).not.toHaveAttribute("inert");
  await page.getByRole("link", { name: "Try now", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your portfolio" }),
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
  await page.goto("/app/guide");
  await expect(
    page.getByRole("button", { name: "Start lesson: Time horizon" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Start lesson: Shared risk" }).click();
  await page.getByRole("button", { name: "Check understanding" }).click();
  await page
    .getByRole("button", {
      name: /Different names can still share the same risks/,
    })
    .click();
  await page.getByRole("button", { name: "Check answer" }).click();
  await expect(page.getByText("Correct", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Start lesson: Time horizon" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("progressbar", { name: "Lessons completed" }),
  ).toHaveAttribute("aria-valuenow", "1");
  const snapshot = await (await page.request.get("/api/state")).json();
  expect(snapshot.policy.revision).toBe(1);
});

test("parent navigation leads directly to working limits and pause controls", async ({
  page,
}) => {
  await page.goto("/app");
  await page
    .getByRole("navigation", { name: "Your Trove" })
    .getByRole("link", { name: "Parent", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Parent controls" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Enter parent preview" }).click();
  await page.getByRole("button", { name: "Edit limits" }).click();
  await page.getByLabel("Per investment ($)").fill("75");
  await page.getByLabel("Daily allowance ($)").fill("200");
  await page.getByRole("button", { name: "Save limits" }).click();
  await expect(page.locator(".parent-limit-grid")).toContainText("$75.00");
  await expect(page.locator(".parent-limit-grid")).toContainText("$200.00");
  await page.getByRole("button", { name: "Pause practice" }).click();
  await expect(
    page.getByRole("button", { name: "Resume practice" }),
  ).toBeVisible();
  const paused = await (await page.request.get("/api/state")).json();
  expect(paused.policy.paused).toBe(true);
  expect(paused.policy.perTrade).toBe("75000000");
  await page.getByRole("button", { name: "Resume practice" }).click();
  await page.getByRole("link", { name: "Back to Maya", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your portfolio" }),
  ).toBeVisible();
  const learner = await (await page.request.get("/api/state")).json();
  expect(learner.role).toBe("learner");
  expect(learner.policy.paused).toBe(false);
});

test("a decision reflection stays linked to its original choice", async ({
  page,
}) => {
  await page.goto("/app/decisions");
  await page.locator(".compact-decision-row").first().click();
  await page.getByRole("button", { name: "Add a reflection" }).click();
  await page
    .getByRole("textbox", { name: "Reflection", exact: true })
    .fill("I understand that company names alone do not spread risk.");
  await page
    .getByRole("button", { name: "Save reflection", exact: true })
    .click();
  const snapshot = await (await page.request.get("/api/state")).json();
  const memory = snapshot.memories.find(
    (item: { text: string }) =>
      item.text === "I understand that company names alone do not spread risk.",
  );
  expect(memory.decisionId).toBe(snapshot.decisions[0].id);
  expect(snapshot.decisions[0].reason).toBe(
    "I chose five different companies, so I think I have spread out my risk.",
  );
});

test("desktop sidebar can hide and restore without losing the account or chart", async ({
  page,
}) => {
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: "Your portfolio" }),
  ).toBeVisible();
  const width = await page
    .locator(".app-main")
    .evaluate((element) => element.getBoundingClientRect().width);
  await page.getByRole("button", { name: "Hide sidebar" }).click();
  await expect(page.locator(".app-sidebar")).toBeHidden();
  expect(
    await page
      .locator(".app-main")
      .evaluate((element) => element.getBoundingClientRect().width),
  ).toBeGreaterThan(width);
  await page.reload();
  await expect(page.locator(".app-sidebar")).toBeHidden();
  await page.getByRole("button", { name: "Show sidebar" }).click();
  await expect(
    page.getByRole("navigation", { name: "Your Trove" }),
  ).toBeVisible();
  await page
    .getByRole("img", {
      name: /Practice portfolio value over the selected sample period/,
    })
    .focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".portfolio-chart-legend")).toHaveAttribute(
    "data-inspecting",
    "true",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator(".portfolio-chart-legend")).toHaveAttribute(
    "data-inspecting",
    "false",
  );
});
test("portfolio chart supports inspection, zoom, pan, styles, and real sample periods", async ({
  page,
}) => {
  await page.goto("/app");
  await expect(
    page.locator(".portfolio-chart-canvas canvas").first(),
  ).toBeVisible();
  const window = page.locator(".chart-window"),
    initial = await window.textContent();
  await page
    .getByRole("img", {
      name: /Practice portfolio value over the selected sample period/,
    })
    .focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".chart-reading-date")).toContainText(
    "Sep 24, 2026",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator(".chart-reading-date")).toContainText(
    "Sep 25, 2026",
  );
  await page.getByRole("button", { name: "Zoom in chart" }).click();
  await expect(window).not.toHaveText(initial!);
  const zoomed = await window.textContent(),
    box = await page.locator(".portfolio-chart-canvas").boundingBox();
  if (!box) throw new Error("The chart did not render.");
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.45);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.45, {
    steps: 10,
  });
  await page.mouse.up();
  await expect(window).not.toHaveText(zoomed!);
  await page.getByRole("button", { name: "Line chart", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Line chart", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Reset chart view" }).click();
  await expect(window).toHaveText(initial!);
  await page.getByRole("button", { name: "1W", exact: true }).click();
  await expect(window).toContainText("Sep 21, 2026");
  await expect(window).toContainText("Sep 25, 2026");
  const snapshot = await (await page.request.get("/api/state")).json();
  expect(snapshot.sequence).toBe(0);
  expect(snapshot.decisions).toHaveLength(5);
});

test("a corrected memory changes the local guide response", async ({
  page,
}) => {
  await page.goto("/app/guide");
  await page
    .getByRole("button", { name: "Saved thoughts", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Correct this thought" })
    .first()
    .click();
  await page
    .getByRole("textbox", { name: "Correction", exact: true })
    .fill("I now understand the shared technology exposure.");
  await page
    .getByRole("button", { name: "Save correction", exact: true })
    .click();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("tab", { name: "Ask Trove" }).click();
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
test("fixed white and green palette ignores old themes and respects reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => localStorage.setItem("trove-theme", "dark"));
  await page.goto("/");
  await expect(page.locator(".character-intro")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Switch to .* theme/ }),
  ).toHaveCount(0);
  await expect(page.locator("html")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await page.reload();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme");
  expect(
    await page
      .locator("html")
      .evaluate((element) =>
        getComputedStyle(element).getPropertyValue("--spot").trim(),
      ),
  ).toBe("#19764c");
  await page.goto("/app");
  await expect(
    page.getByRole("button", { name: /Switch to .* theme/ }),
  ).toHaveCount(0);
  await expect(page.locator("html")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
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
