export function filterMenu(items, tag) {
  if (!tag || tag === "all") return items.slice();
  return items.filter((item) => item.tag === tag);
}

export function reservationValid({ name, email, date, party }) {
  const n = Number(party);
  return Boolean(
    name &&
      date &&
      typeof email === "string" &&
      email.includes("@") &&
      email.includes(".") &&
      Number.isInteger(n) &&
      n >= 2 &&
      n <= 8,
  );
}
