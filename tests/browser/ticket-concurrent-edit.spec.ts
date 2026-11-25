import { expect, test } from "@playwright/test";

const backend = "http://127.0.0.1:54450";
const ticketId = "30000000-0000-4000-8000-000000000001";

test("a save based on a stale ticket is refused, keeps edits, and succeeds after refresh", async ({
  page,
  context,
  request,
  baseURL,
}) => {
  await request.post(`${backend}/control`, { data: { reset: true } });
  const session = await (await request.get(`${backend}/session`)).json();
  await context.addCookies([
    {
      name: "sb-127-auth-token",
      value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`,
      url: baseURL!,
      sameSite: "Lax",
    },
  ]);
  await page.goto(`/org/verification/tickets/${ticketId}`);
  const title = page.getByLabel("Ticket Title", { exact: true });
  const priority = page.getByLabel("Priority", { exact: true });
  const save = page.getByRole("button", { name: "Save Changes", exact: true });
  await expect(title).toBeVisible({ timeout: 30_000 });
  await expect(priority).toHaveValue("medium");

  // Keep this tab stale: no background refresh reaches it while the teammate edits.
  await page.route("**/data/**", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Fixture refresh blocked" }),
    }),
  );
  await request.post(`${backend}/control`, {
    data: { concurrentEdit: { priority: "urgent" } },
  });

  await title.fill("My stale edit");
  await save.click();
  await expect(
    page.getByText(/Someone else changed this ticket after you opened it/),
  ).toBeVisible();
  await expect(title).toHaveValue("My stale edit");
  let { tickets } = await (await request.get(`${backend}/control`)).json();
  expect(tickets[0]).toMatchObject({
    title: "Verification ticket",
    priority: "urgent",
  });

  // Once the latest version loads, the retry keeps both changes.
  await page.unroute("**/data/**");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(priority).toHaveValue("urgent", { timeout: 15_000 });
  await expect(title).toHaveValue("My stale edit");
  await save.click();
  await expect(
    page.getByText("Ticket updated successfully.", { exact: true }),
  ).toBeVisible();
  ({ tickets } = await (await request.get(`${backend}/control`)).json());
  expect(tickets[0]).toMatchObject({ title: "My stale edit", priority: "urgent" });
});
