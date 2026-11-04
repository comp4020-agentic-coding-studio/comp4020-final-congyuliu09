import { expect, inject, it } from "vitest";

// Against the RUNNING app — covers the two features added after crit 10:
// accounts (a guest's data survives registering, and logging in from a
// fresh cookie jar finds it again) and photos (up to 9 per finding,
// enforced server-side, visible only to the finding's owner).
const baseUrl = inject("baseUrl");

function form(fields: Record<string, string>): string {
  return new URLSearchParams(fields).toString();
}

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
    return res.headers.get("location")!;
  }

  async createFinding(inspectionPath: string, fields: Record<string, string>): Promise<string> {
    const res = await this.fetch(`${inspectionPath}/findings`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form(fields),
    });
    expect(res.status).toBe(303);
    const html = await this.fetch(inspectionPath).then((r) => r.text());
    const match = html.match(/\/findings\/([a-f0-9-]+)/);
    expect(match, "expected a finding link on the inspection page").toBeTruthy();
    return `/findings/${match![1]}`;
  }

  async uploadPhoto(findingPath: string, filename: string, bytes: Uint8Array, contentType: string): Promise<Response> {
    const boundary = "----vitest-boundary";
    const parts: Buffer[] = [
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="photos"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
      ),
      Buffer.from(bytes),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ];
    return this.fetch(findingPath + "/photos", {
      method: "POST",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      body: Buffer.concat(parts),
    });
  }
}

// A minimal valid 1x1 PNG, used as upload payload across these tests.
const PNG_1X1 = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  ),
);

function uniqueUsername(): string {
  return `vitest_${Math.random().toString(36).slice(2, 10)}`;
}

it("keeps a guest's inspections after they register, under the same cookie", async () => {
  const visitor = new Visitor();
  const path = await visitor.createInspection({ make: "Honda", model: "Civic", year: "2020", odometer: "10000" });

  const username = uniqueUsername();
  const register = await visitor.fetch("/register", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form({ username, password: "password123" }),
  });
  expect(register.status).toBe(303);

  const afterRegister = await visitor.fetch(path);
  expect(afterRegister.status).toBe(200);
  expect(await afterRegister.text()).toContain("Honda");
});

it("finds the same account's data again after logging in from a fresh cookie jar", async () => {
  const original = new Visitor();
  const path = await original.createInspection({ make: "Subaru", model: "Forester", year: "2021", odometer: "3000" });
  const username = uniqueUsername();
  await original.fetch("/register", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form({ username, password: "password123" }),
  });

  // A brand new Visitor has no cookie yet — this is "a different device".
  const elsewhere = new Visitor();
  const login = await elsewhere.fetch("/login", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form({ username, password: "password123" }),
  });
  expect(login.status).toBe(303);

  const home = await elsewhere.fetch("/");
  expect(await home.text()).toContain("Subaru");

  const detail = await elsewhere.fetch(path);
  expect(detail.status).toBe(200);
});

it("rejects the wrong password and a duplicate username", async () => {
  const visitor = new Visitor();
  const username = uniqueUsername();
  await visitor.fetch("/register", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form({ username, password: "password123" }),
  });

  const wrongPassword = await new Visitor().fetch("/login", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form({ username, password: "not-the-password" }),
  });
  expect(wrongPassword.status).toBe(401);

  const dup = await new Visitor().fetch("/register", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form({ username, password: "anotherpassword" }),
  });
  expect(dup.status).toBe(409);
});

it("uploads a photo with a caption to a finding and serves it back only to the owner", async () => {
  const owner = new Visitor();
  const inspectionPath = await owner.createInspection({ make: "Kia", model: "Seltos", year: "2022", odometer: "2000" });
  const findingPath = await owner.createFinding(inspectionPath, {
    category: "Scratch",
    description: "Door panel scratch",
    severity: "medium",
  });

  const upload = await owner.uploadPhoto(findingPath, "scratch.png", PNG_1X1, "image/png");
  expect(upload.status).toBe(303);

  const detail = await owner.fetch(findingPath);
  const html = await detail.text();
  expect(html).toContain("Photos (1/9)");
  const photoMatch = html.match(/\/photos\/([a-f0-9-]+)/);
  expect(photoMatch, "expected an uploaded photo's URL on the finding page").toBeTruthy();
  const photoUrl = `/photos/${photoMatch![1]}`;

  const ownerView = await owner.fetch(photoUrl);
  expect(ownerView.status).toBe(200);
  expect(ownerView.headers.get("content-type")).toBe("image/png");

  const stranger = new Visitor();
  await stranger.fetch("/"); // mint a cookie
  const strangerPhotoView = await stranger.fetch(photoUrl);
  expect(strangerPhotoView.status).toBe(404);
  const strangerFindingView = await stranger.fetch(findingPath);
  expect(strangerFindingView.status).toBe(404);
});

it("caps a finding at 9 photos even when more are sent in one request", async () => {
  const owner = new Visitor();
  const inspectionPath = await owner.createInspection({ make: "Flood", model: "Test", year: "2020", odometer: "1" });
  const findingPath = await owner.createFinding(inspectionPath, {
    category: "Many photos",
    description: "stress test",
    severity: "low",
  });

  const boundary = "----vitest-flood-boundary";
  const parts: Buffer[] = [];
  for (let i = 0; i < 15; i++) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="photos"; filename="p${i}.png"\r\nContent-Type: image/png\r\n\r\n`,
      ),
      Buffer.from(PNG_1X1),
      Buffer.from("\r\n"),
    );
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));

  const res = await owner.fetch(findingPath + "/photos", {
    method: "POST",
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    body: Buffer.concat(parts),
  });
  expect(res.status).toBe(303);

  const html = await owner.fetch(findingPath).then((r) => r.text());
  expect(html).toContain("Photos (9/9)");
  expect(html).toContain(`its 9 photos`);
});

it("rejects a non-image upload", async () => {
  const owner = new Visitor();
  const inspectionPath = await owner.createInspection({ make: "Fake", model: "Upload", year: "2020", odometer: "1" });
  const findingPath = await owner.createFinding(inspectionPath, {
    category: "Not a photo",
    description: "should be rejected",
    severity: "low",
  });

  const upload = await owner.uploadPhoto(findingPath, "not-a-photo.txt", new TextEncoder().encode("hello"), "text/plain");
  expect(upload.status).toBe(303); // redirects either way; nothing gets stored

  const html = await owner.fetch(findingPath).then((r) => r.text());
  expect(html).toContain("Photos (0/9)");
});
