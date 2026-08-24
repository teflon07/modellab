import { filterMenu, reservationValid } from "./logic.js";

const items = JSON.parse(document.getElementById("menu-data").textContent);
const list = document.querySelector("[data-testid=pastry-list]");

function render(tag) {
  const shown = filterMenu(items, tag);
  list.innerHTML = shown.map((item) =>
    `<article class="pastry"><div><b>${item.name}</b><div>${item.note}</div></div><span class="price">${item.price}</span></article>`
  ).join("");
}

document.querySelector("[data-testid=menu-filter]").addEventListener("click", (ev) => {
  const btn = ev.target.closest("[data-tag]");
  if (!btn) return;
  document.querySelectorAll("[data-tag]").forEach((b) => b.classList.toggle("on", b === btn));
  render(btn.dataset.tag);
});

document.querySelector("[data-testid=reserve-form]").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const data = Object.fromEntries(new FormData(ev.target));
  data.party = Number(data.party);
  ev.target.querySelector("[data-reserve-status]").textContent =
    reservationValid(data) ? "Table held." : "Check the party size and email.";
});

const panel = document.querySelector("[data-testid=member-panel]");
document.querySelector("[data-testid=member-login]").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const body = Object.fromEntries(new FormData(ev.target));
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    panel.textContent = "Could not sign in.";
    return;
  }
  const priv = await fetch("/api/private");
  const note = priv.ok ? await priv.json() : {};
  panel.textContent = note.note ?? "Signed in.";
});

document.querySelector("[data-logout]").addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  panel.textContent = "";
});

render("all");
