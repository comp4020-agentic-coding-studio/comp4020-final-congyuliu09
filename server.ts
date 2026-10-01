import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { openDb } from "./db.ts";
import { handleRequest } from "./routes.ts";

const port = Number.parseInt(process.env.PORT ?? "8080", 10);
const dataDir = process.env.DATA_DIR ?? "/data";
mkdirSync(dataDir, { recursive: true });

const db = openDb(join(dataDir, "carcheck.db"));

const server = createServer((req, res) => {
  handleRequest(req, res, db).catch((err: unknown) => {
    console.error(err);
    res.writeHead(500, { "content-type": "text/plain" });
    res.end("internal error");
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`CarCheck listening on 0.0.0.0:${port}, data at ${dataDir}`);
});
