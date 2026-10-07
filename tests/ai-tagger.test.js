import test from "node:test";
import assert from "node:assert/strict";
import { buildOpenAiRequest, buildPrompt, buildSchema, expandParents, vocabularyOf } from "../src/ai-tagger.js";

const taxonomy = { photography: ["portrait", "studio"], poster: [], typography: ["serif"] };

test("vocabularyOf flattens categories and subcategories", () => {
  assert.deepEqual(vocabularyOf(taxonomy), ["photography", "portrait", "studio", "poster", "typography", "serif"]);
});

test("expandParents adds the parent category of a subcategory", () => {
  assert.deepEqual(expandParents(["portrait", "poster"], taxonomy).sort(), ["photography", "portrait", "poster"]);
});

test("buildSchema restricts tags to the vocabulary and makes extra optional", () => {
  const vocab = vocabularyOf(taxonomy);
  assert.deepEqual(buildSchema(vocab, false).required, ["tags"]);
  const withExtra = buildSchema(vocab, true);
  assert.deepEqual(withExtra.required, ["tags", "extra"]);
  assert.deepEqual(withExtra.properties.tags.items.enum, vocab);
});

test("buildPrompt lists every category with its subcategories", () => {
  const prompt = buildPrompt(taxonomy, false, 3);
  assert.match(prompt, /- photography: portrait, studio/);
  assert.match(prompt, /- poster\n/);
});

test("buildOpenAiRequest sends the image as a data URL with a strict schema", () => {
  const schema = buildSchema(vocabularyOf(taxonomy), true);
  const req = buildOpenAiRequest({ model: "m", schema, prompt: "p", buf: Buffer.from("hi"), mediaType: "image/png" });
  assert.equal(req.messages[0].content[1].image_url.url, "data:image/png;base64,aGk=");
  assert.equal(req.response_format.json_schema.strict, true);
  assert.equal(req.response_format.json_schema.schema, schema);
});
