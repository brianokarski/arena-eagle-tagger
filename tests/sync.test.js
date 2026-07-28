import test from "node:test";
import assert from "node:assert/strict";
import { blockToItem, buildTags, sourceDomain } from "../src/sync.js";

const imageBlock = {
  id: 123,
  class: "Image",
  title: "Nice Poster",
  description: "A poster I liked",
  source: { url: "https://www.behance.net/gallery/1" },
  image: { original: { url: "https://images.are.na/original/abc.jpg" } },
};

test("sourceDomain strips www and handles bad urls", () => {
  assert.equal(sourceDomain("https://www.behance.net/x"), "behance.net");
  assert.equal(sourceDomain("not a url"), null);
});

test("buildTags includes base, channel, and source tags", () => {
  const tags = buildTags(imageBlock, "posters", {
    always: ["arena"],
    channelTag: true,
    sourceDomainTag: true,
  });
  assert.deepEqual(tags, ["arena", "arena:posters", "src:behance.net"]);
});

test("buildTags respects disabled options", () => {
  const tags = buildTags(imageBlock, "posters", {
    always: ["arena"],
    channelTag: false,
    sourceDomainTag: false,
  });
  assert.deepEqual(tags, ["arena"]);
});

test("blockToItem maps an image block", () => {
  const item = blockToItem(imageBlock, "posters", { always: ["arena"] });
  assert.equal(item.url, "https://images.are.na/original/abc.jpg");
  assert.equal(item.name, "Nice Poster");
  assert.equal(item.website, "https://www.are.na/block/123");
  assert.match(item.annotation, /A poster I liked/);
  assert.match(item.annotation, /behance\.net/);
});

test("blockToItem maps an attachment block", () => {
  const item = blockToItem(
    { id: 9, class: "Attachment", attachment: { url: "https://x/f.pdf" } },
    "docs",
    {}
  );
  assert.equal(item.url, "https://x/f.pdf");
  assert.equal(item.name, "arena-docs-9");
});

test("blockToItem skips text blocks and imageless links", () => {
  assert.equal(blockToItem({ id: 1, class: "Text", content: "hi" }, "c", {}), null);
  assert.equal(blockToItem({ id: 2, class: "Link", source: { url: "https://x" } }, "c", {}), null);
});
