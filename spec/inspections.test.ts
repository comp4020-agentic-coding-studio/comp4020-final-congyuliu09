import { expect, inject, it } from "vitest";

// Against the RUNNING app (see global-setup.ts) — covers the scope lines for
// crit 8: create an inspection, add findings with severities, and have them
// still be there on a later, independent request (simulating "come back
// later" without any in-process state to lean on).
const baseUrl = inject("baseUrl");

function form(fields: Record<string, string>): string {
  return new URLSearchParams(fields).toString();
}

// Node's fetch doesn't carry cookies between calls the way a browser does, so
// each "visitor" in these tests is a tiny jar that resends whatever the app
// last set — the same cookie a real browser would carry across requests.
class Visitor {
  private cookie: string | undefined;

  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.cookie) headers.set("cookie", this.cookie);
    const res = await fetch(new URL(path, baseUrl), { ...init, headers, redirect: "manual" });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";")[0];
    return res;
  }

  async createInspection(fields: Record<string, string>): Promise<string> {
    const res = await this.fetch("/inspections", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form(fields),
    });
    expect(res.status).toBe(303);
    const location = res.headers.get("location");
    expect(location).toBeTruthy();
    return location!;
  }

  async addFinding(path: string, fields: Record<string, string>): Promise<Response> {
    return this.fetch(`${path}/findings`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form(fields),
    });
  }
}

it("creates an inspection with vehicle details and shows it afterward", async () => {
  const visitor = new Visitor();
  const path = await visitor.createInspection({ make: "Honda", model: "Civic", year: "2018", odometer: "42000" });

  const detail = await visitor.fetch(path);
  expect(detail.status).toBe(200);
  const html = await detail.text();
  expect(html).toContain("Honda");
  expect(html).toContain("Civic");
  expect(html).toContain("2018");
  expect(html).toContain("42,000");
});

it("adds findings with a severity and persists them across a later, independent request", async () => {
  const visitor = new Visitor();
  const path = await visitor.createInspection({ make: "Mazda", model: "3", year: "2019", odometer: "61000" });

  const addFinding = await visitor.addFinding(path, {
    category: "oil leak",
    description: "Small leak near the sump",
    severity: "high",
  });
  expect(addFinding.status).toBe(303);

  // A fresh request, same visitor, no connection to the process that created
  // the data — this is what "refresh or return later" means for an HTTP app.
  const later = await visitor.fetch(path);
  const html = await later.text();
  expect(html).toContain("oil leak");
  expect(html).toContain("Small leak near the sump");
  expect(html).toContain("high");
});

it("shows a saved inspection in the top-level list, for its own visitor only", async () => {
  const visitor = new Visitor();
  await visitor.createInspection({ make: "Subaru", model: "Outback", year: "2020", odometer: "15000" });

  const list = await visitor.fetch("/");
  const html = await list.text();
  expect(html).toContain("Subaru");
  expect(html).toContain("Outback");

  // A second, unrelated visitor's list doesn't see the first visitor's cars —
  // this is the "tells them apart" half of multi-user.
  const stranger = new Visitor();
  const strangerList = await stranger.fetch("/");
  const strangerHtml = await strangerList.text();
  expect(strangerHtml).not.toContain("Subaru");
});

it("404s for an inspection id that doesn't exist", async () => {
  const res = await new Visitor().fetch("/inspections/does-not-exist");
  expect(res.status).toBe(404);
});

it("404s a visitor viewing or adding to someone else's inspection — authorization is server-side", async () => {
  const owner = new Visitor();
  const path = await owner.createInspection({ make: "Ford", model: "Focus", year: "2016", odometer: "80000" });

  const stranger = new Visitor();
  const viewAttempt = await stranger.fetch(path);
  expect(viewAttempt.status).toBe(404);

  const addAttempt = await stranger.addFinding(path, {
    category: "brakes",
    description: "shouldn't be able to add this",
    severity: "low",
  });
  expect(addAttempt.status).toBe(404);

  // The owner's view is unaffected by the stranger's rejected attempt.
  const ownerView = await owner.fetch(path);
  const html = await ownerView.text();
  expect(html).not.toContain("shouldn't be able to add this");
});

it("records mutations in the server-side activity log, gated behind the logs token", async () => {
  const visitor = new Visitor();
  const path = await visitor.createInspection({ make: "Kia", model: "Sportage", year: "2021", odometer: "8000" });
  await visitor.addFinding(path, { category: "windscreen chip", description: "small chip, driver side", severity: "medium" });

  // No token, or the wrong one, 404s — /logs holds every visitor's findings,
  // not just this test's, so it can't be open the way an inspection page is.
  const noToken = await fetch(new URL("/logs", baseUrl));
  expect(noToken.status).toBe(404);
  const wrongToken = await fetch(new URL("/logs?token=wrong", baseUrl));
  expect(wrongToken.status).toBe(404);

  const logsToken = inject("logsToken");
  const logs = await fetch(new URL(`/logs?token=${encodeURIComponent(logsToken)}`, baseUrl));
  expect(logs.status).toBe(200);
  const html = await logs.text();
  expect(html).toContain("create_inspection");
  expect(html).toContain("add_finding");
  expect(html).toContain("windscreen chip");
});

it("pushes a newly added finding to another open session on the same inspection within about a second", async () => {
  const visitor = new Visitor();
  const path = await visitor.createInspection({ make: "Volvo", model: "XC40", year: "2022", odometer: "5000" });

  // Open the real-time stream before the finding is added, exactly like a
  // second browser tab left open on the inspection page.
  const stream = await visitor.fetch(`${path}/events`);
  expect(stream.status).toBe(200);
  expect(stream.headers.get("content-type")).toContain("text/event-stream");

  const reader = stream.body!.getReader();
  const decoder = new TextDecoder();
  let buffered = "";

  const waitForEvent = (): Promise<string> =>
    new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("no finding event within 2s")), 2000);
      (async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) return;
          buffered += decoder.decode(value, { stream: true });
          if (buffered.includes("event: finding")) {
            clearTimeout(timeout);
            resolve(buffered);
            return;
          }
        }
      })().catch(reject);
    });

  await visitor.addFinding(path, { category: "suspension", description: "clunk over bumps", severity: "medium" });

  const received = await waitForEvent();
  expect(received).toContain("suspension");
  expect(received).toContain("clunk over bumps");

  await reader.cancel();
});
