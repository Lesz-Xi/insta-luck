import { expect, test } from "@playwright/test";

test.describe("landing", () => {
  test("loads directly, explains the operation, and leads to the collector", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("A post link.");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("The images you choose.");
    await expect(page.getByRole("link", { name: "Open collector" }).first()).toHaveAttribute("href", "/app");
    await expect(page.getByText("This isn’t a live result.")).toBeVisible();
    await expect(page.getByText("Results can be incomplete")).toBeVisible();

    await page.getByRole("link", { name: "Open collector" }).first().click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByLabel("Instagram link")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("survives a refresh on both routes", async ({ page }) => {
    for (const path of ["/", "/app"]) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      const reloaded = await page.reload();
      expect(reloaded?.status()).toBe(200);
    }
  });

  test("sends a clean URL for the workspace", async ({ page }) => {
    await page.goto("/app.html");
    await expect(page).toHaveURL(/\/app$/);
  });

  test("serves missing pages and API routes as failures, not as the app", async ({ request }) => {
    expect((await request.get("/nowhere")).status()).toBe(404);
    expect((await request.get("/api/nowhere")).status()).toBe(404);
    expect((await request.get("/api/resolve")).status()).toBe(405);
    expect((await request.post("/api/status")).status()).toBe(405);
  });

  test("the sample responds to the same mark as the collector", async ({ page }) => {
    await page.goto("/");
    const tally = page.locator("[data-tally]");
    await expect(tally).toHaveText("2 frames marked");
    await page.getByLabel("Mark sample frame 01").check({ force: true });
    await expect(tally).toHaveText("3 frames marked");
    await page.getByLabel("Mark sample frame 02").uncheck({ force: true });
    await page.getByLabel("Mark sample frame 04").uncheck({ force: true });
    await expect(tally).toHaveText("1 frame marked");
  });

  test("draws the marks once the sheet is in view", async ({ page }) => {
    await page.goto("/");
    await page.locator(".strip").first().scrollIntoViewIfNeeded();
    await expect(page.locator("[data-sheet]")).not.toHaveClass(/is-undrawn/);
    const offset = page.locator(".frame[data-draw='1'] .frame-mark");
    await expect(offset).toHaveCSS("stroke-dashoffset", /^0(px)?$/);
  });

  test("rests complete without JavaScript", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL: baseURL ?? "" });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("[data-tally]")).toHaveText("2 frames marked");
    await expect(page.locator(".frame[data-draw='0'] .frame-mark")).toHaveCSS("stroke-dashoffset", /^0(px)?$/);
    await expect(page.locator(".frame img").first()).toBeVisible();
    await context.close();
  });

  test("shows the same end state at once under reduced motion", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ reducedMotion: "reduce", baseURL: baseURL ?? "" });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.locator("[data-sheet]")).not.toHaveClass(/is-undrawn/);
    await expect(page.locator(".frame[data-draw='1'] .frame-mark")).toHaveCSS("stroke-dashoffset", /^0(px)?$/);
    await context.close();
  });

  test("has no horizontal overflow", async ({ page }) => {
    for (const path of ["/", "/app"]) {
      await page.goto(path);
      const { scroll, client } = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth
      }));
      expect(scroll).toBeLessThanOrEqual(client);
    }
  });

  test("declares the security headers from vercel.json", async ({ request }) => {
    const response = await request.get("/");
    expect(response.headers()["content-security-policy"]).toContain("script-src 'self'");
    expect(response.headers()["referrer-policy"]).toBe("no-referrer");
  });
});
