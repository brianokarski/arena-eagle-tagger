import test from "node:test";
import assert from "node:assert/strict";
import { blockToItem, buildTags, sourceDomain } from "../src/sync.js";

// Shape matches the Are.na v3 API (see https://api.are.na/v3/openapi.json).
const imageBlock = {
  id: 123,
  type: "Image",
  title: "Nice Poster",
  description: { plain: "A poster I liked" },
  source: { url: "https://www.behance.net/gallery/1" },
  image: { src: "https://d2w9rnfcy7mm78.cloudfront.net/123/original_abc.jpg" },
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
  assert.equal(item.url, "https://d2w9rnfcy7mm78.cloudfront.net/123/original_abc.jpg");
  assert.equal(item.name, "Nice Poster");
  assert.equal(item.website, "https://www.are.na/block/123");
  assert.match(item.annotation, /A poster I liked/);
  assert.match(item.annotation, /behance\.net/);
});

test("blockToItem maps an attachment block", () => {
  const item = blockToItem(
    { id: 9, type: "Attachment", attachment: { url: "https://x/f.pdf" } },
    "docs",
    {}
  );
  assert.equal(item.url, "https://x/f.pdf");
  assert.equal(item.name, "arena-docs-9");
});

test("blockToItem uses the preview image for links and embeds", () => {
  const link = blockToItem(
    { id: 5, type: "Link", image: { src: "https://x/preview.png" }, source: { url: "https://x" } },
    "c",
    {}
  );
  assert.equal(link.url, "https://x/preview.png");
});

test("blockToItem skips text, channel, and imageless link blocks", () => {
  assert.equal(blockToItem({ id: 1, type: "Text", content: { plain: "hi" } }, "c", {}), null);
  assert.equal(blockToItem({ id: 2, type: "Link", source: { url: "https://x" } }, "c", {}), null);
  assert.equal(blockToItem({ id: 3, type: "Channel", title: "sub" }, "c", {}), null);
});
