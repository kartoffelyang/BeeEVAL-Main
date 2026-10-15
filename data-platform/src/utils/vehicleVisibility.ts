/** Presentation policy only. Original records and identifiers stay unchanged. */
export function isHiddenVehicle(model: unknown): boolean {
  return /^(?:大众|一汽大众|上汽大众|volkswagen|vw(?:[\s._-]|$))/i.test(String(model ?? '').trim());
}

export function visibleVehicleData(value: any, field = ''): any {
  if (Array.isArray(value)) {
    return value.filter(item => !(item && typeof item === 'object' && isHiddenVehicle(item.brand_model)) && !(field === 'brand_models' && isHiddenVehicle(item))).map(item => visibleVehicleData(item));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([key]) => !(field === 'scores' && isHiddenVehicle(key.split('||')[0]))).map(([key, item]) => [key, visibleVehicleData(item, key)]));
  }
  return value;
}
