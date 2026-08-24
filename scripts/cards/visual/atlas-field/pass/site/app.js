import { filterNotes, searchNotes } from "./logic.js";

const items = JSON.parse(document.getElementById("note-data").textContent);
const list = document.querySelector("[data-testid=route-ledger]");
let region = "all";
let query = "";

function render() {
  const shown = searchNotes(filterNotes(items, region), query);
  list.innerHTML = shown.map((item) =>
    `<article class="note"><div><h3>${item.title}</h3><p>${item.body}</p></div><span class="region">${item.region}</span></article>`
  ).join("");
}

document.querySelector("[data-testid=region-filter]").addEventListener("click", (ev) => {
  const btn = ev.target.closest("[data-region]");
  if (!btn) return;
  region = btn.dataset.region;
  document.querySelectorAll("[data-region]").forEach((b) => b.classList.toggle("on", b === btn));
  render();
});

document.querySelector("[data-testid=note-search]").addEventListener("input", (ev) => {
  query = ev.target.value;
  render();
});

const panel = document.querySelector("[data-testid=private-panel]");
document.querySelector("[data-testid=author-login]").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const payload = Object.fromEntries(new FormData(ev.target));
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    panel.textContent = "Unknown author.";
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

render();
