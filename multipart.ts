import type { IncomingMessage } from "node:http";

export interface MultipartFile {
  fieldName: string;
  filename: string;
  contentType: string;
  data: Buffer;
}

export interface MultipartResult {
  fields: Record<string, string>;
  files: MultipartFile[];
}

// Photo uploads need multipart/form-data, which the plain
// URLSearchParams-based form parser in routes.ts can't read (and mustn't try
// to — decoding binary image bytes as UTF-8 corrupts them). No framework
// means no bundled multipart parser either, so this is a minimal one: find
// the boundary, split on it, split each part's headers from its body on the
// blank line. It only understands what a standard <form> file input sends
// (Content-Disposition with name/filename, optional Content-Type) — not the
// full multipart spec (no nested multipart, no non-form content).
export function parseContentTypeBoundary(contentType: string | undefined): string | undefined {
  if (!contentType) return undefined;
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  return match ? (match[1] ?? match[2]).trim() : undefined;
}

export async function readRawBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    total += buf.length;
    if (total > maxBytes) {
      throw new Error(`request body exceeds ${maxBytes} bytes`);
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

export function parseMultipart(body: Buffer, boundary: string): MultipartResult {
  const fields: Record<string, string> = {};
  const files: MultipartFile[] = [];
  const marker = Buffer.from(`--${boundary}`);
  const crlfcrlf = Buffer.from("\r\n\r\n");

  let cursor = body.indexOf(marker);
  while (cursor !== -1) {
    const next = body.indexOf(marker, cursor + marker.length);
    if (next === -1) break;

    let partStart = cursor + marker.length;
    if (body[partStart] === 0x0d && body[partStart + 1] === 0x0a) partStart += 2;
    let partEnd = next;
    if (body[partEnd - 2] === 0x0d && body[partEnd - 1] === 0x0a) partEnd -= 2;

    if (partEnd > partStart) {
      const part = body.subarray(partStart, partEnd);
      const headerEnd = part.indexOf(crlfcrlf);
      if (headerEnd !== -1) {
        const headerText = part.subarray(0, headerEnd).toString("utf8");
        const content = part.subarray(headerEnd + crlfcrlf.length);

        const disposition = headerText.match(
          /Content-Disposition:\s*form-data;\s*name="([^"]*)"(?:;\s*filename="([^"]*)")?/i,
        );
        const contentType = headerText.match(/Content-Type:\s*([^\r\n]+)/i);

        if (disposition) {
          const fieldName = disposition[1];
          const filename = disposition[2];
          if (filename !== undefined) {
            if (filename.length > 0) {
              files.push({
                fieldName,
                filename,
                contentType: contentType ? contentType[1].trim() : "application/octet-stream",
                data: content,
              });
            }
          } else {
            fields[fieldName] = content.toString("utf8");
          }
        }
      }
    }

    cursor = next;
  }

  return { fields, files };
}
