/** Persistent game settings backed by localStorage. */

export type SettingKey = "shake" | "effects" | "fps";

const DEFAULTS: Record<SettingKey, boolean> = {
  shake: true,    // camera shake on hit / death
  effects: true,  // tracers + muzzle flash
  fps: false,     // FPS counter in HUD
};

function storageKey(k: SettingKey): string {
  return `vtx_${k}`;
}

export function getSetting(key: SettingKey): boolean {
  if (typeof window === "undefined") return DEFAULTS[key];
  const raw = window.localStorage.getItem(storageKey(key));
  return raw === null ? DEFAULTS[key] : raw === "true";
}

export function setSetting(key: SettingKey, value: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(key), String(value));
}
