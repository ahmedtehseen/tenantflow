import { expect, test } from "@playwright/test";

const backend = "http://127.0.0.1:54450";
const ticketId = "30000000-0000-4000-8000-000000000001";
const memberId = "20000000-0000-4000-8000-000000000002";

for (const failedRefresh of [false, true]) {
  test(`ticket selections survive saving with failed refresh = ${failedRefresh}`, async ({
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
    await expect(page.getByLabel("Ticket Title", { exact: true })).toBeVisible({
      timeout: 30_000,
    });

    if (failedRefresh) {
      await page.route("**/data/**", (route) =>
        route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Fixture refresh failure" }),
        }),
      );
    }

    const status = page.getByLabel("Status", { exact: true });
    const priority = page.getByLabel("Priority", { exact: true });
    const assignee = page.getByLabel("Assignee", { exact: true });
    const save = page.getByRole("button", {
      name: "Save Changes",
      exact: true,
    });
    await status.selectOption("in_progress");
    await priority.selectOption("high");
    await assignee.selectOption(memberId);
    await save.click();
    await expect(
      page.getByText("Ticket updated successfully.", { exact: true }),
    ).toBeVisible();
    await expect(save).toBeEnabled();
    await expect(status).toHaveValue("in_progress");
    await expect(priority).toHaveValue("high");
    await expect(assignee).toHaveValue(memberId);
    await expect(
      page.locator("span").filter({ hasText: /^Verification Member$/ }),
    ).toBeVisible();

    // A title-only save must submit the same selections the user sees.
    await page.getByLabel("Ticket Title", { exact: true }).fill("Second save");
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname ===
            `/org/verification/tickets/${ticketId}`,
      ),
      save.click(),
    ]);
    await expect(save).toBeEnabled();
    const { tickets } = await (await request.get(`${backend}/control`)).json();
    expect(tickets[0]).toMatchObject({
      title: "Second save",
      status: "in_progress",
      priority: "high",
      assigned_to: memberId,
    });
    await expect(status).toHaveValue("in_progress");
    await expect(priority).toHaveValue("high");
    await expect(assignee).toHaveValue(memberId);
  });
}
