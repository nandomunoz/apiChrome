import { describe, expect, it } from "vitest";
import type { ApiAvailability, ApiName } from "@engine";
import { evaluate, readBrowser, type BrowserInfo } from "../src/lib/compat";

const API_LIST: ApiName[] = ["prompt", "summarizer", "translator", "detector", "proofreader", "writer", "rewriter"];

const states = (over: Partial<Record<ApiName, ApiAvailability>> = {}): Record<ApiName, ApiAvailability> =>
  Object.fromEntries(API_LIST.map((api) => [api, over[api] ?? "available"])) as Record<ApiName, ApiAvailability>;

const chrome = (over: Partial<BrowserInfo> = {}): BrowserInfo => ({
  userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
  brands: [{ brand: "Chromium", version: "140" }, { brand: "Google Chrome", version: "140" }, { brand: "Not=A?Brand", version: "24" }],
  mobile: false,
  platform: "Linux",
  cores: 8,
  memoryGb: 8,
  gpu: { state: "adapter", name: "Some GPU" },
  ...over,
});

const detail = (info: BrowserInfo, s: ReturnType<typeof states>, id: string) => evaluate(info, s).checks.find((c) => c.id === id)?.detail;

describe("compatibility", () => {
  it("accepts desktop Chrome with a ready model", () => {
    expect(evaluate(chrome(), states()).verdict).toBe("compatible");
  });

  it("accepts the stable APIs without the optional ones", () => {
    const s = states({ proofreader: "unsupported", writer: "unsupported", rewriter: "unsupported" });
    expect(evaluate(chrome(), s).verdict).toBe("compatible");
    expect(detail(chrome(), s, "apis")).toBe("apisOptional");
  });

  it("rejects an old Chrome", () => {
    const old = chrome({ brands: [{ brand: "Google Chrome", version: "120" }] });
    expect(evaluate(old, states()).verdict).toBe("incompatible");
    expect(detail(old, states(), "browser")).toBe("browserOld");
  });

  it("asks to update a Chrome that has the task APIs but not the Prompt API", () => {
    const s = states({ prompt: "unsupported" });
    const browser = evaluate(chrome(), s).checks.find((c) => c.id === "browser");
    expect(browser).toMatchObject({ status: "warn", detail: "browserNoPrompt", args: [140, 148] });
    // Without the Prompt API there is no model to check, so the device still cannot run most demos
    expect(evaluate(chrome(), s).verdict).toBe("incompatible");
  });

  it("does not look at the version when the Prompt API is there", () => {
    expect(detail(chrome(), states(), "browser")).toBe("browserChrome");
    expect(detail(chrome(), states({ prompt: "downloadable" }), "browser")).toBe("browserChrome");
  });

  it("accepts Chrome 148 and rejects 137 whatever the APIs say", () => {
    const at = (version: number) => chrome({ brands: [{ brand: "Google Chrome", version: String(version) }] });
    expect(detail(at(148), states({ prompt: "unsupported" }), "browser")).toBe("browserChrome");
    expect(detail(at(138), states({ prompt: "unsupported" }), "browser")).toBe("browserNoPrompt");
    expect(detail(at(137), states(), "browser")).toBe("browserOld");
  });

  it("does not fail a device because Chrome was slow to answer", () => {
    const report = evaluate(chrome(), states({ prompt: "unknown" }));
    expect(report.checks.find((c) => c.id === "model")).toMatchObject({ status: "info", detail: "modelUnknown" });
    expect(report.verdict).not.toBe("incompatible");
  });

  it("rejects browsers that are not Chrome", () => {
    const firefox = { userAgent: "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0", gpu: { state: "unsupported" as const } };
    const report = evaluate(firefox, states({ prompt: "unsupported", summarizer: "unsupported", translator: "unsupported", detector: "unsupported", proofreader: "unsupported", writer: "unsupported", rewriter: "unsupported" }));
    expect(report.verdict).toBe("incompatible");
    expect(report.checks.find((c) => c.id === "browser")?.detail).toBe("browserOther");
    expect(report.checks.find((c) => c.id === "apis")?.detail).toBe("apisNone");
  });

  it("rejects mobile", () => {
    const phone = chrome({ mobile: true, platform: "Android" });
    expect(evaluate(phone, states()).verdict).toBe("incompatible");
    expect(detail(phone, states(), "system")).toBe("systemMobile");
  });

  it("asks to check a Chromium browser that is not Chrome", () => {
    const edge = chrome({ brands: [{ brand: "Chromium", version: "140" }, { brand: "Microsoft Edge", version: "140" }] });
    expect(evaluate(edge, states()).verdict).toBe("check");
    expect(detail(edge, states(), "browser")).toBe("browserChromium");
  });

  it("fails when Chrome says the model is unavailable", () => {
    expect(evaluate(chrome(), states({ prompt: "unavailable" })).verdict).toBe("incompatible");
  });

  it("counts hardware warnings only while the model is not ready", () => {
    const weak = chrome({ cores: 2, memoryGb: 4, gpu: { state: "none" } });
    expect(evaluate(weak, states()).verdict).toBe("compatible");
    expect(evaluate(weak, states({ prompt: "downloadable" })).verdict).toBe("check");
  });

  it("reads the memory hint without claiming more than it says", () => {
    expect(detail(chrome({ memoryGb: 16 }), states(), "memory")).toBe("memoryOk");
    expect(detail(chrome({ memoryGb: 8 }), states(), "memory")).toBe("memoryCapped");
    expect(detail(chrome({ memoryGb: 4 }), states(), "memory")).toBe("memoryLow");
  });

  it("is compatible while the model still has to be downloaded", () => {
    expect(evaluate(chrome(), states({ prompt: "downloadable" })).verdict).toBe("compatible");
  });
});

describe("reading the browser", () => {
  const nav = { userAgent: "ua", hardwareConcurrency: 4, deviceMemory: 8 };

  it("reports a WebGPU adapter and its name", async () => {
    const info = await readBrowser({ ...nav, gpu: { requestAdapter: async () => ({ info: { description: "GPU X" } }) } });
    expect(info.gpu).toEqual({ state: "adapter", name: "GPU X" });
    expect(info.cores).toBe(4);
  });

  it("tells no adapter, a failure and a missing WebGPU apart", async () => {
    expect((await readBrowser({ ...nav, gpu: { requestAdapter: async () => null } })).gpu.state).toBe("none");
    expect((await readBrowser({ ...nav, gpu: { requestAdapter: async () => { throw new Error("x"); } } })).gpu.state).toBe("none");
    expect((await readBrowser(nav)).gpu.state).toBe("unsupported");
  });
});
