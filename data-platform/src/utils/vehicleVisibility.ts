/** Brand visibility follows server-side account authorization; no brand is hidden in the UI. */
export function isHiddenVehicle(_model: unknown): boolean {
  return false;
}

/** Preserve the authorized API response, including Volkswagen rows, facets and scores. */
export function visibleVehicleData(value: any): any {
  return value;
}
