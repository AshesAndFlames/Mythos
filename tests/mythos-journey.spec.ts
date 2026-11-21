/**
 * The core Mythos journey through the real UI, one signed-in owner:
 * dashboard → found a universe → write an article (rich body, summary,
 * category, tags) → save draft → publish → second article with a
 * relationship → library search/filters → detail page → delete with
 * confirmation (stored rich-text body erased) → delete the universe.
 */
import { test, expect, loadAllTestAccounts } from "deepspace/testing";
import {
  hexOf,
  openDashboard,
  replaceEditorText,
  storedDocHex,
  startUniverse,
  tokenFor,
} from "./helpers/mythos";

const available = new Set(loadAllTestAccounts().map((a) => a.name));
test.skip(!available.has("Alice"), "Needs a usable test account named Alice.");
test.setTimeout(180_000);

/** A 1×1 PNG. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

test("an owner builds a universe end to end", async ({ users }) => {
  const [alice] = await users(["Alice"]);
  const page = alice.page;
  const universeName = `Journey ${Date.now()}`;
  const secret = `Lysandra secret ${Date.now()}`;

  await test.step("found a universe from the dashboard", async () => {
    await openDashboard(alice);
    await startUniverse(page);
    await page.getByLabel("Name").fill(universeName);
    await page.getByLabel("Tagline").fill("Where the tide remembers");
    await page.getByRole("button", { name: "Create universe" }).click();
    await expect(page.getByTestId("universe-name")).toHaveText(universeName, {
      timeout: 20_000,
    });
    await expect(page.getByText("This world is still unwritten")).toBeVisible();
    await expect(page.getByTestId("stat-articles")).toHaveText("0");
  });
  const universeUrl = new URL(page.url()).pathname;
  let universeDeleted = false;
  try {
    let lysandraUrl = "";
    await test.step("write, save a draft and publish an article", async () => {
      await page
        .getByRole("button", { name: "Write the first article" })
        .click();
      await page.getByLabel("Title").fill("Lysandra Vale");
      await page.getByLabel("Type").selectOption("character");
      await page.getByRole("button", { name: "Create article" }).click();
      await expect(page).toHaveURL(/\/edit$/, { timeout: 20_000 });
      lysandraUrl = new URL(page.url()).pathname.replace(/\/edit$/, "");

      await page
        .getByTestId("article-summary-input")
        .fill("Last heir of the drowned house.");
      await replaceEditorText(page, secret);
      await page.getByLabel("Add a tag").fill("heroine");
      await page.getByLabel("Add a tag").press("Enter");
      await page.getByRole("button", { name: "+ New category" }).click();
      await page.getByLabel("New category name").fill("People");
      await page.getByRole("button", { name: "Add", exact: true }).click();
      await expect(
        page.getByLabel("Category", { exact: true }),
      ).not.toHaveValue("", { timeout: 20_000 });

      await page.getByRole("button", { name: "Save draft" }).click();
      await expect(page.getByText(/Draft saved/)).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByTestId("save-state")).toHaveText(/Saved/);

      await page.getByRole("button", { name: "Publish" }).click();
      await expect(page).toHaveURL(new RegExp(`${lysandraUrl}$`), {
        timeout: 20_000,
      });
      await expect(page.getByTestId("article-title")).toHaveText(
        "Lysandra Vale",
      );
      await expect(page.getByTestId("article-summary")).toHaveText(
        "Last heir of the drowned house.",
      );
      await expect(page.getByTestId("article-body-view")).toContainText(
        secret,
        { timeout: 20_000 },
      );
      await expect(page.getByTestId("article-tags")).toContainText("#heroine");
      await expect(page.getByText("Published", { exact: true })).toBeVisible();
    });

    await test.step("link a second article to the first", async () => {
      await page.getByTestId("new-article-button").click();
      await page.getByLabel("Title").fill("Thornwall");
      await page.getByLabel("Type").selectOption("location");
      await page.getByRole("button", { name: "Create article" }).click();
      await expect(page).toHaveURL(/\/edit$/, { timeout: 20_000 });

      // From the place's side: "Thornwall is home of Lysandra".
      await page
        .getByLabel("Relationship type")
        .selectOption("lives_in:incoming");
      await page.getByLabel("Find an article to link").fill("Lys");
      await page
        .getByRole("list", { name: "Matching articles" })
        .getByRole("button", { name: /Lysandra Vale/ })
        .click();
      await page.getByRole("button", { name: "Add connection" }).click();
      const connectionGroup = (key: string) =>
        page.getByTestId("connections").locator(`[data-group="${key}"]`);
      await expect(connectionGroup("lives_in:incoming")).toContainText(
        "Lysandra Vale",
        { timeout: 20_000 },
      );
      // A real upload through the file store; the published cover must load.
      await page.getByTestId("cover-file-input").setInputFiles({
        name: "thornwall.png",
        mimeType: "image/png",
        buffer: PNG,
      });
      await expect(page.locator('img[src*="/covers/"]')).toHaveCount(1, {
        timeout: 20_000,
      });
      await page.getByRole("button", { name: "Publish" }).click();
      await expect(page.getByTestId("article-title")).toHaveText("Thornwall", {
        timeout: 20_000,
      });
      const cover = page.locator('header img[src*="/covers/"]');
      await expect(cover).toHaveCount(1);
      await expect
        .poll(
          () =>
            cover.evaluate(
              (img: HTMLImageElement) => img.complete && img.naturalWidth,
            ),
          { timeout: 20_000 },
        )
        .toBe(1);
      await expect(connectionGroup("lives_in:incoming")).toContainText(
        "Home of",
      );

      await page.goto(lysandraUrl);
      await expect(connectionGroup("lives_in:outgoing")).toContainText(
        "Thornwall",
        { timeout: 20_000 },
      );
    });

    await test.step("find articles in the library", async () => {
      await page.goto(`${universeUrl}/articles`);
      await expect(page.getByTestId("library-count")).toHaveText(
        "2 of 2 articles",
        { timeout: 20_000 },
      );
      await page.getByLabel("Search articles").fill("drowned");
      await expect(page.getByTestId("library-count")).toHaveText(
        "1 of 2 articles",
      );
      await expect(page.getByTestId("article-card")).toHaveText(
        /Lysandra Vale/,
      );
      await page.getByLabel("Search articles").fill("");
      await page.getByLabel("Filter by type").selectOption("location");
      await expect(page.getByTestId("article-card")).toHaveText(/Thornwall/);
      await page.getByLabel("Filter by type").selectOption("");
      await page
        .getByLabel("Filter by category")
        .selectOption({ label: "People" });
      await expect(page.getByTestId("library-count")).toHaveText(
        "1 of 2 articles",
      );
      await page.getByRole("button", { name: "List view" }).click();
      await expect(page.getByTestId("article-row")).toHaveCount(1);
      await page.getByLabel("Search articles").fill("nothing like this");
      await expect(page.getByText("Nothing matches")).toBeVisible();
    });

    await test.step("delete an article after confirming, erasing its rich body", async () => {
      const articleId = lysandraUrl.split("/").pop() as string;
      expect(
        await storedDocHex(page.request, `articles:${articleId}:body`),
      ).toContain(hexOf(secret));
      await page.goto(`${lysandraUrl}/edit`);
      await page.getByRole("button", { name: "Delete article" }).click();
      await expect(page.getByRole("dialog")).toContainText("cannot be undone");
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Delete article" })
        .click();
      await expect(page).toHaveURL(new RegExp(`${universeUrl}/articles$`), {
        timeout: 20_000,
      });
      await expect(page.getByTestId("library-count")).toHaveText(
        "1 of 1 articles",
        { timeout: 20_000 },
      );
      const stored = await storedDocHex(
        page.request,
        `articles:${articleId}:body`,
      );
      expect(
        stored === null || !stored.includes(hexOf("Lysandra secret")),
      ).toBe(true);
    });

    await test.step("delete the universe from settings", async () => {
      await page.goto(`${universeUrl}/settings`);
      await page.getByRole("button", { name: "Delete universe" }).click();
      const confirm = page.getByRole("button", { name: "Delete forever" });
      await expect(confirm).toBeDisabled();
      await page.getByLabel(/to confirm/).fill(universeName);
      await confirm.click();
      await expect(
        page.getByRole("heading", { name: "Your universes" }),
      ).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(universeName)).toHaveCount(0);
      universeDeleted = true;
    });
  } finally {
    // A failed run must not leave its universe behind (owners are capped at 25).
    if (!universeDeleted) {
      await page.request.post("/api/actions/deleteUniverse", {
        headers: { Authorization: `Bearer ${await tokenFor(page)}` },
        data: {
          universeId: universeUrl.split("/").pop(),
          confirmName: universeName,
        },
      });
    }
  }
});
