import { InstanceCache } from "../cache";
import { AIEngineError, messageFor, normalizeError } from "../errors";
import type { Emitter } from "../events";
import { withAbort } from "../stream";
import type { AIEnvironment, ApiAvailability, ApiName } from "../types";

export interface AdapterDeps {
  env: AIEnvironment;
  emitter: Emitter;
  language: string;
}

export interface Adapter<Opts, Inst> {
  readonly api: ApiName;
  supported(): boolean;
  availability(opts: Opts): Promise<ApiAvailability>;
  get(opts: Opts, signal?: AbortSignal): Promise<Inst>;
  clear(): void;
}

interface ModelClass<Inst> {
  availability(options?: any): Promise<Availability>;
  create(options?: any): Promise<Inst>;
}

interface AdapterConfig<Opts, Inst extends { destroy(): unknown }> {
  api: ApiName;
  ctor(env: AIEnvironment): ModelClass<Inst> | undefined;
  /** The options `availability()` and `create()` share. */
  core(opts: Opts, deps: AdapterDeps): object;
  /** What only `create()` takes. */
  extras?(opts: Opts, deps: AdapterDeps): object;
  key(opts: Opts): string;
}

export function createAdapter<Opts, Inst extends { destroy(): unknown }>(
  deps: AdapterDeps,
  config: AdapterConfig<Opts, Inst>,
): Adapter<Opts, Inst> {
  const { api } = config;
  const cache = new InstanceCache<Inst>();
  const ctor = () => config.ctor(deps.env);

  const monitor = (m: CreateMonitor) =>
    m.addEventListener("downloadprogress", (e) =>
      deps.emitter.emit("download", { api, progress: e.loaded }),
    );

  return {
    api,
    supported: () => ctor() !== undefined,

    async availability(opts) {
      const cls = ctor();
      if (!cls) return "unsupported";
      try {
        return await cls.availability(config.core(opts, deps));
      } catch (err) {
        throw normalizeError(err, api);
      }
    },

    async get(opts, signal) {
      const cls = ctor();
      if (!cls) throw new AIEngineError("unsupported", messageFor("unsupported"), api);
      const core = config.core(opts, deps);
      // The instance is shared through the cache, so it must outlive the run that created it: Stop cancels the
      // creation (the download) through a controller of its own, which is let go as soon as the creation ends.
      const create = () => {
        const controller = new AbortController();
        const stop = () => controller.abort();
        signal?.addEventListener("abort", stop, { once: true });
        return cls
          .create({ ...core, ...config.extras?.(opts, deps), monitor, signal: controller.signal })
          .finally(() => signal?.removeEventListener("abort", stop));
      };
      for (let attempt = 0; ; attempt++) {
        try {
          const state = await withAbort(cls.availability(core), signal, api);
          if (state === "unavailable") {
            throw new AIEngineError("unavailable", messageFor("unavailable"), api);
          }
          return await withAbort(cache.get(config.key(opts), create), signal, api);
        } catch (err) {
          const error = normalizeError(err, api);
          // A creation shared with another run that pressed Stop ends aborted for this one too, which did not
          // press it: the cache has already dropped it, so this one starts again.
          if (error.code === "aborted" && !signal?.aborted && attempt < 1) continue;
          throw error;
        }
      }
    },

    clear: () => cache.clear(),
  };
}
