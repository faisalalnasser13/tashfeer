/**
 * Force every open tab onto the latest Hosting deploy.
 *
 * Vite hashes `/assets/*` (immutable). `index.html` and `version.json`
 * are served with no-cache. Each boot + every ~30s we fetch version.json;
 * a mismatch clears any Cache Storage and hard-reloads.
 */
export const APP_VERSION = __APP_VERSION__;

async function clearSiteCaches() {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch { /* ignore */ }
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch { /* ignore */ }
}

export async function checkForUpdate(): Promise<boolean> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { version?: string };
    if (!data.version || data.version === APP_VERSION) return false;
    await clearSiteCaches();
    // Hard navigation beats a soft reload against a cached shell.
    const url = new URL(location.href);
    url.searchParams.set("_v", data.version);
    location.replace(url.toString());
    return true;
  } catch {
    return false;
  }
}

export function startVersionWatch() {
  void clearSiteCaches(); // drop any leftover SW/cache from older experiments
  void checkForUpdate();

  const tick = () => { void checkForUpdate(); };
  const id = window.setInterval(tick, 30_000);
  const onVis = () => {
    if (document.visibilityState === "visible") tick();
  };
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("focus", tick);

  return () => {
    clearInterval(id);
    document.removeEventListener("visibilitychange", onVis);
    window.removeEventListener("focus", tick);
  };
}
