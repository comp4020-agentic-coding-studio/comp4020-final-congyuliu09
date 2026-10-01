import { expect, inject, it } from "vitest";

// Against the RUNNING app (see global-setup.ts) — covers the scope lines for
// crit 8: create an inspection, add findings with severities, and have them
// still be there on a later, independent request (simulating "come back
// later" without any in-process state to lean on).
const baseUrl = inject("baseUrl");

function form(fields: Record<string, string>): string {
  return new URLSearchParams(fields).toString();
}

async function createInspection(fields: Record<string, string>): Promise<string> {
  const res = await fetch(new URL("/inspections", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form(fields),
    redirect: "manual",
  });
  expect(res.status).toBe(303);
  const location = res.headers.get("location");
  expect(location).toBeTruthy();
  return location!;
}

it("creates an inspection with vehicle details and shows it afterward", async () => {
  const path = await createInspection({ make: "Honda", model: "Civic", year: "2018", odometer: "42000" });

  const detail = await fetch(new URL(path, baseUrl));
  expect(detail.status).toBe(200);
  const html = await detail.text();
  expect(html).toContain("Honda");
  expect(html).toContain("Civic");
  expect(html).toContain("2018");
  expect(html).toContain("42,000");
});

it("adds findings with a severity and persists them across a later, independent request", async () => {
  const path = await createInspection({ make: "Mazda", model: "3", year: "2019", odometer: "61000" });

  const addFinding = await fetch(new URL(`${path}/findings`, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form({ category: "oil leak", description: "Small leak near the sump", severity: "high" }),
    redirect: "manual",
  });
  expect(addFinding.status).toBe(303);

  // A fresh request with no connection to the one that created the data —
  // this is what "refresh or return later" means for an HTTP app.
  const later = await fetch(new URL(path, baseUrl));
  const html = await later.text();
  expect(html).toContain("oil leak");
  expect(html).toContain("Small leak near the sump");
  expect(html).toContain("high");
});

it("shows a saved inspection in the top-level list", async () => {
  await createInspection({ make: "Subaru", model: "Outback", year: "2020", odometer: "15000" });

  const list = await fetch(new URL("/", baseUrl));
  const html = await list.text();
  expect(html).toContain("Subaru");
  expect(html).toContain("Outback");
});

it("404s for an inspection id that doesn't exist", async () => {
  const res = await fetch(new URL("/inspections/does-not-exist", baseUrl));
  expect(res.status).toBe(404);
});
