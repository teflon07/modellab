export function filterIncidents(items, status) {
  if (!status || status === "all") return items.slice();
  return items.filter((item) => item.status === status);
}

export function sortIncidents(items, key) {
  const copy = items.slice();
  if (key === "severity") copy.sort((a, b) => b.severity - a.severity);
  return copy;
}
