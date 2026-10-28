import { test, expect } from "@playwright/test";
import type { Page, APIRequestContext } from "@playwright/test";
import type { AppSnapshot, Memory } from "../../shared/model.ts";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  installBrowserWallet,
  seedBrowserTrade,
} from "../helpers/browser-wallet.ts";

const mailFile = resolve(
  process.env.TROVE_BROWSER_DATA_DIR ?? ".artifacts/browser-store",
  "mail.jsonl",
);
test("dragging from a signup field onto the backdrop keeps the form open", async ({
  page,
}) => {
  await page.goto("/app?signin=1");
  const dialog = page.getByRole("dialog");
  const field = await dialog
    .getByLabel("Username or email", { exact: true })
    .boundingBox();
  const box = await dialog.boundingBox();
  if (!field || !box) throw new Error("Sign-in dialog did not open.");
  await page.mouse.move(field.x + 20, field.y + field.height / 2);
  await page.mouse.down();
  await page.mouse.move(Math.max(1, box.x - 20), Math.max(1, box.y - 20), {
    steps: 6,
  });
  await page.mouse.up();
  await expect(dialog).toBeVisible();
  await page.mouse.click(Math.max(1, box.x - 20), Math.max(1, box.y - 20));
  await expect(dialog).toHaveCount(0);
});
async function signupToken(email: string) {
  let token = "";
  await expect
    .poll(() => {
      if (!existsSync(mailFile)) return "";
      const messages = readFileSync(mailFile, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      const message = messages.findLast(
        (item) =>
          item.to === email && item.idempotencyKey.startsWith("trove-signup-"),
      );
      if (!message) return "";
      token = new URLSearchParams(
        new URL(message.text.match(/https?:\/\/[^\s]+/)![0]).hash.slice(1),
      ).get("token")!;
      return token;
    })
    .not.toBe("");
  return token;
}
async function createVerifiedAccount(
  request: APIRequestContext,
  username = `portfolio_${crypto.randomUUID().slice(0, 8)}`,
  code?: string,
) {
  const email = `${username}@example.com`;
  const response = await request.post(
    code ? "/api/auth/join" : "/api/auth/register",
    {
      data: {
        email,
        password: "browser-test-password",
        ...(code ? { code } : {}),
      },
    },
  );
  expect(response.status()).toBe(202);
  const token = await signupToken(email);
  const complete = await request.post("/api/auth/complete-signup", {
    data: { token },
  });
  expect(complete.ok()).toBe(true);
  const renamed = await request.post("/api/account/username", {
    data: { username },
  });
  expect(renamed.ok()).toBe(true);
  return renamed;
}
async function finishSignupScreen(page: Page, email: string, username: string) {
  const token = await signupToken(email);
  await page.goto(`/app/create-account#token=${token}`);
  await expect(
    page.getByRole("button", { name: "Verify email", exact: true }),
  ).toBeEnabled();
  expect(new URL(page.url()).hash).toBe("");
  await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome to Trove." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Continue to Trove" }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Username", { exact: true })).toHaveValue(
    /^trove_[a-f0-9]{10}$/,
  );
  await dialog.getByLabel("Username", { exact: true }).fill(username);
  await dialog
    .getByRole("button", { name: "Save username", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: username, exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
}
async function createPortfolioAccount(page: Page) {
  await createVerifiedAccount(page.request);
}
async function createLearnerAccount(page: Page) {
  await createPortfolioAccount(page);
  const invitation = await page.request.post("/api/account/invite", {
    data: {},
  });
  expect(invitation.ok()).toBe(true);
  const code = (await invitation.json()).code;
  await page.request.post("/api/auth/logout", { data: {} });
  await createVerifiedAccount(
    page.request,
    `learner_${crypto.randomUUID().slice(0, 8)}`,
    code,
  );
}

test("email sign-in, forgot-password, verification and reset screens handle links without exposing URL tokens", async ({
  page,
}) => {
  await page.route("**/api/state", async (route) => {
    const response = await route.fetch();
    const state = await response.json();
    state.session.recovery = { ready: true };
    await route.fulfill({ response, json: state });
  });
  await page.route("**/api/auth/forgot-password", (route) =>
    route.fulfill({
      status: 202,
      json: {
        message: "If an eligible account matches, a reset link will be sent.",
      },
    }),
  );
  await page.goto("/app?signin=1");
  let dialog = page.getByRole("dialog", { name: "SIGN IN TO TROVE" });
  await dialog
    .getByLabel("Username or email", { exact: true })
    .fill("parent@example.com");
  expect(
    await dialog
      .getByLabel("Username or email", { exact: true })
      .evaluate((input: HTMLInputElement) => input.checkValidity()),
  ).toBe(true);
  await page.route("**/api/auth/login", (route) =>
    route.fulfill({
      status: 401,
      json: { error: "The username, email, or password is incorrect." },
    }),
  );
  await dialog
    .getByLabel("Password", { exact: true })
    .fill("wrong-private-password");
  await dialog
    .getByRole("button", { name: "Sign in", exact: true })
    .last()
    .click();
  await expect(dialog.getByRole("alert")).toContainText("incorrect");
  await dialog
    .getByRole("button", { name: "Forgot password?", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "RESET YOUR PASSWORD" });
  await expect(
    dialog.getByRole("button", { name: "Send reset link", exact: true }),
  ).toBeEnabled();
  await dialog
    .getByRole("button", { name: "Send reset link", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText(
    "If an eligible account matches",
  );
  const token = "A".repeat(43);
  let resetCalls = 0;
  await page.route("**/api/auth/reset-password", async (route) => {
    resetCalls++;
    expect(route.request().postDataJSON().token).toBe(token);
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto(`/app/reset-password#token=${token}`);
  await expect(
    page.getByRole("heading", { name: "Choose a new password." }),
  ).toBeVisible();
  expect(page.url()).not.toContain(token);
  await page
    .getByLabel("New password", { exact: true })
    .fill("replacement-private-password");
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill("different-private-password");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "The passwords do not match.",
  );
  expect(resetCalls).toBe(0);
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill("replacement-private-password");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(
    page.getByRole("heading", { name: "Password updated." }),
  ).toBeVisible();
  expect(resetCalls).toBe(1);
  await page.getByRole("link", { name: "Continue to sign in" }).click();
  await expect(
    page.getByRole("dialog", { name: "SIGN IN TO TROVE" }),
  ).toBeVisible();
  await page.route("**/api/auth/verify-email", (route) =>
    route.fulfill({ json: { ok: true } }),
  );
  await page.goto(`/app/verify-email#token=${"B".repeat(43)}`);
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Email verified." }),
  ).toBeVisible();
  expect(new URL(page.url()).hash).toBe("");
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("visitors can finish lessons and browse prices but must sign in for Ask Trove and personal actions", async ({
  page,
}) => {
  await page.goto("/app/guide");
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
  await page.getByRole("tab", { name: "Ask Trove", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in to Ask Trove." }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Ask your learning guide" }),
  ).toHaveCount(0);
  expect(
    (
      await page.request.post("/api/guide", {
        data: { question: "Explain risk" },
      })
    ).status(),
  ).toBe(403);
  await page.goto("/app/explore/AAPL");
  await expect(page.locator(".company-price")).toBeVisible();
  await page
    .getByRole("button", { name: "Sign in to practice", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "SIGN IN TO TROVE" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  for (const route of ["/app/decisions", "/app/parent", "/app/replay"]) {
    await page.goto(route);
    await expect(page.locator(".portfolio-welcome")).toBeVisible();
    await expect(
      page.locator(
        ".compact-decision-row, .parent-limit-grid, .replay-results",
      ),
    ).toHaveCount(0);
  }
});

test("product walkthrough opens in place, supports steps, and closes by button, backdrop, or Escape", async ({
  page,
}) => {
  await page.goto("/app/explore");
  const trigger = page.getByRole("button", {
    name: "What this does",
    exact: true,
  });
  await trigger.click();
  let dialog = page.getByRole("dialog", { name: "WHAT THIS DOES" });
  await expect(
    dialog.getByRole("heading", { name: "Practice investing as a family." }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Back", exact: true }),
  ).toBeDisabled();
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(Math.abs(bounds!.width - bounds!.height)).toBeLessThan(2);
  await page.screenshot({ path: ".artifacts/what-this-does-desktop.png" });
  await dialog.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    dialog.getByRole("heading", { name: "Make your first move." }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Back", exact: true }).click();
  await expect(
    dialog.getByRole("heading", { name: "Practice investing as a family." }),
  ).toBeVisible();
  for (let i = 0; i < 3; i++)
    await dialog.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    dialog.getByRole("heading", { name: "Learn from every choice." }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Got it", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page).toHaveURL(/\/app\/explore$/);
  await trigger.click();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.setViewportSize({ width: 360, height: 800 });
  await trigger.click();
  dialog = page.getByRole("dialog", { name: "WHAT THIS DOES" });
  for (let i = 0; i < 3; i++)
    await dialog.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Got it", exact: true }),
  ).toBeVisible();
  const mobile = await dialog.boundingBox();
  await expect(
    dialog.getByRole("button", { name: "Close dialog", exact: true }),
  ).toBeInViewport({ ratio: 1 });
  expect(mobile!.x).toBeGreaterThanOrEqual(0);
  expect(mobile!.x + mobile!.width).toBeLessThanOrEqual(360);
  await page.screenshot({ path: ".artifacts/what-this-does-mobile.png" });
  await page.mouse.click(5, 5);
  await expect(dialog).toHaveCount(0);
  await page.goto("/app");
  await trigger.click();
  await expect(
    page
      .getByRole("dialog", { name: "WHAT THIS DOES" })
      .getByRole("heading", { name: "Practice investing as a family." }),
  ).toBeVisible();
});

test("portfolio stays hidden until sign-in and returns to the welcome screen after logout", async ({
  page,
}) => {
  await page.goto("/app");
  const main = page.getByRole("main");
  await expect(
    main.getByRole("heading", { name: "Your portfolio starts here." }),
  ).toBeVisible();
  await expect(
    page.locator(
      ".account-metrics, .portfolio-performance, .portfolio-holdings",
    ),
  ).toHaveCount(0);
  await expect(page.locator(".sample-strip")).toHaveCount(0);
  await main
    .getByRole("button", { name: "Create a family account", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Username", { exact: true })).toHaveCount(0);
  await expect(dialog.getByLabel("Password", { exact: true })).toBeVisible();
  const username = `welcome_${crypto.randomUUID().slice(0, 8)}`;
  await dialog
    .getByLabel("Email", { exact: true })
    .fill(`${username}@example.com`);
  await dialog
    .getByLabel("Password", { exact: true })
    .fill("browser-test-password");
  await dialog.getByRole("button", { name: "Sign up", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("Check your inbox");
  expect(
    (await (await page.request.get("/api/state")).json()).session.mode,
  ).toBe("sample");
  await finishSignupScreen(page, `${username}@example.com`, username);
  await expect(
    main.getByRole("heading", { name: "Your portfolio", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".account-metrics")).toBeVisible();
  await page.reload();
  await expect(
    main.getByRole("heading", { name: "Your portfolio", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: username, exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(
    main.getByRole("heading", { name: "Your portfolio starts here." }),
  ).toBeVisible();
  await expect(
    page.locator(
      ".account-metrics, .portfolio-performance, .portfolio-holdings",
    ),
  ).toHaveCount(0);
  await main.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Sign in", exact: true })
      .last(),
  ).toBeVisible();
});

test("family sign-in and learner invitations preserve separate roles and returning history", async ({
  page,
  browser,
  baseURL,
}) => {
  const suffix = Date.now().toString(36);
  const parent = `parent_${suffix}`,
    learner = `learner_${suffix}`,
    password = "browser-test-password";
  await page.goto("/app");
  await page
    .getByRole("button", { name: "Sign in", exact: true })
    .first()
    .click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Create family", exact: true })
    .click();
  await dialog
    .getByLabel("Email", { exact: true })
    .fill(`${parent}@example.com`);
  await dialog
    .getByLabel("Password", { exact: true })
    .fill("browser-test-password");
  await dialog.getByRole("button", { name: "Sign up", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("Check your inbox");
  await finishSignupScreen(page, `${parent}@example.com`, parent);
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
  const context = await browser.newContext({ baseURL });
  try {
    const child = await context.newPage();
    await child.goto("/app");
    await child
      .getByRole("button", { name: "Sign in", exact: true })
      .first()
      .click();
    const join = child.getByRole("dialog");
    await join
      .getByRole("button", { name: "Join a family", exact: true })
      .click();
    await join.getByLabel("Invitation code", { exact: true }).fill(code);
    await join
      .getByLabel("Email", { exact: true })
      .fill(`${learner}@example.com`);
    await join
      .getByLabel("Password", { exact: true })
      .fill("browser-test-password");
    await join.getByRole("button", { name: "Sign up", exact: true }).click();
    await expect(join.getByRole("status")).toContainText("Check your inbox");
    await finishSignupScreen(child, `${learner}@example.com`, learner);
    expect(
      (
        await child.request.post("/api/preview-role", {
          data: { role: "parent" },
        })
      ).status(),
    ).toBe(403);
    await child.request.post("/api/memories", {
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
    await login.getByLabel("Username or email", { exact: true }).fill(learner);
    await login.getByLabel("Password", { exact: true }).fill(password);
    await login
      .getByRole("button", { name: "Sign in", exact: true })
      .last()
      .click();
    await expect(
      child.getByRole("button", { name: learner, exact: true }),
    ).toBeVisible();
    const snapshot = await (await child.request.get("/api/state")).json();
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

test("a first visit creates one consistent guest session behind the sign-in screen", async ({
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
    page.getByRole("heading", { name: "Your portfolio starts here." }),
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
    page.getByRole("heading", { name: "Your portfolio starts here." }),
  ).toBeVisible();
});
test("Home exposes required wallet setup and activation asks the parent wallet to sign", async ({
  page,
}) => {
  await createPortfolioAccount(page);
  const wallet = await installBrowserWallet(page, false);
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: "Set up your family portfolio" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Activate practice portfolio",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Link Test Sui Wallet", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Link Test Sui Wallet", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Activate practice portfolio",
      exact: true,
    }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Activate practice portfolio", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Set up your family portfolio" }),
  ).toHaveCount(0);
  expect(wallet.signatures()).toBe(1);
});

for (const network of ["testnet", "mainnet"] as const)
  test(`${network}: parent activates before any learner wallet is linked`, async ({
    page,
  }) => {
    await createPortfolioAccount(page);
    const wallet = await installBrowserWallet(
      page,
      false,
      false,
      false,
      "own",
      network,
    );
    await page.goto("/app");
    await page
      .getByRole("button", { name: "Link Test Sui Wallet", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Activate practice portfolio",
        exact: true,
      }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Activate practice portfolio", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Your portfolio is active" }),
    ).toBeVisible();
    await expect(
      page.getByRole("list", { name: "Setup progress" }).locator(".complete"),
    ).toHaveCount(2);
    await expect(
      page.getByRole("link", { name: "View practice contract account" }),
    ).toHaveAttribute(
      "href",
      `https://suiscan.xyz/${network}/object/0x${"9".repeat(64)}`,
    );
    expect(wallet.signatures()).toBe(1);
  });

test("learner finishes connecting to an already active portfolio without parent approval", async ({
  page,
}) => {
  await createLearnerAccount(page);
  const wallet = await installBrowserWallet(page, true, false);
  await page.goto("/app/explore/AAPL");
  await page
    .getByRole("link", { name: "Set up practice", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your portfolio is active" }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Finish connecting Test Sui Wallet",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your portfolio is active" }),
  ).toHaveCount(0);
  expect(wallet.signatures()).toBe(1);
  await page.goto("/app/explore/AAPL");
  await expect(
    page.getByRole("button", { name: "Make a practice move" }),
  ).toBeVisible();
});

test("linking the learner wallet automatically starts its one-time registration", async ({
  page,
}) => {
  await createLearnerAccount(page);
  const wallet = await installBrowserWallet(page, true, false, false);
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: "Your portfolio is active" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Link Test Sui Wallet", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your portfolio is active" }),
  ).toHaveCount(0);
  expect(wallet.signatures()).toBe(1);
});

test("an unconfigured family sees setup before trading while lessons remain available", async ({
  page,
}) => {
  await createLearnerAccount(page);
  await page.goto("/app/explore/AAPL");
  await expect(
    page.getByRole("button", { name: "Make a practice move" }),
  ).toHaveCount(0);
  await page
    .getByRole("link", { name: "Set up practice", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Set up your family portfolio" }),
  ).toBeVisible();
  await page.goto("/app/guide");
  await expect(
    page.getByRole("button", { name: "Start lesson: Shared risk" }),
  ).toBeEnabled();
  expect(
    (
      await page.request.post("/api/orders/execute", {
        data: { quoteId: crypto.randomUUID() },
      })
    ).status(),
  ).toBe(409);
});

test("a practice buy persists after reload with its original explanation", async ({
  page,
}) => {
  await createLearnerAccount(page);
  const wallet = await installBrowserWallet(page);
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
  await expect(
    page.getByRole("heading", { name: "Decisions", exact: true }),
  ).toBeVisible();
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
  expect(wallet.signatures()).toBe(1);
});
test("parent approval and learner wallet signing complete one exact request", async ({
  page,
  browser,
  baseURL,
}) => {
  const parentContext = await browser.newContext({ baseURL });
  try {
    const suffix = crypto.randomUUID().slice(0, 8);
    await createVerifiedAccount(
      parentContext.request,
      `approval_parent_${suffix}`,
    );
    const invitation = await parentContext.request.post("/api/account/invite", {
      data: {},
    });
    expect(invitation.ok()).toBe(true);
    await createVerifiedAccount(
      page.request,
      `approval_child_${suffix}`,
      (await invitation.json()).code,
    );
    const learnerWallet = await installBrowserWallet(page);
    await page.goto("/app/explore/KO");
    await page.getByRole("button", { name: "Make a practice move" }).click();
    await page.getByLabel("Practice amount").fill("150");
    await page.getByRole("button", { name: "Review my practice move" }).click();
    await expect(
      page.getByText("This is above your per-investment limit."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Ask for guidance" }).click();
    await page.getByRole("link", { name: "Back to portfolio" }).click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Waiting for parent approval" }),
    ).toBeVisible();
    const parentPage = await parentContext.newPage();
    const parentWallet = await installBrowserWallet(parentPage);
    await parentPage.goto("/app/parent");
    await parentPage
      .getByRole("button", { name: "Approve this choice" })
      .click();
    await expect(
      parentPage.getByText("Approved. The learner can sign this trade.", {
        exact: true,
      }),
    ).toBeVisible();
    await page.bringToFront();
    await page.getByRole("button", { name: "Sign approved trade" }).click();
    await expect(
      page.locator(".holding-row").filter({ hasText: "Coca-Cola" }),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Waiting for parent approval" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Confirm practice move" }),
    ).toHaveCount(0);
    const snapshot = await (await page.request.get("/api/state")).json();
    expect(snapshot.approvals[0].state).toBe("consumed");
    expect(snapshot.policy.perTrade).toBe("100000000");
    expect(snapshot.sequence).toBe(1);
    expect(
      snapshot.decisions.filter(
        (d: { origin: string }) => d.origin === "local",
      ),
    ).toHaveLength(1);
    const repeat = await parentContext.request.post(
      `/api/approvals/${snapshot.approvals[0].id}`,
      { data: { approve: true } },
    );
    expect(repeat.status()).toBe(409);
    expect(parentWallet.signatures()).toBe(1);
    expect(learnerWallet.signatures()).toBe(1);
  } finally {
    await parentContext.close();
  }
});
test("an expired approval stays visible with a fresh-preview link after reload", async ({
  page,
}) => {
  await createLearnerAccount(page);
  await installBrowserWallet(page);
  await page.goto("/app");
  const quoteResponse = await page.request.post("/api/orders/preview", {
    data: {
      symbol: "KO",
      side: "buy",
      amount: "150",
      reason: "An expired request stays understandable.",
    },
  });
  expect(quoteResponse.ok()).toBe(true);
  const quote = await quoteResponse.json();
  expect(
    await page.evaluate(
      async (id) =>
        (
          await fetch("/api/approvals", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ quoteId: id }),
          })
        ).ok,
      quote.id,
    ),
  ).toBe(true);
  // Show the state returned for a previously approved quote whose signing
  // window has passed. It must not silently disappear from Home.
  await page.route("**/api/state", async (route) => {
    const response = await route.fetch();
    const state = await response.json();
    state.approvals[0].state = "approved";
    state.approvals[0].quote.expiresAt = Date.now() - 1000;
    state.chain = { ready: true, account: "0x" + "9".repeat(64), pending: [] };
    await route.fulfill({ response, json: state });
  });
  await page.goto("/app");
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "This request needs a fresh preview" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Review a new choice" }),
  ).toHaveAttribute("href", "/app/explore/KO");
  await page.reload();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "This request needs a fresh preview" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Complete approved trade" }),
  ).toHaveCount(0);
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
  await createPortfolioAccount(page);
  await page.goto("/app");
  await page
    .getByRole("navigation", { name: "Your Trove" })
    .getByRole("link", { name: "Parent", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Parent controls" }),
  ).toBeVisible();
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
  await page.getByRole("link", { name: "Portfolio", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your portfolio", exact: true }),
  ).toBeVisible();
  const learner = await (await page.request.get("/api/state")).json();
  expect(learner.role).toBe("parent");
  expect(learner.policy.paused).toBe(false);
});

test("a decision reflection stays linked to its original choice", async ({
  page,
}) => {
  await createLearnerAccount(page);
  await seedBrowserTrade(
    page,
    "25",
    "I want to understand how companies share risks.",
  );
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
    "I want to understand how companies share risks.",
  );
});

test("desktop sidebar can hide and restore without losing the account or chart", async ({
  page,
}) => {
  await createPortfolioAccount(page);
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
      name: /Practice portfolio value over the selected period/,
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
  await createPortfolioAccount(page);
  await page.goto("/app");
  await expect(
    page.locator(".portfolio-chart-canvas canvas").first(),
  ).toBeVisible();
  const window = page.locator(".chart-window"),
    initial = await window.textContent();
  await page
    .getByRole("img", {
      name: /Practice portfolio value over the selected period/,
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
  expect(snapshot.decisions).toHaveLength(0);
});

test("a corrected memory changes the local guide response", async ({
  page,
}) => {
  await createLearnerAccount(page);
  expect(
    (
      await page.request.post("/api/memories", {
        data: {
          kind: "reflection",
          text: "I am learning how companies share risks.",
        },
      })
    ).ok(),
  ).toBe(true);
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
  await createPortfolioAccount(page);
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

test("parent practice refills update the shared portfolio without manufacturing profit or changing limits", async ({
  page,
}) => {
  await createPortfolioAccount(page);
  await page.goto("/app/parent");
  const before = await (await page.request.get("/api/state")).json();
  await page
    .getByRole("button", { name: "Add practice funds", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "PRACTICE FUNDS" });
  await dialog.getByLabel("Amount ($)", { exact: true }).fill("4000");
  await dialog.getByRole("button", { name: "Add funds", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Practice funds" }),
  ).toContainText("$5,000.00");
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Practice funds" }),
  ).toContainText("$5,000.00");
  const after = await (await page.request.get("/api/state")).json();
  expect(after.policy).toEqual(before.policy);
  expect(after.daySpent).toBe(before.daySpent);
  expect(after.funding).toHaveLength(1);
  await page.goto("/app");
  await expect(page.locator(".account-total")).toContainText("$5,000.00");
  await expect(page.locator(".account-metrics")).toContainText("+$0.00");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/parent");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("a corrected thought confirms after closing Saved thoughts and the queued chat continues once automatically", async ({
  page,
}) => {
  await createLearnerAccount(page);
  const original: Memory = {
    id: "original-thesis",
    kind: "reflection",
    text: "Different company names spread my risk.",
    recordedAt: new Date().toISOString(),
    active: true,
    origin: "local",
    blobId: "original-blob",
    syncStatus: "confirmed",
  };
  let corrected = false,
    confirmed = false,
    generations = 0,
    polls = 0;
  let snapshot: AppSnapshot;
  const memories = (): Memory[] =>
    corrected
      ? [
          { ...original, active: false },
          {
            ...original,
            id: "new-correction",
            kind: "correction",
            text: "Different names can share industry risk.",
            supersedes: original.id,
            blobId: confirmed ? "correction-blob" : undefined,
            syncStatus: confirmed ? "confirmed" : "accepted",
          },
        ]
      : [original];
  await page.route("**/api/state", async (route) => {
    const response = await route.fetch();
    snapshot = await response.json();
    snapshot.session!.memoryEnabled = true;
    snapshot.session!.servicesReady = true;
    snapshot.memories = memories();
    snapshot.chain = { ready: false, network: "testnet" };
    await route.fulfill({ response, json: snapshot });
  });
  await page.route("**/api/memories", async (route) => {
    expect(route.request().postDataJSON().supersedes).toBe(original.id);
    corrected = true;
    await route.fulfill({ json: { ...snapshot, memories: memories() } });
  });
  await page.route("**/api/memory/status", async (route) => {
    polls++;
    await route.fulfill({
      json: {
        records: [
          {
            id: "new-correction",
            status: confirmed ? "confirmed" : "accepted",
            blobId: confirmed ? "correction-blob" : undefined,
            withdrawn: false,
          },
        ],
      },
    });
  });
  await page.route("**/api/guide", async (route) => {
    generations++;
    if (corrected) expect(confirmed).toBe(true);
    await route.fulfill({
      json: {
        text: corrected
          ? "Your corrected thesis now considers shared industry risks."
          : "Let's compare the risks behind your company choices.",
        sources: [corrected ? "new-correction" : original.id],
        mode: "live",
        concept: "concentration",
      },
    });
  });
  await page.clock.install();
  await page.goto("/app/guide");
  await page.getByRole("tab", { name: "Ask Trove" }).click();
  await page
    .getByRole("textbox", { name: "Ask your learning guide" })
    .fill("Have I spread my risk?");
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.getByRole("log")).toContainText("Let's compare the risks");
  await page
    .getByRole("button", { name: "Saved thoughts", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "SAVED THOUGHTS" });
  await dialog.getByRole("button", { name: "Correct this thought" }).click();
  await dialog
    .getByLabel("Correction", { exact: true })
    .fill("Different names can share industry risk.");
  await dialog.getByRole("button", { name: "Save correction" }).click();
  await expect(
    dialog.getByRole("button", { name: "Save reflection" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  const question = "What changed in my understanding?";
  await page
    .getByRole("textbox", { name: "Ask your learning guide" })
    .fill(question);
  await page.getByRole("button", { name: "Send question" }).click();
  await expect(page.locator(".guide-thinking")).toContainText(
    "Updating your saved thoughts",
  );
  expect(generations).toBe(1);
  await expect.poll(() => polls).toBeGreaterThan(0);
  confirmed = true;
  await page.clock.runFor(2500);
  await expect(page.getByRole("log")).toContainText(
    "Your corrected thesis now considers shared industry risks.",
  );
  expect(generations).toBe(2);
  await expect(page.getByRole("log")).toContainText("Let's compare the risks");
  await expect(
    page.getByRole("log").getByText(question, { exact: true }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "Saved thoughts", exact: true })
    .click();
  await expect(dialog).toContainText("MAINNET CONFIRMED");
});

test("cached app navigation reaches the top immediately while a background state request is waiting", async ({
  page,
}) => {
  await createPortfolioAccount(page);
  await page.goto("/app/explore");
  await expect(
    page.getByRole("heading", { name: "Explore", exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }),
  );
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let waiting = false;
  await page.route("**/api/state", async (route) => {
    waiting = true;
    await gate;
    await route.continue();
  });
  try {
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect.poll(() => waiting).toBe(true);
    await page
      .getByRole("navigation", { name: "Your Trove" })
      .getByRole("link", { name: "Home", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Your portfolio", exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  } finally {
    release();
  }
});

test("IEX prices show their source and refresh automatically on a visible asset screen", async ({
  page,
}) => {
  let price = "120000000";
  await page.route("**/api/state", async (route) => {
    const response = await route.fetch(),
      state = await response.json();
    state.market = {
      mode: "market",
      provider: "Alpaca IEX",
      quoteMode: "intraday",
      asOf: "2026-10-27",
      quoteAt: "2026-10-27T19:59:59Z",
      stale: false,
      marketOpen: false,
      status: "Market closed · last available IEX prices",
    };
    state.chain = { ready: false };
    const current = state.instruments
      .find((i: { symbol: string }) => i.symbol === "AAPL")
      .prices.at(-1);
    current.price = price;
    current.sourceTimestamp = "2026-10-27T19:59:59Z";
    await route.fulfill({ response, json: state });
  });
  await page.clock.install();
  await page.goto("/app/explore/AAPL");
  await expect(page.locator(".company-price")).toContainText("$120.00");
  await expect(page.locator(".company-price")).toContainText("IEX price");
  await expect(page.locator(".company-price")).toContainText("Oct 27");
  price = "121000000";
  await page.clock.fastForward(31000);
  await expect(page.locator(".company-price")).toContainText("$121.00");
});

test("price polling moves holding returns, total returns and the chart through gains and losses without a reload", async ({
  page,
}) => {
  await createPortfolioAccount(page);
  const start = new Date(Date.now() - 3600000).toISOString();
  let price = 100;
  await page.route("**/api/state", async (route) => {
    const response = await route.fetch(),
      state = await response.json();
    state.cash = "899999999";
    state.holdings = [
      { symbol: "AAPL", units: "100000000", cost: "100000001" },
    ];
    state.funding = [];
    state.portfolio = {
      id: "return-fixture",
      startedAt: start,
      initialCash: "1000000000",
      datasetId: "price-fixture",
    };
    state.market = {
      mode: "market",
      provider: "Alpaca IEX",
      quoteMode: "intraday",
      asOf: start.slice(0, 10),
      stale: false,
      marketOpen: true,
      status: "IEX prices refreshed about once a minute",
    };
    state.chain = { ready: false, network: "testnet" };
    state.instruments
      .find((i: { symbol: string }) => i.symbol === "AAPL")
      .prices.at(-1).price = String(price * 1000000);
    state.portfolioObservations = [
      { date: start, value: 1000, capital: 1000 },
      {
        date: new Date().toISOString(),
        value: 899.999999 + price,
        capital: 1000,
      },
    ];
    await route.fulfill({ response, json: state });
  });
  await page.clock.install();
  await page.goto("/app");
  const total = page.locator(".account-metrics > div").last();
  await expect(total).toContainText("+$0.00");
  await expect(total).not.toContainText("-$0.00");
  await expect(
    page.locator(".portfolio-chart-canvas canvas").first(),
  ).toBeVisible();
  price = 110;
  await page.clock.fastForward(31000);
  await expect(total).toContainText("+$10.00");
  await expect(page.locator(".holding-row .gain")).toContainText("+$10.00");
  await expect(page.locator(".chart-reading")).toContainText("+$10.00");
  price = 90;
  await page.clock.fastForward(31000);
  await expect(total).toContainText("-$10.00");
  await expect(page.locator(".holding-row .loss")).toContainText("-$10.00");
  await expect(page.locator(".chart-reading")).toContainText("-$10.00");
});

test("a first-day portfolio draws immediately and new observations update its value without counting refills as profit", async ({
  page,
}) => {
  await createPortfolioAccount(page);
  const start = new Date(Date.now() - 3600000).toISOString();
  let current = 1000,
    capital = 1000;
  await page.route("**/api/state", async (route) => {
    const response = await route.fetch(),
      state = await response.json();
    state.portfolio = {
      id: "chart-fixture",
      startedAt: start,
      initialCash: "1000000000",
      datasetId: "chart-prices",
    };
    state.portfolioHistory = [{ date: start.slice(0, 10), value: current }];
    state.portfolioObservations = [
      { date: start, value: 1000, capital: 1000 },
      {
        date: new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z"),
        value: current,
        capital,
      },
    ];
    await route.fulfill({ response, json: state });
  });
  await page.goto("/app");
  await expect(
    page.locator(".portfolio-chart-canvas canvas").first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "1D", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".chart-reading")).toContainText("$1,000.00");
  current = 1010;
  await page.reload();
  await expect(page.locator(".chart-reading")).toContainText("+$10.00");
  capital = 1500;
  current = 1510;
  await page.reload();
  await expect(page.locator(".chart-reading")).toContainText("$1,510.00");
  await expect(page.locator(".chart-reading")).toContainText("+$10.00");
  await expect(page.locator(".chart-reading")).not.toContainText("+$510.00");
  await page
    .getByRole("img", {
      name: /Practice portfolio value over the selected period/,
    })
    .focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".chart-reading")).toContainText("$1,000.00");
});

async function walletAuthorization(
  page: Page,
  mode: "own" | "other" | "both",
  grant?: "own" | "other" | "both",
) {
  await page.evaluate(
    ({ mode, grant }) => {
      const wallet = (
        window as unknown as {
          troveWalletTest: {
            authorize: (mode: string) => void;
            setGrant: (mode: string) => void;
          };
        }
      ).troveWalletTest;
      wallet.authorize(mode);
      if (grant) wallet.setGrant(grant);
    },
    { mode, grant },
  );
}

test("parent reconnect resets authorization and funding keeps the parent signer after account switches", async ({
  page,
}) => {
  await createPortfolioAccount(page);
  const wallet = await installBrowserWallet(page);
  await page.goto("/app");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("button", { name: "Reconnect Test Sui Wallet", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              troveWalletTest: { stats: () => { disconnects: number } };
            }
          ).troveWalletTest.stats().disconnects,
      ),
    )
    .toBe(1);
  await page.keyboard.press("Escape");
  await walletAuthorization(page, "other", "own");
  await page.getByRole("link", { name: "Parent", exact: true }).click();
  for (const [amount, mode] of [
    ["75", "other"],
    ["25", "both"],
  ] as const) {
    await walletAuthorization(page, mode);
    await page
      .getByRole("button", { name: "Add practice funds", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "PRACTICE FUNDS" });
    await dialog.getByLabel("Amount ($)", { exact: true }).fill(amount);
    await dialog
      .getByRole("button", { name: "Add funds", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
  }
  expect(wallet.signedAddresses()).toEqual([
    "0x" + "7".repeat(64),
    "0x" + "7".repeat(64),
  ]);
  const state = await (await page.request.get("/api/state")).json();
  expect(state.cash).toBe("1100000000");
  expect(state.funding).toHaveLength(2);
});

test("linking from multiple authorized accounts uses the learner's chosen address", async ({
  page,
}) => {
  await createLearnerAccount(page);
  const wallet = await installBrowserWallet(page, true, false, false, "both");
  await page.goto("/app");
  await page
    .getByRole("button", { name: "Link Test Sui Wallet", exact: true })
    .click();
  const picker = page.getByRole("group", {
    name: "Choose your learner wallet",
  });
  await expect(picker).toBeVisible();
  await picker
    .getByRole("button", { name: "0x" + "8".repeat(64), exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your portfolio is active" }),
  ).toHaveCount(0);
  expect(wallet.linkedAddresses()).toEqual(["0x" + "8".repeat(64)]);
  expect(wallet.signedAddresses()).toEqual(["0x" + "8".repeat(64)]);
});

test("a wallet granting only the learner address cannot prepare a parent funding transaction", async ({
  page,
}) => {
  await createPortfolioAccount(page);
  const wallet = await installBrowserWallet(page, true, true, true, "other");
  await page.goto("/app/parent");
  await page
    .getByRole("button", { name: "Add practice funds", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "PRACTICE FUNDS" });
  await dialog.getByRole("button", { name: "Add funds", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Authorize 0x777777…777777",
  );
  expect(wallet.preparations()).toBe(0);
  expect(wallet.signatures()).toBe(0);
  expect((await (await page.request.get("/api/state")).json()).cash).toBe(
    "1000000000",
  );
});
