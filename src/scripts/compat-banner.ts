import { m } from "../i18n/client";
import { evaluate, readBrowser, type Verdict } from "../lib/compat";
import { getEngine } from "../lib/engine";

/*
 * The banner at the foot of the window says, on every page, when this browser may not run the demos. The
 * verdict is worked out once per page view; the last one is drawn at once on the next page, so the banner does
 * not blink while the router swaps pages. A closed banner stays closed for the session, unless the verdict changes.
 */

const KEY = "luz-compat-dismissed";
let last: Verdict | null = null;

function dismissedVerdict(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function paint(verdict: Verdict): void {
  const banner = document.querySelector<HTMLElement>("[data-compat-banner]");
  if (!banner) return;
  if (verdict === "compatible" || dismissedVerdict() === verdict) {
    banner.hidden = true;
    return;
  }
  const text = m().compat.verdicts[verdict];
  const error = verdict === "incompatible";
  banner.dataset.tone = error ? "error" : "warning";
  banner.querySelector("[data-banner-title]")!.textContent = text.title;
  banner.querySelector("[data-banner-body]")!.textContent = text.body;
  banner.querySelector<HTMLElement>(".compat-banner__text")!.title = `${text.title} ${text.body}`;
  banner.hidden = false;
}

document.addEventListener("astro:page-load", async () => {
  if (last) paint(last);
  const [info, states] = await Promise.all([readBrowser(), getEngine().status()]);
  last = evaluate(info, states).verdict;
  paint(last);
});

document.addEventListener("click", (event) => {
  if (!(event.target as Element | null)?.closest("[data-banner-close]")) return;
  const banner = document.querySelector<HTMLElement>("[data-compat-banner]");
  if (banner) banner.hidden = true;
  if (!last) return;
  try {
    sessionStorage.setItem(KEY, last);
  } catch {
    /* private window: it comes back on the next page */
  }
});
