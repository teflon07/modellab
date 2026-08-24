export function filterNotes(items, region) {
  if (!region || region === "all") return items.slice();
  return items.filter((item) => item.region === region);
}

export function searchNotes(items, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return items.slice();
  return items.filter((item) =>
    String(item.title || "").toLowerCase().includes(q) ||
    String(item.body || "").toLowerCase().includes(q),
  );
}
