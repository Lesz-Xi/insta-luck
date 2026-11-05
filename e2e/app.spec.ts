import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const SAMPLES = resolve(import.meta.dirname, "../web/public/samples");
const post = (shortcode: string) => `https://www.instagram.com/p/${shortcode}/`;

async function open(page: Page): Promise<void> {
  await page.request.get("/__fixture/reset");
  await page.goto("/app");
}

async function find(page: Page, shortcode: string): Promise<void> {
  await page.getByLabel("Instagram link").fill(post(shortcode));
  await page.getByRole("button", { name: "Find images" }).click();
}

async function showResults(page: Page, shortcode = "FIXOK01"): Promise<void> {
  await find(page, shortcode);
  await expect(page.locator("#results")).toBeVisible();
}

const markFrame = (page: Page, number: string) => page.getByLabel(new RegExp(`^Mark frame ${number}\\.`));

test.beforeEach(async ({ page }) => {
  await open(page);
});

test.describe("the empty workspace", () => {
  test("offers one task and no invented history", async ({ page }) => {
    await expect(page.getByLabel("Instagram link")).toBeVisible();
    await expect(page.getByLabel("Instagram link")).toHaveAttribute("placeholder", /instagram\.com/);
    await expect(page.getByRole("button", { name: "Find images" })).toBeEnabled();
    await expect(page.locator("#results")).toBeHidden();
  });

  test("says so plainly when the hosted tool is closed", async ({ page }) => {
    await page.route("**/api/status", (route) => route.fulfill({ json: { open: false } }));
    await page.goto("/app");
    await expect(page.getByText("The hosted collector isn’t open right now.")).toBeVisible();
    await expect(page.getByLabel("Instagram link")).toBeDisabled();
    await expect(page.getByRole("link", { name: "Run it locally from the source" })).toBeVisible();
  });
});

test.describe("links", () => {
  for (const [value, message] of [
    ["", "Paste an Instagram link first."],
    ["not a link", "That doesn’t look like a link."],
    ["https://example.com/p/ABCDE/", "isn’t from instagram.com"],
    ["https://www.instagram.com/stories/someone/1/", "Stories and other Instagram pages aren’t supported."],
    ["https://www.instagram.com/p/!/", "looks incomplete"]
  ] as const) {
    test(`rejects ${JSON.stringify(value)} inline and keeps what was typed`, async ({ page }) => {
      await page.getByLabel("Instagram link").fill(value);
      await page.getByRole("button", { name: "Find images" }).click();
      await expect(page.getByRole("alert")).toContainText(message);
      await expect(page.getByLabel("Instagram link")).toHaveValue(value);
      await expect(page.getByLabel("Instagram link")).toHaveAttribute("aria-invalid", "true");
      await expect(page.getByLabel("Instagram link")).toBeFocused();
    });
  }

  test("clears the error as soon as the link is edited", async ({ page }) => {
    await page.getByLabel("Instagram link").fill("nope");
    await page.getByRole("button", { name: "Find images" }).click();
    await page.getByLabel("Instagram link").fill("nope!");
    await expect(page.locator("#post-error")).toBeHidden();
  });

  for (const link of [
    "http://www.instagram.com/p/FIXOK01/",
    "https://www.instagram.com/someuser/p/FIXOK01/",
    "https://m.instagram.com/p/FIXOK01/",
    "instagr.am/p/FIXOK01/"
  ]) {
    test(`accepts ${link}`, async ({ page }) => {
      await page.getByLabel("Instagram link").fill(link);
      await page.getByRole("button", { name: "Find images" }).click();
      await expect(page.getByRole("link", { name: "instagram.com/p/FIXOK01/" })).toBeVisible();
    });
  }

  test("accepts a link pasted without its scheme", async ({ page }) => {
    await page.getByLabel("Instagram link").fill("  instagram.com/p/FIXOK01/?igsh=abc  ");
    await page.getByRole("button", { name: "Find images" }).click();
    await expect(page.locator("#results")).toBeVisible();
  });
});

test.describe("results", () => {
  test("show source identity, count and groups, with nothing selected", async ({ page }) => {
    await showResults(page);
    await expect(page.locator("#results-title")).toHaveText("8 frames found");
    await expect(page.locator("#results-note")).toContainText("5 likely from this post, 3 found nearby.");
    await expect(page.locator("#results-note")).toContainText("may be incomplete");
    await expect(page.getByRole("link", { name: "instagram.com/p/FIXOK01/" })).toHaveAttribute("href", post("FIXOK01"));
    await expect(page.locator("#sheet-post .frame")).toHaveCount(5);
    await expect(page.locator("#sheet-nearby .frame")).toHaveCount(3);
    await expect(page.locator(".frame-check:checked")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Download selected" })).toBeDisabled();
  });

  test("give a reason beside every frame and never a grade", async ({ page }) => {
    await showResults(page);
    await expect(page.locator("#sheet-post .frame-reason").first()).toHaveText("First dated photo");
    await expect(page.locator("#sheet-post .frame-reason").nth(1)).toHaveText("Same date as frame 01");
    await expect(page.locator("#sheet-nearby .frame-reason").first()).toHaveText("Different date: May 20, 2024");
    await expect(page.locator("#sheet-nearby .frame-reason").nth(1)).toHaveText("Listed under More posts");
    await expect(page.locator("#results")).not.toContainText(/confidence|high|medium|\d+%/i);
  });

  test("keep previews uncropped in a uniform cell", async ({ page }) => {
    await showResults(page);
    const image = page.locator("#sheet-post img").first();
    await expect(image).toHaveCSS("object-fit", "contain");
    await expect(page.locator("#sheet-post .frame-plate").first()).toHaveAttribute("data-preview", "ready");
  });

  test("expose no CDN URL or signature to the page", async ({ page }) => {
    const bodies: string[] = [];
    page.on("response", async (response) => {
      if (response.url().includes("/api/resolve")) bodies.push(await response.text());
    });
    await showResults(page);
    const html = await page.content();
    expect(html).not.toContain("cdninstagram");
    expect(html).not.toContain("_nc_sig");
    await expect.poll(() => bodies.length).toBeGreaterThan(0);
    expect(bodies.join("")).not.toContain("cdninstagram");
  });

  test("render third-party text as text", async ({ page }) => {
    await showResults(page, "FIXHTML1");
    const altText = await page.locator("#sheet-post img").first().getAttribute("alt");
    expect(altText).toContain("<img src=x");
    expect(await page.evaluate(() => "__xss" in window)).toBe(false);
    await expect(page.locator("#results img[src='x']")).toHaveCount(0);
  });

  test("explain a Reel link", async ({ page }) => {
    await page.getByLabel("Instagram link").fill("https://www.instagram.com/reel/FIXOK01/");
    await page.getByRole("button", { name: "Find images" }).click();
    await expect(page.locator("#results-note")).toContainText("not the video");
  });
});

test.describe("profile links", () => {
  for (const link of ["https://www.instagram.com/fixprofile/", "instagram.com/fixprofile", "https://m.instagram.com/fixprofile/?hl=en"]) {
    test(`shows recent posts for ${link}, and never calls it the whole account`, async ({ page }) => {
      await page.getByLabel("Instagram link").fill(link);
      await page.getByRole("button", { name: "Find images" }).click();
      await expect(page.locator("#results-title")).toHaveText("4 frames found");
      await expect(page.locator("#results-note")).toContainText("3 recent posts from this profile.");
      await expect(page.locator("#results-note")).toContainText("isn’t the whole account");
      await expect(page.locator("#group-post-title")).toHaveText("Recent posts on this profile");
      await expect(page.locator("#sheet-post .frame-reason").first()).toHaveText("Recent post on this profile");
      await expect(page.locator("#sheet-nearby .frame-reason").first()).toHaveText("Profile picture");
      await expect(page.locator(".frame-check:checked")).toHaveCount(0);
    });
  }

  test("downloads a frame under the account's name", async ({ page }) => {
    await page.getByLabel("Instagram link").fill("https://www.instagram.com/fixprofile/");
    await page.getByRole("button", { name: "Find images" }).click();
    await expect(page.locator("#results")).toBeVisible();
    await markFrame(page, "01").check({ force: true });
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download selected" }).click();
    expect((await pending).suggestedFilename()).toBe("insta-luck-fixprofile-01.webp");
  });

  test("a profile with nothing public explains itself", async ({ page }) => {
    await page.getByLabel("Instagram link").fill("https://www.instagram.com/fixbare/");
    await page.getByRole("button", { name: "Find images" }).click();
    await expect(page.locator("#results-title")).toHaveText("Only the profile picture came back");
    await expect(page.locator("#results-note")).toContainText("private");
  });

  test("a login wall is named, and shows no frames", async ({ page }) => {
    await find(page, "FIXWALL1");
    await expect(page.locator("#notice")).toContainText("Instagram asked for a login");
    await expect(page.locator("#results")).toBeHidden();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  test("a post's sheet shows no profile pictures, the account's or anyone else's", async ({ page }) => {
    await showResults(page, "FIXLIVE1");
    await expect(page.locator("#results-title")).toHaveText("2 frames found");
    await expect(page.locator("#results")).not.toContainText("Profile picture");
    await expect(page.locator("#results")).not.toContainText("commenter");
    expect(await page.locator("#results img").evaluateAll((images) => images.map((image) => image.getAttribute("alt")))).not.toContainEqual(
      expect.stringContaining("profile picture")
    );
  });
});

test.describe("failure states", () => {
  test("no results doesn't claim the post has no images", async ({ page }) => {
    await find(page, "FIXEMPTY");
    await expect(page.locator("#notice")).toContainText("doesn’t mean there are none");
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(page.getByLabel("Instagram link")).toHaveValue(post("FIXEMPTY"));
  });

  test("an ambiguous sheet says it couldn't match anything", async ({ page }) => {
    await showResults(page, "FIXNEARBY");
    await expect(page.locator("#results-title")).toHaveText("Nothing here is clearly from this post");
    await expect(page.locator("#group-post")).toBeHidden();
    await expect(page.locator("#sheet-nearby .frame")).toHaveCount(2);
  });

  test("a reader failure offers a retry", async ({ page }) => {
    await find(page, "FIXDOWN1");
    await expect(page.locator("#notice")).toContainText("couldn’t read this link");
    await page.getByLabel("Instagram link").fill(post("FIXOK01"));
    await page.getByRole("button", { name: "Find images" }).click();
    await expect(page.locator("#results")).toBeVisible();
  });

  test("a limited request gives retry guidance", async ({ page }) => {
    await find(page, "FIXLIMIT");
    await expect(page.locator("#notice")).toContainText("Try again in a minute");
  });

  test("a failed preview keeps the frame and recovers", async ({ page }) => {
    await showResults(page, "FIXONCE1");
    const second = page.locator("#sheet-post .frame").nth(1);
    await expect(second.locator(".frame-plate")).toHaveAttribute("data-preview", "failed");
    await expect(second).toContainText("didn’t load");
    await expect(second.locator(".frame-reason")).toHaveText("Same date as frame 01");
    await second.getByRole("button", { name: "Reload preview" }).click();
    await expect(second.locator(".frame-plate")).toHaveAttribute("data-preview", "ready");
    await expect(second).not.toContainText("didn’t load");
  });

  test("a platform error with no JSON body still gets a message", async ({ page }) => {
    await page.route("**/api/resolve", (route) => route.fulfill({ status: 429, body: "Too Many Requests" }));
    await find(page, "FIXOK01");
    await expect(page.locator("#notice")).toContainText("Too many requests");
  });

  test("a dropped connection says so", async ({ page }) => {
    await page.route("**/api/resolve", (route) => route.abort());
    await find(page, "FIXOK01");
    await expect(page.locator("#notice")).toContainText("couldn’t reach the server");
  });
});

test.describe("resolving", () => {
  test("is announced, shows real elapsed time and can be cancelled", async ({ page }) => {
    await find(page, "FIXSLOW1");
    await expect(page.getByRole("status").first()).toHaveText("Reading the public page…");
    await expect(page.locator("#find-form")).toHaveAttribute("aria-busy", "true");
    await expect(page.locator("#elapsed")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.locator("#results")).toBeHidden();
    await expect(page.locator("#find-form")).toHaveAttribute("aria-busy", "false");
    await page.waitForTimeout(1700);
    await expect(page.locator("#results")).toBeHidden();
    await expect(page.getByLabel("Instagram link")).toHaveValue(post("FIXSLOW1"));
  });

  test("lets a new link replace a slow one without the old answer winning", async ({ page }) => {
    await find(page, "FIXSLOW1");
    await page.getByLabel("Instagram link").fill(post("FIXOK01"));
    await page.getByLabel("Instagram link").press("Enter");
    await expect(page.locator("#results-title")).toHaveText("8 frames found");
    await page.waitForTimeout(1700);
    await expect(page.locator("#results-title")).toHaveText("8 frames found");
    await expect(page.getByRole("link", { name: "instagram.com/p/FIXOK01/" })).toBeVisible();
  });

  test("ignores a duplicate submission", async ({ page }) => {
    let requests = 0;
    page.on("request", (request) => {
      if (request.url().endsWith("/api/resolve")) requests += 1;
    });
    await find(page, "FIXSLOW1");
    await page.getByLabel("Instagram link").press("Enter");
    await page.getByLabel("Instagram link").press("Enter");
    await expect(page.locator("#results")).toBeVisible();
    expect(requests).toBe(1);
  });
});

test.describe("selection", () => {
  test("is visible without relying on colour", async ({ page }) => {
    await showResults(page);
    await markFrame(page, "02").check({ force: true });
    const frame = page.locator("#sheet-post .frame").nth(1);
    await expect(frame.locator(".frame-box svg")).toHaveCSS("opacity", "1");
    await expect(page.locator("#tray-count")).toHaveText("1 selected");
    await expect(page.getByRole("button", { name: "Download selected" })).toBeEnabled();
  });

  test("works from the keyboard alone", async ({ page, isMobile, browserName }) => {
    test.skip(isMobile, "Phones have no Tab key.");
    await showResults(page);
    await markFrame(page, "01").focus();
    await page.keyboard.press("Space");
    await expect(page.locator("#tray-count")).toHaveText("1 selected");
    await expect(page.locator("#sheet-post .frame-plate").first()).toHaveCSS("outline-style", "solid");
    // Safari's Tab skips buttons by default; Option-Tab reaches everything.
    await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
    await expect(page.getByRole("button", { name: "Inspect frame 01 at full size" })).toBeFocused();
  });

  test("clears", async ({ page }) => {
    await showResults(page);
    await markFrame(page, "01").check({ force: true });
    await page.getByRole("button", { name: "Clear" }).click();
    await expect(page.locator("#tray-count")).toHaveText("0 selected");
  });

  test("is not lost to a new source: a new link starts clean", async ({ page }) => {
    await showResults(page);
    await markFrame(page, "01").check({ force: true });
    await showResults(page, "FIXONCE1");
    await expect(page.locator(".frame-check:checked")).toHaveCount(0);
  });
});

test.describe("inspection", () => {
  test("opens at full size, navigates, marks, and restores focus on Escape", async ({ page, isMobile }) => {
    test.skip(isMobile, "Keyboard path; touch is covered below.");
    await showResults(page);
    const opener = page.getByRole("button", { name: "Inspect frame 02 at full size" });
    await opener.focus();
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(page.locator("#loupe-title")).toHaveText("Frame 02");
    await expect(page.locator("#loupe-reason")).toHaveText("Same date as frame 01");
    await expect(page.locator("#loupe-image")).toHaveCSS("object-fit", "contain");

    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#loupe-title")).toHaveText("Frame 03");
    await page.keyboard.press("ArrowLeft");
    await page.getByLabel("Mark this frame").check();
    await expect(page.locator("#tray-count")).toHaveText("1 selected");

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
    await expect(markFrame(page, "02")).toBeChecked();
  });

  test("closes from its own button on touch", async ({ page }) => {
    await showResults(page);
    await page.getByRole("button", { name: "Inspect frame 01 at full size" }).click();
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  });
});

test.describe("downloads", () => {
  test("delivers the verified bytes through the browser with the server's filename", async ({ page }) => {
    await showResults(page);
    await markFrame(page, "02").check({ force: true });
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download selected" }).click();
    const download = await pending;

    expect(download.suggestedFilename()).toBe("insta-luck-FIXOK01-02.webp");
    const path = await download.path();
    const expected = readFileSync(resolve(SAMPLES, "frame-02-720.webp"));
    expect(readFileSync(path).equals(expected)).toBe(true);

    await expect(page.locator("#sheet-post .frame").nth(1).locator(".frame-state")).toHaveText("Download started");
    await expect(page.locator("#tray-status")).toHaveText("Download started. Check your browser’s downloads.");
    await expect(page.locator("#results")).not.toContainText(/saved/i);
    await expect(markFrame(page, "02")).toBeChecked();
  });

  test("sends a selection as individual files, in sheet order", async ({ page }) => {
    await showResults(page);
    await markFrame(page, "03").check({ force: true });
    await markFrame(page, "01").check({ force: true });
    await expect(page.locator("#tray-status")).toContainText("may ask to allow several");

    const names: string[] = [];
    page.on("download", (download) => names.push(download.suggestedFilename()));
    await page.getByRole("button", { name: "Download selected" }).click();
    await expect.poll(() => names.length).toBe(2);
    expect(names).toEqual(["insta-luck-FIXOK01-01.webp", "insta-luck-FIXOK01-03.webp"]);
    await expect(page.locator("#tray-status")).toContainText("2 downloads started.");
  });

  test("keeps successes and retries only what failed", async ({ page }) => {
    await showResults(page, "FIXPART1");
    await expect(page.locator("#sheet-post .frame-plate").nth(2)).toHaveAttribute("data-preview", "ready");
    await markFrame(page, "03").check({ force: true });

    await page.getByRole("button", { name: "Download selected" }).click();
    await expect(page.locator("#tray-status")).toHaveText("1 download failed.");
    await expect(page.locator("#sheet-post .frame").nth(2).locator(".frame-state")).toContainText("couldn’t be fetched");
    await expect(markFrame(page, "03")).toBeChecked();

    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Retry failed" }).click();
    expect((await pending).suggestedFilename()).toBe("insta-luck-FIXPART1-03.webp");
    await expect(page.locator("#sheet-post .frame").nth(2).locator(".frame-state")).toHaveText("Download started");
    await expect(page.getByRole("button", { name: "Retry failed" })).toBeHidden();
  });

  test("an expired selection explains itself and carries its marks forward", async ({ page }) => {
    await showResults(page);
    await markFrame(page, "02").check({ force: true });
    await page.request.get(`/__fixture/advance?ms=${16 * 60 * 1000}`);

    await page.getByRole("button", { name: "Download selected" }).click();
    await expect(page.locator("#notice")).toContainText("This selection has expired.");
    await expect(page.getByRole("button", { name: "Download selected" })).toBeDisabled();

    await page.getByRole("button", { name: "Find images again" }).click();
    await expect(page.locator("#notice")).toBeHidden();
    await expect(markFrame(page, "02")).toBeChecked();
    await expect(page.getByRole("button", { name: "Download selected" })).toBeEnabled();
  });
});

test.describe("recovery", () => {
  test("a visitor whose clock runs fast isn't told a live selection expired", async ({ page }) => {
    await page.clock.install({ time: new Date(Date.now() + 20 * 60 * 1000) });
    await page.goto("/app");
    await showResults(page);
    await markFrame(page, "02").check({ force: true });
    await page.clock.runFor(1000);
    await expect(page.locator("#notice")).toBeHidden();
    await expect(page.getByRole("button", { name: "Download selected" })).toBeEnabled();
  });

  test("a sheet expires after its lifetime, whatever the clock says", async ({ page }) => {
    await page.clock.install({ time: new Date(Date.now() + 20 * 60 * 1000) });
    await page.goto("/app");
    await showResults(page);
    await page.clock.runFor(15 * 60 * 1000 + 1000);
    await expect(page.locator("#notice")).toContainText("This selection has expired.");
  });

  test("a late failure from an earlier sheet doesn't touch the new one", async ({ page }) => {
    const held: (() => Promise<void>)[] = [];
    let holding = true;
    await page.route("**/api/media/**", async (route) => {
      if (holding) held.push(() => route.abort());
      else await route.continue();
    });

    await showResults(page);
    await expect.poll(() => held.length).toBeGreaterThan(0);
    holding = false;

    await page.getByRole("button", { name: "Find images" }).click();
    await expect(page.locator("#sheet-post .frame-plate").first()).toHaveAttribute("data-preview", "ready");
    await Promise.all(held.map((abort) => abort()));
    await page.waitForTimeout(150);

    await expect(page.locator(".frame-plate[data-preview='failed']")).toHaveCount(0);
    await expect(page.locator("#results")).not.toContainText("didn’t load");
  });

  test("marks survive a failed re-find and return on the next try", async ({ page }) => {
    await showResults(page);
    await markFrame(page, "02").check({ force: true });
    await page.request.get(`/__fixture/advance?ms=${16 * 60 * 1000}`);
    await page.getByRole("button", { name: "Download selected" }).click();
    await expect(page.locator("#notice")).toContainText("This selection has expired.");

    await page.route("**/api/resolve", (route) =>
      route.fulfill({
        status: 503,
        json: { error: { code: "reader_limited", message: "The public reader is limiting requests.", retryable: true } }
      })
    );
    await page.getByRole("button", { name: "Find images again" }).click();
    await expect(page.locator("#notice")).toContainText("limiting requests");

    await page.unroute("**/api/resolve");
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(markFrame(page, "02")).toBeChecked();
    await expect(page.locator("#tray-count")).toHaveText("1 selected");
  });

  test("finding the same post again keeps its marks", async ({ page }) => {
    await showResults(page);
    await markFrame(page, "03").check({ force: true });
    await page.getByRole("button", { name: "Find images" }).click();
    await expect(page.locator("#results")).toBeVisible();
    await expect(markFrame(page, "03")).toBeChecked();
  });

  test("Retry leaves alone a frame the visitor has since unmarked", async ({ page }) => {
    await showResults(page, "FIXPART1");
    await expect(page.locator("#sheet-post .frame-plate").nth(2)).toHaveAttribute("data-preview", "ready");
    await markFrame(page, "03").check({ force: true });
    await page.getByRole("button", { name: "Download selected" }).click();
    await expect(page.locator("#tray-status")).toHaveText("1 download failed.");
    await markFrame(page, "03").uncheck({ force: true });
    await expect(page.getByRole("button", { name: "Retry failed" })).toBeHidden();
  });

  test("two tabs opened together share a session", async ({ page, context }) => {
    const second = await context.newPage();
    await second.goto("/app");
    await showResults(page);
    await showResults(second);
    await expect(page.locator("#sheet-post .frame-plate").first()).toHaveAttribute("data-preview", "ready");

    const pending = page.waitForEvent("download");
    await markFrame(page, "01").check({ force: true });
    await page.getByRole("button", { name: "Download selected" }).click();
    expect((await pending).suggestedFilename()).toBe("insta-luck-FIXOK01-01.webp");
    await second.close();
  });
});

test.describe("touch and targets", () => {
  test("keeps primary controls at 44px or more", async ({ page }) => {
    await showResults(page);
    await markFrame(page, "01").check({ force: true });
    for (const locator of [
      page.getByRole("button", { name: "Find images" }),
      page.getByLabel("Instagram link"),
      page.getByRole("button", { name: "Download selected" }),
      page.getByRole("button", { name: "Clear" }),
      page.getByRole("button", { name: "Inspect frame 01 at full size" }),
      markFrame(page, "01")
    ]) {
      const box = await locator.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });

  test("marks a frame by tapping the photograph", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Touch only.");
    await showResults(page);
    await page.locator("#sheet-post .frame-hit").first().tap();
    await expect(page.locator("#tray-count")).toHaveText("1 selected");
  });

  test("leaves the sheet readable behind the tray", async ({ page }) => {
    await showResults(page);
    const last = page.locator("#sheet-nearby .frame").last();
    await last.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const tray = await page.locator("#tray").boundingBox();
    const caption = await last.locator(".frame-caption").boundingBox();
    expect((caption?.y ?? 0) + (caption?.height ?? 0)).toBeLessThanOrEqual(tray?.y ?? 0);
  });
});

test("the mark appears at once under reduced motion", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ reducedMotion: "reduce", baseURL: baseURL ?? "" });
  const page = await context.newPage();
  await page.goto("/app");
  await showResults(page);
  await markFrame(page, "01").check({ force: true });
  const duration = await page
    .locator("#sheet-post .frame-mark")
    .first()
    .evaluate((element) => getComputedStyle(element).transitionDuration);
  expect(Number.parseFloat(duration)).toBeLessThan(0.05);
  await context.close();
});
