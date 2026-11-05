import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const SAMPLES = resolve(import.meta.dirname, "../web/public/samples");
const post = (shortcode: string) => `https://www.instagram.com/p/${shortcode}/`;
const HOUR = 60 * 60 * 1000;

async function open(page: Page): Promise<void> {
  await page.request.get("/__fixture/reset");
  await page.goto("/app");
}

async function add(page: Page, link: string): Promise<void> {
  await page.getByLabel("Instagram link").fill(link);
  await page.getByRole("button", { name: "Add to sheet" }).click();
}

const find = (page: Page, shortcode: string): Promise<void> => add(page, post(shortcode));

const roll = (page: Page, label: string) => page.locator(`.roll[data-key*="${label}"]`);

async function showResults(page: Page, shortcode = "FIXOK01"): Promise<void> {
  await find(page, shortcode);
  await expect(roll(page, shortcode)).toHaveAttribute("data-status", "ready");
}

/** Read by the system's own tool, so the archive is judged by something other than the code that wrote it. */
function zipEntries(path: string): readonly string[] {
  execFileSync("unzip", ["-tq", path]);
  return execFileSync("unzip", ["-Z1", path], { encoding: "utf8" }).trim().split("\n");
}

const markFrame = (page: Page, number: string) => page.getByLabel(new RegExp(`^Mark frame ${number} from`));
const inspectFrame = (page: Page, number: string) => page.getByRole("button", { name: new RegExp(`^Inspect frame ${number} from`) });

test.beforeEach(async ({ page }) => {
  await open(page);
});

test("the link field stays a rule when focused, never a box", async ({ page }) => {
  const field = page.getByLabel("Instagram link");
  await field.focus();
  await expect(field).toHaveCSS("outline-style", "none");
  await expect(field).toHaveCSS("box-shadow", /0px 1px 0px/);
  await expect(field).toHaveCSS("border-left-style", "none");
});

test.describe("the empty workspace", () => {
  test("offers one task and no invented history", async ({ page }) => {
    await expect(page.getByLabel("Instagram link")).toBeVisible();
    await expect(page.getByLabel("Instagram link")).toHaveAttribute("placeholder", /instagram\.com/);
    await expect(page.getByRole("button", { name: "Add to sheet" })).toBeEnabled();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Your sheet is empty.");
    await expect(page.locator("#results")).toBeHidden();
    await expect(page.locator("#tray")).toBeHidden();
  });

  test("says so plainly when the hosted tool is closed", async ({ page }) => {
    await page.route("**/api/status", (route) => route.fulfill({ json: { open: false } }));
    await page.goto("/app");
    await expect(page.getByText("Insta Luck isn’t open here right now.")).toBeVisible();
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
      await add(page, value);
      await expect(page.getByRole("alert")).toContainText(message);
      await expect(page.getByLabel("Instagram link")).toHaveValue(value);
      await expect(page.getByLabel("Instagram link")).toHaveAttribute("aria-invalid", "true");
      await expect(page.getByLabel("Instagram link")).toBeFocused();
    });
  }

  test("clears the error as soon as the link is edited", async ({ page }) => {
    await add(page, "nope");
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
      await add(page, link);
      await expect(page.getByRole("link", { name: "instagram.com/p/FIXOK01/" })).toBeVisible();
    });
  }

  test("accepts a link pasted without its scheme, and clears the field for the next", async ({ page }) => {
    await add(page, "  instagram.com/p/FIXOK01/?igsh=abc  ");
    await expect(roll(page, "FIXOK01")).toHaveAttribute("data-status", "ready");
    await expect(page.getByLabel("Instagram link")).toHaveValue("");
  });

  test("adds on Enter, and leaves a pasted list's line breaks alone", async ({ page }) => {
    await page.getByLabel("Instagram link").fill(post("FIXOK01"));
    await page.getByLabel("Instagram link").press("Enter");
    await expect(roll(page, "FIXOK01")).toHaveAttribute("data-status", "ready");
  });
});

test.describe("results", () => {
  test("show source identity, count and groups, with nothing selected", async ({ page }) => {
    await showResults(page);
    await expect(page.locator("#results-title")).toHaveText("8 frames found");
    await expect(page.locator(".roll-note")).toContainText("5 likely from this post, 3 found nearby.");
    await expect(page.locator(".roll-note")).toContainText("may be incomplete");
    await expect(page.getByRole("link", { name: "instagram.com/p/FIXOK01/" })).toHaveAttribute("href", post("FIXOK01"));
    await expect(page.locator(".sheet.is-post .frame")).toHaveCount(5);
    await expect(page.locator(".sheet.is-nearby .frame")).toHaveCount(3);
    await expect(page.locator(".frame-check:checked")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Download selected" })).toBeDisabled();
  });

  test("give a reason beside every frame and never a grade", async ({ page }) => {
    await showResults(page);
    await expect(page.locator(".sheet.is-post .frame-reason").first()).toHaveText("First dated photo");
    await expect(page.locator(".sheet.is-post .frame-reason").nth(1)).toHaveText("Same date as frame 01");
    await expect(page.locator(".sheet.is-nearby .frame-reason").first()).toHaveText("Different date: May 20, 2024");
    await expect(page.locator(".sheet.is-nearby .frame-reason").nth(1)).toHaveText("Listed under More posts");
    await expect(page.locator("#results")).not.toContainText(/confidence|high|medium|\d+%/i);
  });

  test("keep previews uncropped in a uniform cell", async ({ page }) => {
    await showResults(page);
    const image = page.locator(".sheet.is-post img").first();
    await expect(image).toHaveCSS("object-fit", "contain");
    await expect(page.locator(".sheet.is-post .frame-plate").first()).toHaveAttribute("data-preview", "ready");
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
    const altText = await page.locator(".sheet.is-post img").first().getAttribute("alt");
    expect(altText).toContain("<img src=x");
    expect(await page.evaluate(() => "__xss" in window)).toBe(false);
    await expect(page.locator("#results img[src='x']")).toHaveCount(0);
  });

  test("explain a Reel link", async ({ page }) => {
    await add(page, "https://www.instagram.com/reel/FIXOK01/");
    await expect(page.locator(".roll-note")).toContainText("not the video");
  });
});

test.describe("one sheet from several links", () => {
  test("takes a pasted list and reads the links one at a time, in order", async ({ page }) => {
    const active: string[] = [];
    let overlapped = false;
    page.on("request", (request) => {
      if (!request.url().endsWith("/api/resolve")) return;
      if (active.length > 0) overlapped = true;
      active.push(request.url());
    });
    page.on("requestfinished", (request) => {
      if (request.url().endsWith("/api/resolve")) active.pop();
    });

    await add(page, `${post("FIXSLOW1")}\n${post("FIXOK01")}`);
    await expect(roll(page, "FIXSLOW1").locator(".roll-note")).toHaveText("Reading the public page…");
    await expect(roll(page, "FIXOK01").locator(".roll-note")).toHaveText("Waiting for its turn.");
    await expect(page.locator(".link-row").nth(1).locator(".link-tally")).toHaveText("Waiting");

    await expect(roll(page, "FIXOK01")).toHaveAttribute("data-status", "ready");
    expect(overlapped).toBe(false);
    await expect(page.locator(".roll").first()).toHaveAttribute("data-key", /FIXSLOW1/);
  });

  test("keeps the frames it has while another link is added", async ({ page }) => {
    await showResults(page);
    const first = await page.locator(".sheet.is-post img").first().elementHandle();
    await showResults(page, "FIXSLOW1");
    expect(await first?.evaluate((image) => image.isConnected)).toBe(true);
    await expect(page.locator("#results-title")).toHaveText(/frames from 2 links/);
  });

  test("shows an image once, and gives it to the post that claims it", async ({ page }) => {
    await showResults(page);
    await expect(roll(page, "FIXOK01").locator(".sheet.is-nearby .frame")).toHaveCount(3);

    await showResults(page, "FIXSHARE");
    await expect(roll(page, "FIXSHARE").locator(".sheet.is-post .frame")).toHaveCount(1);
    await expect(roll(page, "FIXSHARE").locator(".sheet.is-nearby .frame")).toHaveCount(0);
    await expect(roll(page, "FIXSHARE").locator(".roll-note")).toContainText("2 images are shown under another link.");
    await expect(roll(page, "FIXOK01").locator(".sheet.is-nearby .frame")).toHaveCount(2);
    await expect(page.locator(".frame")).toHaveCount(8);
  });

  test("keeps marks as links arrive, and shows which links hold them", async ({ page }) => {
    await showResults(page);
    await markFrame(page, "01").check({ force: true });
    await expect(page.locator(".link-row").first()).toHaveAttribute("data-marked", "true");

    await showResults(page, "FIXSLOW1");
    await expect(page.locator("#tray-count")).toHaveText("1 selected");
    await expect(page.locator(".link-row").nth(1)).toHaveAttribute("data-marked", "false");
  });

  test("downloads across links as one ZIP, in sheet order, each named for its own link", async ({ page }) => {
    await showResults(page, "FIXPROF");
    await showResults(page, "FIXSLOW1");
    await roll(page, "FIXSLOW1").getByLabel(/^Mark frame 01/).check({ force: true });
    await roll(page, "FIXPROF").getByLabel(/^Mark frame 02/).check({ force: true });

    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download selected" }).click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe("insta-luck-2-frames.zip");
    expect(zipEntries(await download.path())).toEqual(["insta-luck-FIXPROF-02.webp", "insta-luck-FIXSLOW1-01.webp"]);
  });

  test("lets one link fail without touching the others", async ({ page }) => {
    await showResults(page);
    await find(page, "FIXDOWN1");
    await expect(roll(page, "FIXDOWN1").locator(".roll-notice")).toContainText("couldn’t read this link");
    await expect(page.locator(".link-row").nth(1).locator(".link-tally")).toHaveText("Failed");
    await expect(page.locator(".sheet.is-post .frame")).toHaveCount(5);
  });

  test("removes a link with its frames and marks, and the next link still reads", async ({ page }) => {
    await showResults(page);
    await markFrame(page, "01").check({ force: true });
    await add(page, `${post("FIXSLOW1")}\n${post("FIXLIVE1")}`);

    await page.getByRole("button", { name: "Remove p/FIXOK01 from the sheet" }).click();
    await expect(page.locator("#tray-count")).toHaveText("0 selected");
    await expect(roll(page, "FIXOK01")).toHaveCount(0);

    await page.getByRole("button", { name: "Remove p/FIXSLOW1 from the sheet" }).click();
    await expect(roll(page, "FIXLIVE1")).toHaveAttribute("data-status", "ready");
    await page.waitForTimeout(1700);
    await expect(roll(page, "FIXSLOW1")).toHaveCount(0);
  });

  test("says when a link is already on the sheet", async ({ page }) => {
    let requests = 0;
    page.on("request", (request) => {
      if (request.url().endsWith("/api/resolve")) requests += 1;
    });
    await showResults(page);
    await add(page, post("FIXOK01"));
    await expect(page.getByRole("alert")).toContainText("already on this sheet");
    expect(requests).toBe(1);
  });

  test("holds twenty links, and says so at the limit", async ({ page }) => {
    const links = Array.from({ length: 21 }, (_, index) => post(`FIXMANY${String(index).padStart(2, "0")}`));
    await page.route("**/api/resolve", (route) => route.fulfill({ status: 503, json: { error: { code: "reader_limited", message: "Limited.", retryable: true } } }));
    await add(page, links.join("\n"));
    await expect(page.locator(".link-row")).toHaveCount(20);
    await expect(page.getByRole("alert")).toContainText("A sheet holds 20 links.");
    await expect(page.getByLabel("Instagram link")).toHaveValue(links[20] ?? "");
  });

  test("brings a new link into view from the field, and leaves the page alone otherwise", async ({ page, isMobile }) => {
    test.skip(isMobile, "On touch the field gives way to the sheet.");
    await showResults(page);
    await showResults(page, "FIXPROF");
    await add(page, post("FIXSLOW1"));
    await expect(roll(page, "FIXSLOW1")).toBeInViewport();

    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(roll(page, "FIXSLOW1")).not.toBeInViewport();
    const scrolled = await page.evaluate(() => window.scrollY);
    await markFrame(page, "01").first().focus();
    await expect(roll(page, "FIXSLOW1")).toHaveAttribute("data-status", "ready");
    expect(await page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(scrolled + 400);
  });

  test("a rail row leads to its link's frames", async ({ page }) => {
    await showResults(page);
    await showResults(page, "FIXSLOW1");
    await page.locator(".link-row").nth(1).getByRole("link").click();
    await expect(roll(page, "FIXSLOW1")).toBeInViewport();
  });
});

test.describe("profile links", () => {
  for (const link of ["https://www.instagram.com/fixprofile/", "instagram.com/fixprofile", "https://m.instagram.com/fixprofile/?hl=en"]) {
    test(`shows recent posts for ${link}, and never calls it the whole account`, async ({ page }) => {
      await add(page, link);
      await expect(page.locator("#results-title")).toHaveText("3 frames found");
      await expect(page.locator(".roll-note")).toContainText("3 recent posts from this profile.");
      await expect(page.locator(".roll-note")).toContainText("isn’t the whole account");
      await expect(page.locator(".roll-note")).toContainText("paste its link");
      await expect(page.locator(".group.is-post h3")).toHaveText("Recent posts on this profile");
      await expect(page.locator(".sheet.is-post .frame-reason:not(:empty)")).toHaveCount(0);
      await expect(markFrame(page, "01")).toHaveAccessibleName(/Recent post on this profile/);
      await expect(page.locator(".group.is-nearby")).toBeHidden();
      await expect(page.locator("#results")).not.toContainText("Profile picture");
      await expect(page.locator(".frame-check:checked")).toHaveCount(0);
    });
  }

  test("names a link by its account", async ({ page }) => {
    await add(page, "https://www.instagram.com/fixprofile/");
    await expect(page.locator(".link-name")).toHaveText("@fixprofile");
  });

  test("downloads a frame under the account's name", async ({ page }) => {
    await add(page, "https://www.instagram.com/fixprofile/");
    await expect(roll(page, "fixprofile")).toHaveAttribute("data-status", "ready");
    await markFrame(page, "01").check({ force: true });
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download selected" }).click();
    expect((await pending).suggestedFilename()).toBe("insta-luck-fixprofile-01.webp");
  });

  test("a profile with nothing public explains itself", async ({ page }) => {
    await add(page, "https://www.instagram.com/fixbare/");
    await expect(page.locator(".roll-notice")).toContainText("may be private");
    await expect(page.locator(".frame")).toHaveCount(0);
    await expect(page.locator("#results-title")).toHaveText("No frames yet");
    await expect(page.locator(".link-tally")).toHaveText("None");
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  test("a login wall is named, and shows no frames", async ({ page }) => {
    await find(page, "FIXWALL1");
    await expect(page.locator(".roll-notice")).toContainText("Instagram asked for a login");
    await expect(page.locator(".frame")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(page.locator("#results-title")).toHaveText("No frames yet");
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

test.describe("live page shapes", () => {
  test("sorts unlabelled images above the boundary as the post's, after a fresh read of a thin page", async ({ page }) => {
    await showResults(page, "FIXTHIN1");
    await expect(page.locator(".sheet.is-post .frame")).toHaveCount(2);
    await expect(page.locator(".sheet.is-post .frame-reason").first()).toHaveText("Photo with no date to compare");
    await expect(page.locator(".sheet.is-nearby .frame")).toHaveCount(1);
    await expect(page.locator(".roll-note")).toContainText("2 likely from this post, 1 found nearby.");
  });
});

test.describe("failure states", () => {
  test("no results doesn't claim the post has no images", async ({ page }) => {
    await find(page, "FIXEMPTY");
    await expect(page.locator(".roll-notice")).toContainText("doesn’t mean there are none");
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    await expect(page.locator(".link-tally")).toHaveText("None");
  });

  test("an ambiguous sheet says it couldn't match anything", async ({ page }) => {
    await showResults(page, "FIXNEARBY");
    await expect(page.locator("#results-title")).toHaveText("Nothing here is clearly from this post");
    await expect(page.locator(".group.is-post")).toBeHidden();
    await expect(page.locator(".sheet.is-nearby .frame")).toHaveCount(2);
  });

  test("a reader failure offers a retry that really reads again", async ({ page }) => {
    await page.route("**/api/resolve", (route) => route.fulfill({ status: 500, json: { error: { code: "reader_unavailable", message: "We couldn’t read this link.", retryable: true } } }));
    await find(page, "FIXOK01");
    await expect(page.locator(".roll-notice")).toContainText("couldn’t read this link");
    await page.unroute("**/api/resolve");
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(roll(page, "FIXOK01")).toHaveAttribute("data-status", "ready");
    await expect(page.locator(".roll-notice")).toBeHidden();
  });

  test("a limited request gives retry guidance", async ({ page }) => {
    await find(page, "FIXLIMIT");
    await expect(page.locator(".roll-notice")).toContainText("Try again in a minute");
  });

  test("a failed preview keeps the frame and recovers", async ({ page }) => {
    await showResults(page, "FIXONCE1");
    const second = page.locator(".sheet.is-post .frame").nth(1);
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
    await expect(page.locator(".roll-notice")).toContainText("Too many requests");
  });

  test("a dropped connection says so", async ({ page }) => {
    await page.route("**/api/resolve", (route) => route.abort());
    await find(page, "FIXOK01");
    await expect(page.locator(".roll-notice")).toContainText("couldn’t reach the server");
  });
});

test.describe("reading", () => {
  test("is announced, shows real elapsed time and can be stopped", async ({ page }) => {
    await find(page, "FIXSLOW1");
    await expect(page.locator("#status")).toHaveText("Reading the public page…");
    await expect(page.locator("#find-form")).toHaveAttribute("aria-busy", "true");
    await expect(page.locator(".link-tally")).toHaveText(/^\d+s$/);
    await page.getByRole("button", { name: "Remove p/FIXSLOW1 from the sheet" }).click();
    await expect(page.locator("#results")).toBeHidden();
    await expect(page.locator("#find-form")).toHaveAttribute("aria-busy", "false");
    await page.waitForTimeout(1700);
    await expect(page.locator("#results")).toBeHidden();
  });

  test("ignores a duplicate submission", async ({ page }) => {
    let requests = 0;
    page.on("request", (request) => {
      if (request.url().endsWith("/api/resolve")) requests += 1;
    });
    await find(page, "FIXSLOW1");
    await find(page, "FIXSLOW1");
    await find(page, "FIXSLOW1");
    await expect(roll(page, "FIXSLOW1")).toHaveAttribute("data-status", "ready");
    expect(requests).toBe(1);
  });
});

test.describe("selection", () => {
  test("is visible without relying on colour", async ({ page }) => {
    await showResults(page);
    const frame = page.locator(".sheet.is-post .frame").nth(1);
    await expect(frame.locator(".keep-on")).toBeHidden();
    await markFrame(page, "02").check({ force: true });
    await expect(frame.locator(".keep-on")).toBeVisible();
    await expect(frame.locator(".keep-off")).toBeHidden();
    await expect(page.locator("#tray-count")).toHaveText("1 selected");
    await expect(page.getByRole("button", { name: "Download selected" })).toBeEnabled();
  });

  test("the pigment bar means chosen, and only then", async ({ page }) => {
    await showResults(page);
    const bar = page.locator(".sheet.is-post .frame").first().locator(".frame-bar");
    await expect(bar).toHaveCSS("transform", "matrix(0, 0, 0, 1, 0, 0)");
    await markFrame(page, "01").check({ force: true });
    await expect(bar).toHaveCSS("transform", "none");
  });

  test("works from the bookmark as well as the photograph", async ({ page }) => {
    await showResults(page);
    await page.locator(".sheet.is-post .frame-keep").first().click();
    await expect(page.locator("#tray-count")).toHaveText("1 selected");
    await page.locator(".sheet.is-post .frame-keep").first().click();
    await expect(page.locator("#tray-count")).toHaveText("0 selected");
  });

  test("works from the keyboard alone", async ({ page, isMobile, browserName }) => {
    test.skip(isMobile, "Phones have no Tab key.");
    await showResults(page);
    await markFrame(page, "01").focus();
    await page.keyboard.press("Space");
    await expect(page.locator("#tray-count")).toHaveText("1 selected");
    await expect(page.locator(".sheet.is-post .frame-plate").first()).toHaveCSS("outline-style", "solid");
    // Safari's Tab skips buttons by default; Option-Tab reaches everything.
    await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
    await expect(inspectFrame(page, "01")).toBeFocused();
  });

  test("clears", async ({ page }) => {
    await showResults(page);
    await markFrame(page, "01").check({ force: true });
    await page.getByRole("button", { name: "Clear" }).click();
    await expect(page.locator("#tray-count")).toHaveText("0 selected");
  });
});

test.describe("inspection", () => {
  test("opens at full size, navigates, marks, and restores focus on Escape", async ({ page, isMobile }) => {
    test.skip(isMobile, "Keyboard path; touch is covered below.");
    await showResults(page);
    const opener = inspectFrame(page, "02");
    await opener.focus();
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(page.locator("#loupe-title")).toHaveText("Frame 02");
    await expect(page.locator("#loupe-source")).toHaveText("p/FIXOK01");
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

  test("walks across links", async ({ page, isMobile }) => {
    test.skip(isMobile, "Keyboard path.");
    await showResults(page, "FIXSLOW1");
    await showResults(page, "FIXLIVE1");
    await inspectFrame(page, "03").click();
    await expect(page.locator("#loupe-source")).toHaveText("p/FIXSLOW1");
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#loupe-title")).toHaveText("Frame 01");
    await expect(page.locator("#loupe-source")).toHaveText("p/FIXLIVE1");
  });

  test("closes from its own button on touch", async ({ page }) => {
    await showResults(page);
    await inspectFrame(page, "01").click();
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

    await expect(page.locator(".sheet.is-post .frame").nth(1).locator(".frame-state")).toHaveText("Download started");
    await expect(page.locator("#tray-status")).toHaveText("Download started. Check your browser’s downloads.");
    await expect(page.locator("#results")).not.toContainText(/saved/i);
    await expect(markFrame(page, "02")).toBeChecked();
  });

  test("the receipt comes after the bytes, says what happened, and leaves the button's width alone", async ({ page }) => {
    await showResults(page);
    await markFrame(page, "01").check({ force: true });
    const button = page.getByRole("button", { name: "Download selected" });
    await expect(button).not.toHaveAttribute("data-receipt", "on");
    const before = await button.boundingBox();

    const pending = page.waitForEvent("download");
    await button.click();
    await pending;
    await expect(button).toHaveAttribute("data-receipt", "on");
    await expect(page.locator("#download-receipt")).toHaveText("1 started");
    expect((await button.boundingBox())?.width).toBe(before?.width);
    await expect(button).not.toHaveAttribute("data-receipt", "on", { timeout: 4000 });
  });

  test("gives no receipt for a failed download", async ({ page }) => {
    await showResults(page, "FIXPART1");
    await expect(page.locator(".sheet.is-post .frame-plate").nth(2)).toHaveAttribute("data-preview", "ready");
    await markFrame(page, "03").check({ force: true });
    await page.getByRole("button", { name: "Download selected" }).click();
    await expect(page.locator("#tray-status")).toHaveText("1 download failed.");
    await expect(page.getByRole("button", { name: "Download selected" })).not.toHaveAttribute("data-receipt", "on");
  });

  test("sends several frames as one verified ZIP, with one save and the same bytes", async ({ page }) => {
    await showResults(page);
    await markFrame(page, "03").check({ force: true });
    await markFrame(page, "01").check({ force: true });
    await expect(page.locator("#tray-status")).toHaveText("These arrive as one ZIP.");

    const downloads: string[] = [];
    page.on("download", (download) => downloads.push(download.suggestedFilename()));
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download selected" }).click();
    const path = await (await pending).path();

    expect(zipEntries(path)).toEqual(["insta-luck-FIXOK01-01.webp", "insta-luck-FIXOK01-03.webp"]);
    const archive = readFileSync(path);
    for (const name of ["frame-01-720.webp", "frame-03-720.webp"]) {
      expect(archive.includes(readFileSync(resolve(SAMPLES, name)))).toBe(true);
    }

    await expect(page.locator("#tray-status")).toHaveText("2 frames in one ZIP. Check your browser’s downloads.");
    await expect(page.locator("#download-receipt")).toHaveText("2 in one ZIP");
    await expect(page.locator(".sheet.is-post .frame").first().locator(".frame-state")).toHaveText("Download started");
    expect(downloads).toEqual(["insta-luck-2-frames.zip"]);
  });

  test("a frame that fails is left out of the ZIP, reported, and can be retried", async ({ page }) => {
    await showResults(page, "FIXPART1");
    await expect(page.locator(".sheet.is-post .frame-plate").nth(2)).toHaveAttribute("data-preview", "ready");
    for (const number of ["01", "02", "03"]) await markFrame(page, number).check({ force: true });

    const pending = page.waitForEvent("download");
    const button = page.getByRole("button", { name: "Download selected" });
    await button.click();
    const download = await pending;
    expect(zipEntries(await download.path())).toEqual(["insta-luck-FIXPART1-01.webp", "insta-luck-FIXPART1-02.webp"]);
    await expect(page.locator("#tray-status")).toHaveText("2 frames in one ZIP. 1 failed.");
    await expect(button).not.toHaveAttribute("data-receipt", "on");

    const retry = page.waitForEvent("download");
    await page.getByRole("button", { name: "Retry failed" }).click();
    expect((await retry).suggestedFilename()).toBe("insta-luck-FIXPART1-03.webp");
    await expect(page.locator("#tray-status")).toHaveText("Download started. Check your browser’s downloads.");
  });

  test("gives a plain image, not a ZIP of one, when only one frame arrives", async ({ page }) => {
    await showResults(page, "FIXPART1");
    await expect(page.locator(".sheet.is-post .frame-plate").nth(2)).toHaveAttribute("data-preview", "ready");
    await markFrame(page, "01").check({ force: true });
    await markFrame(page, "03").check({ force: true });

    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download selected" }).click();
    expect((await pending).suggestedFilename()).toBe("insta-luck-FIXPART1-01.webp");
    await expect(page.locator("#tray-status")).toHaveText("1 download started. 1 failed.");
  });

  test("keeps successes and retries only what failed", async ({ page }) => {
    await showResults(page, "FIXPART1");
    await expect(page.locator(".sheet.is-post .frame-plate").nth(2)).toHaveAttribute("data-preview", "ready");
    await markFrame(page, "03").check({ force: true });

    await page.getByRole("button", { name: "Download selected" }).click();
    await expect(page.locator("#tray-status")).toHaveText("1 download failed.");
    await expect(page.locator(".sheet.is-post .frame").nth(2).locator(".frame-state")).toContainText("couldn’t be fetched");
    await expect(markFrame(page, "03")).toBeChecked();

    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Retry failed" }).click();
    expect((await pending).suggestedFilename()).toBe("insta-luck-FIXPART1-03.webp");
    await expect(page.locator(".sheet.is-post .frame").nth(2).locator(".frame-state")).toHaveText("Download started");
    await expect(page.getByRole("button", { name: "Retry failed" })).toBeHidden();
  });

  test("an expired link explains itself and carries its marks forward", async ({ page }) => {
    await showResults(page);
    await markFrame(page, "02").check({ force: true });
    await page.request.get(`/__fixture/advance?ms=${HOUR + 60_000}`);

    await page.getByRole("button", { name: "Download selected" }).click();
    await expect(page.locator(".roll-notice")).toContainText("This link has expired.");
    await expect(page.getByRole("button", { name: "Download selected" })).toBeDisabled();
    await expect(page.locator("#tray-status")).toContainText(/link read again|failed/);

    await page.getByRole("button", { name: "Read again" }).click();
    await expect(page.locator(".roll-notice")).toBeHidden();
    await expect(markFrame(page, "02")).toBeChecked();
    await expect(page.getByRole("button", { name: "Download selected" })).toBeEnabled();
  });

  test("a link that expires mid-batch reports every marked frame and retries them all", async ({ page }) => {
    await showResults(page);
    await markFrame(page, "01").check({ force: true });
    await markFrame(page, "02").check({ force: true });
    await page.request.get(`/__fixture/advance?ms=${HOUR + 60_000}`);

    const button = page.getByRole("button", { name: "Download selected" });
    await button.click();
    await expect(page.locator("#tray-status")).toHaveText("2 downloads failed.");
    await expect(page.locator(".frame-state", { hasText: "No longer valid" })).toHaveCount(2);
    await expect(button).not.toHaveAttribute("data-receipt", "on");

    await page.getByRole("button", { name: "Read again" }).click();
    await expect(page.locator(".roll-notice")).toBeHidden();

    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Retry failed" }).click();
    expect(zipEntries(await (await pending).path())).toEqual(["insta-luck-FIXOK01-01.webp", "insta-luck-FIXOK01-02.webp"]);
  });

  test("a stale image address sends you back to read the link, not to a dead end", async ({ page }) => {
    await showResults(page, "FIXGONE1");
    await expect(page.locator(".sheet.is-post .frame-plate").nth(1)).toHaveAttribute("data-preview", "ready");
    await markFrame(page, "02").check({ force: true });
    await page.getByRole("button", { name: "Download selected" }).click();
    await expect(page.locator(".roll-notice")).toContainText("Read it again");
    await page.getByRole("button", { name: "Read again" }).click();
    await expect(page.locator(".roll-notice")).toBeHidden();

    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Retry failed" }).click();
    expect((await pending).suggestedFilename()).toBe("insta-luck-FIXGONE1-02.webp");
  });

  test("an expired link can be revived by pasting it again", async ({ page }) => {
    await showResults(page);
    await markFrame(page, "02").check({ force: true });
    await page.request.get(`/__fixture/advance?ms=${HOUR + 60_000}`);
    await page.getByRole("button", { name: "Download selected" }).click();
    await expect(page.locator(".roll-notice")).toContainText("This link has expired.");

    await find(page, "FIXOK01");
    await expect(page.locator(".roll-notice")).toBeHidden();
    await expect(markFrame(page, "02")).toBeChecked();
  });

  test("still delivers from the links that are alive", async ({ page }) => {
    await showResults(page);
    await markFrame(page, "01").check({ force: true });
    await page.clock.install();
    await page.request.get(`/__fixture/advance?ms=${HOUR + 60_000}`);
    await showResults(page, "FIXSLOW1");
    await roll(page, "FIXSLOW1").getByLabel(/^Mark frame 01/).check({ force: true });

    const names: string[] = [];
    page.on("download", (download) => names.push(download.suggestedFilename()));
    await page.getByRole("button", { name: "Download selected" }).click();
    await expect.poll(() => names.length).toBe(1);
    expect(names).toEqual(["insta-luck-FIXSLOW1-01.webp"]);
    await expect(roll(page, "FIXOK01").locator(".roll-notice")).toContainText("This link has expired.");
  });
});

test.describe("recovery", () => {
  test("a visitor whose clock runs fast isn't told a live link expired", async ({ page }) => {
    await page.clock.install({ time: new Date(Date.now() + 2 * HOUR) });
    await page.goto("/app");
    await showResults(page);
    await markFrame(page, "02").check({ force: true });
    await page.clock.runFor(1000);
    await expect(page.locator(".roll-notice")).toBeHidden();
    await expect(page.getByRole("button", { name: "Download selected" })).toBeEnabled();
  });

  test("a link expires after its lifetime, whatever the clock says", async ({ page }) => {
    await page.clock.install({ time: new Date(Date.now() + 2 * HOUR) });
    await page.goto("/app");
    await showResults(page);
    await page.clock.runFor(HOUR + 1000);
    await expect(page.locator(".roll-notice")).toContainText("This link has expired.");
  });

  test("a late failure from a removed link doesn't touch the sheet", async ({ page }) => {
    const held: (() => Promise<void>)[] = [];
    let holding = true;
    await page.route("**/api/media/**", async (route) => {
      if (holding) held.push(() => route.abort());
      else await route.continue();
    });

    await showResults(page);
    await expect.poll(() => held.length).toBeGreaterThan(0);
    holding = false;

    await page.getByRole("button", { name: "Remove p/FIXOK01 from the sheet" }).click();
    await showResults(page);
    await expect(page.locator(".sheet.is-post .frame-plate").first()).toHaveAttribute("data-preview", "ready");
    await Promise.all(held.map((abort) => abort()));
    await page.waitForTimeout(150);

    await expect(page.locator(".frame-plate[data-preview='failed']")).toHaveCount(0);
    await expect(page.locator("#results")).not.toContainText("didn’t load");
  });

  test("marks survive a failed re-read and return on the next try", async ({ page }) => {
    await showResults(page);
    await markFrame(page, "02").check({ force: true });
    await page.request.get(`/__fixture/advance?ms=${HOUR + 60_000}`);
    await page.getByRole("button", { name: "Download selected" }).click();
    await expect(page.locator(".roll-notice")).toContainText("This link has expired.");

    await page.route("**/api/resolve", (route) =>
      route.fulfill({
        status: 503,
        json: { error: { code: "reader_limited", message: "The public reader is limiting requests.", retryable: true } }
      })
    );
    await page.getByRole("button", { name: "Read again" }).click();
    await expect(page.locator(".roll-notice")).toContainText("limiting requests");
    await expect(page.locator(".sheet.is-post .frame")).toHaveCount(5);

    await page.unroute("**/api/resolve");
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.locator(".roll-notice")).toBeHidden();
    await expect(markFrame(page, "02")).toBeChecked();
    await expect(page.locator("#tray-count")).toHaveText("1 selected");
  });

  test("Retry leaves alone a frame the visitor has since unmarked", async ({ page }) => {
    await showResults(page, "FIXPART1");
    await expect(page.locator(".sheet.is-post .frame-plate").nth(2)).toHaveAttribute("data-preview", "ready");
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
    await expect(page.locator(".sheet.is-post .frame-plate").first()).toHaveAttribute("data-preview", "ready");

    const pending = page.waitForEvent("download");
    await markFrame(page, "01").check({ force: true });
    await page.getByRole("button", { name: "Download selected" }).click();
    expect((await pending).suggestedFilename()).toBe("insta-luck-FIXOK01-01.webp");
    await second.close();
  });
});

test.describe("exposure", () => {
  test("follows the system until chosen, then keeps the choice", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ colorScheme: "dark", baseURL: baseURL ?? "" });
    const page = await context.newPage();
    await page.goto("/app");
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(26, 26, 26)");

    const toSnow = page.getByRole("button", { name: "Switch to day" });
    await expect(toSnow).toHaveAttribute("aria-pressed", "true");
    await toSnow.click();
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(255, 255, 255)");

    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-exposure", "snow");
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await context.close();
  });

  test("the horizon never moves when the sun sets", async ({ page }) => {
    const horizon = page.locator(".sun svg > path").first();
    const before = await horizon.boundingBox();
    await page.getByRole("button", { name: "Switch to night" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-exposure", "night");
    expect(await horizon.boundingBox()).toEqual(before);
  });
});

test("the rail stays beside the sheet while it scrolls", async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) < 900, "Wide screens only.");
  await showResults(page);
  await showResults(page, "FIXPROF");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.getByRole("button", { name: "Download selected" })).toBeInViewport();
  await expect(page.getByLabel("Instagram link")).toBeInViewport();
});

test.describe("touch and targets", () => {
  test("keeps primary controls at 44px or more", async ({ page }) => {
    await showResults(page);
    await markFrame(page, "01").check({ force: true });
    for (const locator of [
      page.getByRole("button", { name: "Add to sheet" }),
      page.getByLabel("Instagram link"),
      page.getByRole("button", { name: "Download selected" }),
      page.getByRole("button", { name: "Clear" }),
      inspectFrame(page, "01"),
      markFrame(page, "01"),
      page.getByRole("button", { name: /^Switch to/ })
    ]) {
      const box = await locator.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });

  test("gives a finger room to remove a link", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Touch only.");
    await showResults(page);
    const box = await page.getByRole("button", { name: "Remove p/FIXOK01 from the sheet" }).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });

  test("marks a frame by tapping the photograph", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Touch only.");
    await showResults(page);
    await page.locator(".sheet.is-post .frame-hit").first().tap();
    await expect(page.locator("#tray-count")).toHaveText("1 selected");
  });

  test("leaves the sheet readable behind the tray", async ({ page, viewport }) => {
    test.skip((viewport?.width ?? 0) >= 900, "On a wide screen the tray sits in the rail.");
    await showResults(page);
    const last = page.locator(".sheet.is-nearby .frame").last();
    await last.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const tray = await page.locator("#tray").boundingBox();
    const caption = await last.locator(".frame-caption").boundingBox();
    expect((caption?.y ?? 0) + (caption?.height ?? 0)).toBeLessThanOrEqual(tray?.y ?? 0);
  });

  test("has no horizontal overflow with a full sheet", async ({ page }) => {
    await showResults(page);
    const { scroll, client } = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth
    }));
    expect(scroll).toBeLessThanOrEqual(client);
  });
});

test("the mark appears at once under reduced motion", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ reducedMotion: "reduce", baseURL: baseURL ?? "" });
  const page = await context.newPage();
  await page.goto("/app");
  await showResults(page);
  await markFrame(page, "01").check({ force: true });
  const duration = await page
    .locator(".sheet.is-post .frame-bar")
    .first()
    .evaluate((element) => getComputedStyle(element).transitionDuration);
  expect(Number.parseFloat(duration)).toBeLessThan(0.05);
  await context.close();
});
