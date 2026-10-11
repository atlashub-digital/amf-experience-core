import assert from "node:assert/strict";
import { test } from "node:test";
import {
  conservativeAccessResolver,
  createReaderModel,
  defineAgent,
  defineModules,
  moduleEnabled,
} from "../src/index.js";

test("module manifest supports simple and configured modules", () => {
  const modules = defineModules({
    library: true,
    companion: { enabled: true, adapter: "atendimento.center" },
  });
  assert.equal(moduleEnabled(modules, "library"), true);
  assert.equal(moduleEnabled(modules, "companion"), true);
  assert.equal(moduleEnabled(modules, "commerce"), false);
});

test("conservative resolver never infers paid access", async () => {
  const decision = await conservativeAccessResolver.resolve(
    { mode: "one-time", productRefs: ["product-1"] },
    { authenticated: true, productRefs: ["product-1"] },
  );
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "resolver-required");
});

test("public access is allowed without auth", async () => {
  const decision = await conservativeAccessResolver.resolve(
    { mode: "public" },
    { authenticated: false },
  );
  assert.equal(decision.allowed, true);
});

test("companion cannot be configured as public", () => {
  assert.throws(() =>
    defineAgent({
      id: "unsafe",
      mode: "companion",
      provider: "test",
      agentRef: "agent",
      public: true,
      memory: "consented",
    }),
  );
});

test("reader model sorts chapters", () => {
  const publication = {
    schemaVersion: "0.1" as const,
    id: "p1",
    slug: "p1",
    type: "book" as const,
    status: "published" as const,
    locale: "pt-BR",
    title: "Book",
    authors: [],
    tags: [],
    chapters: [
      { id: "b", slug: "b", title: "B", order: 2 },
      { id: "a", slug: "a", title: "A", order: 1 },
    ],
    media: [],
    access: { mode: "public" as const },
  };
  const model = createReaderModel(publication);
  assert.deepEqual(model.chapters.map((chapter) => chapter.id), ["a", "b"]);
});
