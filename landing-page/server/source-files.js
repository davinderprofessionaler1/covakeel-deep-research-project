import { Readable } from "node:stream";

const ALLOWED_SOURCE_HOSTS = new Set([
  "gstcouncil.gov.in",
  "www.gstcouncil.gov.in",
  "indiacode.nic.in",
  "www.indiacode.nic.in",
  "cdnbbsr.s3waas.gov.in",
  "delhipolice.gov.in",
  "www.delhipolice.gov.in",
]);

export function parseSourceUrl(value) {
  let source;
  try {
    source = new URL(String(value || ""));
  } catch {
    return null;
  }
  if (source.protocol !== "https:" || !ALLOWED_SOURCE_HOSTS.has(source.hostname.toLowerCase())) return null;
  if (!/\.pdf$/i.test(source.pathname)) return null;
  return source;
}

function safeFilename(source) {
  const fallback = "covakeel-source.pdf";
  const name = decodeURIComponent(source.pathname.split("/").pop() || fallback)
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return name || fallback;
}

export function registerSourceFileRoutes(app) {
  app.get("/api/source-file", async (request, response) => {
    const source = parseSourceUrl(request.query.url);
    if (!source) return response.status(400).json({ error: "This PDF source is not available for preview." });

    const headers = {
      Accept: "application/pdf",
      "User-Agent": "CoVakeel/1.0 legal-source-viewer",
    };
    if (request.headers.range) headers.Range = request.headers.range;

    try {
      const upstream = await fetch(source, { headers, redirect: "follow", signal: AbortSignal.timeout(30_000) });
      if (!upstream.ok && upstream.status !== 206) {
        return response.status(502).json({ error: "The official PDF source is temporarily unavailable." });
      }

      response.status(upstream.status);
      for (const name of ["accept-ranges", "content-length", "content-range", "etag", "last-modified"]) {
        const value = upstream.headers.get(name);
        if (value) response.setHeader(name, value);
      }
      response.setHeader("Content-Type", "application/pdf");
      response.setHeader("Cache-Control", "private, max-age=3600");
      response.setHeader(
        "Content-Disposition",
        `${request.query.download === "1" ? "attachment" : "inline"}; filename="${safeFilename(source)}"`,
      );
      if (!upstream.body) return response.end();
      return Readable.fromWeb(upstream.body).pipe(response);
    } catch (error) {
      if (!response.headersSent) return response.status(502).json({ error: "Unable to load the official PDF source." });
      return response.destroy(error);
    }
  });
}
