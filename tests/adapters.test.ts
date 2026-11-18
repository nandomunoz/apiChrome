import { describe, expect, it } from "vitest";
import type { AIEnvironment } from "@engine";
import { Emitter } from "../src/lib/ai-engine-local/events";
import { createSummarizerAdapter } from "../src/lib/ai-engine-local/adapters/summarizer";
import { readChunks } from "../src/lib/ai-engine-local/stream";

const OPTIONS = { type: "key-points", length: "medium", format: "markdown" } as const;

/** A Summarizer whose creations the test controls: each call is recorded and finishes when the test says so. */
function controlledSummarizer() {
  const creations: { options: Record<string, unknown>; finish(): void }[] = [];
  const Summarizer = {
    availability: async () => "available",
    create: (options: Record<string, unknown>) =>
      new Promise((resolve, reject) => {
        const instance = { destroy() {} };
        creations.push({ options, finish: () => resolve(instance) });
        (options.signal as AbortSignal | undefined)?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }),
  };
  const adapter = createSummarizerAdapter({ env: { Summarizer } as unknown as AIEnvironment, emitter: new Emitter(), language: "en" });
  return { adapter, creations };
}

describe("a stream that is stopped", () => {
  it("is an abort when Stop lands during a pending read, not a finished answer", async () => {
    const controller = new AbortController();
    const stream = new ReadableStream<string>({ start: (c) => c.enqueue("a") });
    const chunks = readChunks(stream, controller.signal);
    expect((await chunks.next()).value).toBe("a");
    const pending = chunks.next();
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "aborted" });
  });

  it("still ends normally when nobody stops it", async () => {
    const chunks = readChunks(new ReadableStream<string>({ start: (c) => (c.enqueue("a"), c.close()) }), new AbortController().signal);
    expect((await Array.fromAsync(chunks)).join("")).toBe("a");
  });
});

describe("creating a model instance", () => {
  it("gives the creation a signal of its own, so Stop later does not destroy the shared instance", async () => {
    const { adapter, creations } = controlledSummarizer();
    const run = new AbortController();
    const got = adapter.get(OPTIONS, run.signal);
    await Promise.resolve();
    await Promise.resolve();
    creations[0]!.finish();
    await got;
    const creationSignal = creations[0]!.options.signal as AbortSignal;
    expect(creationSignal).not.toBe(run.signal);
    run.abort();
    expect(creationSignal.aborted).toBe(false);
  });

  it("cancels the creation, and so the download, when Stop is pressed while it runs", async () => {
    const { adapter, creations } = controlledSummarizer();
    const run = new AbortController();
    const got = adapter.get(OPTIONS, run.signal);
    await Promise.resolve();
    await Promise.resolve();
    run.abort();
    await expect(got).rejects.toMatchObject({ code: "aborted" });
    expect((creations[0]!.options.signal as AbortSignal).aborted).toBe(true);
  });

  it("tries again for a caller whose shared creation was stopped by another run", async () => {
    const { adapter, creations } = controlledSummarizer();
    const first = new AbortController();
    const second = new AbortController();
    const a = adapter.get(OPTIONS, first.signal);
    const b = adapter.get(OPTIONS, second.signal);
    await Promise.resolve();
    await Promise.resolve();
    expect(creations).toHaveLength(1);
    first.abort();
    await expect(a).rejects.toMatchObject({ code: "aborted" });
    // The second run never pressed Stop: it asks for a new creation instead of failing.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(creations).toHaveLength(2);
    creations[1]!.finish();
    await expect(b).resolves.toBeDefined();
  });

  it("does not make a new instance for each context text", async () => {
    const { adapter, creations } = controlledSummarizer();
    const one = adapter.get({ ...OPTIONS, context: "a legal text" });
    await Promise.resolve();
    await Promise.resolve();
    creations[0]!.finish();
    await one;
    await adapter.get({ ...OPTIONS, context: "a news article" });
    expect(creations).toHaveLength(1);
    expect(creations[0]!.options).not.toHaveProperty("sharedContext");
  });
});
