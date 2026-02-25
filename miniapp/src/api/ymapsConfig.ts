/** Yandex Maps API key — set at startup from config.json / VITE_YANDEX_MAPS_KEY */
let _ymapsApiKey = '';

export function setYmapsApiKey(key: string): void {
  _ymapsApiKey = key;
}

export function getYmapsApiKey(): string {
  return _ymapsApiKey;
}
