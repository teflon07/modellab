import { filterIncidents, sortIncidents } from "./logic.js";

const items = JSON.parse(document.getElementById("incident-data").textContent);
const body = document.querySelector("[data-board-body]");
let status = "all";
let key = "severity";

function row(item) {
  return `<tr><td>${item.id}</td><td>${item.yard}</td><td>${item.status}</td><td>${item.severity}</td><td>${item.blurb}</td></tr>`;
}

function render() {
  const shown = sortIncidents(filterIncidents(items, status), key);
  body.innerHTML = shown.map(row).join("");
}

document.querySelector("[data-testid=status-filter]").addEventListener("click", (ev) => {
  const btn = ev.target.closest("[data-status]");
  if (!btn) return;
  status = btn.dataset.status;
  document.querySelectorAll("[data-status]").forEach((b) => b.classList.toggle("on", b === btn));
  render();
});

document.querySelector("[data-testid=incident-sort]").addEventListener("click", (ev) => {
  const btn = ev.target.closest("[data-sort]");
  if (!btn) return;
  key = btn.dataset.sort;
  render();
});

const panel = document.querySelector("[data-testid=supervisor-panel]");
document.querySelector("[data-testid=crew-login]").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const payload = Object.fromEntries(new FormData(ev.target));
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    panel.textContent = "Denied.";
    return;
  }
  const priv = await fetch("/api/private");
  const note = priv.ok ? await priv.json() : {};
  panel.textContent = note.note ?? "On duty.";
});

document.querySelector("[data-logout]").addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  panel.textContent = "";
});

render();
