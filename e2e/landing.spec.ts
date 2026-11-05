import { expect, test } from "@playwright/test";

test.describe("landing", () => {
  test("loads directly, explains the operation, and leads to the sheet", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Insta Luck.");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("download only the ones you mark");
    await expect(page.getByRole("link", { name: "Open the sheet" }).first()).toHaveAttribute("href", "/app");
    await expect(page.getByText("This isn’t a live result.")).toBeAttached();
    await expect(page.getByText("Results can be incomplete")).toBeAttached();

    await page.getByRole("link", { name: "Open the sheet" }).first().click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByLabel("Instagram link")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("says what the tool won't do", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("not the whole account")).toBeAttached();
    await expect(page.getByText("Not affiliated with Instagram or Meta.")).toBeAttached();
    await expect(page.getByText("Jean-Eugène-Auguste Atget")).toBeAttached();
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

  test("the sample responds to the same mark as the sheet", async ({ page }) => {
    await page.goto("/");
    await page.locator("[data-sheet]").scrollIntoViewIfNeeded();
    const tally = page.locator("[data-tally]");
    await expect(tally).toHaveText("1 frame marked");
    // Not forced: the plate has to have opened far enough for a real click to reach it.
    await page.getByLabel("Mark sample frame 01").check();
    await expect(tally).toHaveText("2 frames marked");
    await page.getByLabel("Mark sample frame 02").uncheck();
    await page.getByLabel("Mark sample frame 01").uncheck();
    await expect(tally).toHaveText("0 frames marked");
  });

  test("the sample's mark looks like the sheet's mark", async ({ page }) => {
    await page.goto("/");
    await page.locator("[data-sheet]").scrollIntoViewIfNeeded();
    const marked = page.locator("[data-sheet] .frame").nth(1);
    await expect(marked.locator(".keep-on")).toBeVisible();
    await expect(marked.locator(".frame-bar")).toHaveCSS("transform", "none");
  });

  test("rows arrive as they come into view", async ({ page }) => {
    await page.goto("/");
    const last = page.locator(".row.arrive").last();
    await expect(last).not.toHaveClass(/is-in/);
    await last.scrollIntoViewIfNeeded();
    await expect(last).toHaveClass(/is-in/);
    await expect(last.locator(".plate")).toHaveCSS("clip-path", /inset\(0(px)?\)|inset\(0px 0px 0px 0px\)/);
  });

  test("scrolls at Feather on the wheel, inside the page's security policy", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto("/");
    await expect(page.locator("html")).toHaveClass(/lenis/);
    expect(errors).toEqual([]);
  });

  test("scrolls natively if the scroll library is missing", async ({ page }) => {
    await page.route("**/vendor/lenis-*.js", (route) => route.abort());
    await page.goto("/");
    await expect(page.locator("html")).toHaveClass(/is-ready/);
    await expect(page.locator("html")).not.toHaveClass(/lenis/);
    await page.evaluate(() => window.scrollTo(0, 800));
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  });

  test("rests complete without JavaScript", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL: baseURL ?? "" });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("[data-tally]")).toHaveText("1 frame marked");
    await expect(page.locator(".row .plate").first()).toBeVisible();
    await expect(page.locator(".row-t").last()).toHaveCSS("opacity", "1");
    await expect(page.locator(".rule-row").last()).toHaveCSS("opacity", "1");
    await context.close();
  });

  test("doesn't leave the page hidden if its script never arrives", async ({ page }) => {
    await page.route("**/assets/index-*.js", (route) => route.abort());
    await page.goto("/");
    await expect(page.locator("html")).not.toHaveClass(/js-motion/, { timeout: 4000 });
    await expect(page.locator(".row-t").last()).toHaveCSS("opacity", "1");
  });

  test("shows the same end state at once under reduced motion", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ reducedMotion: "reduce", baseURL: baseURL ?? "" });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.locator("html")).not.toHaveClass(/js-motion/);
    await expect(page.locator("html")).not.toHaveClass(/lenis/);
    await expect(page.locator(".row.arrive").last()).toHaveClass(/is-in/);
    await expect(page.locator(".row-t").last()).toHaveCSS("opacity", "1");
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
