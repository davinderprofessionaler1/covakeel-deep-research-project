import assert from "node:assert/strict";
import test from "node:test";

const { stripAssistantMetadata, stripTestingNotice } = await import("../server/chat.js");

test("removes generated testing and source blocks from assistant history", () => {
  const content = [
    "Article 269A governs inter-State GST.",
    "",
    "Testing data — legal review pending.",
    "",
    "Source: An incorrect source",
    "https://example.test/source.pdf",
  ].join("\n");

  assert.equal(
    stripAssistantMetadata(content),
    "Article 269A governs inter-State GST.",
  );
});

test("preserves ordinary assistant answers", () => {
  const content = "The Central Government has one-third voting weight.";
  assert.equal(stripAssistantMetadata(content), content);
});

test("removes the testing notice while preserving verified source metadata", () => {
  const content = [
    "Article 246A gives Parliament and State Legislatures power to make GST laws.",
    "",
    "Testing data — legal review pending.",
    "",
    "Source: The Constitution (One Hundred and First Amendment) Act, 2016",
    "https://www.gstcouncil.gov.in/source.pdf",
  ].join("\n");

  assert.equal(
    stripTestingNotice(content),
    [
      "Article 246A gives Parliament and State Legislatures power to make GST laws.",
      "",
      "Source: The Constitution (One Hundred and First Amendment) Act, 2016",
      "https://www.gstcouncil.gov.in/source.pdf",
    ].join("\n"),
  );
});
