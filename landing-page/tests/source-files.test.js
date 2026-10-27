import assert from "node:assert/strict";
import test from "node:test";

const { parseSourceUrl } = await import("../server/source-files.js");

test("allows official CoVakeel PDF source hosts", () => {
  const source = parseSourceUrl("https://www.gstcouncil.gov.in/sites/default/files/2024-04/annexure-3_cgst-act_2017.pdf");
  assert.equal(source?.hostname, "www.gstcouncil.gov.in");
});

test("rejects non-PDF, local and unapproved source URLs", () => {
  assert.equal(parseSourceUrl("https://www.gstcouncil.gov.in/page.html"), null);
  assert.equal(parseSourceUrl("http://127.0.0.1/private.pdf"), null);
  assert.equal(parseSourceUrl("https://example.com/source.pdf"), null);
});
