document.getElementById("year").textContent = new Date().getFullYear();
// Menu mobile
const navToggle = document.getElementById("navToggle");
const navLinks = document.getElementById("navLinks");
navToggle?.addEventListener("click", () => navLinks.classList.toggle("open"));
navLinks?.querySelectorAll("a").forEach((a) =>
a.addEventListener("click", () => navLinks.classList.remove("open"))
);

// ---------- Infos pratiques (adresse, téléphone, horaires) ----------
async function loadInfo() {
try {
const res = await fetch("/api/info");
const info = await res.json();

if (info.intro) document.getElementById("heroIntro").textContent = info.intro;
if (info.address) document.getElementById("infoAddress").textContent = info.address;
if (info.phone) {
const phoneEl = document.getElementById("infoPhone");
phoneEl.textContent = info.phone;
phoneEl.href = "tel:" + info.phone.replace(/\s+/g, "");
}
if (info.instagram) {
const igEl = document.getElementById("infoInstagram");
igEl.href = info.instagram;
}
if (info.highlight) {
document.getElementById("highlightBar").innerHTML = info.highlight;
}
if (Array.isArray(info.hours)) {
const table = document.getElementById("hoursTable");
table.innerHTML = info.hours
.map((h) => `<tr><td>${h.days}</td><td>${h.times}</td></tr>`)
.join("");
}
} catch (e) {
console.error("Impossible de charger les informations du restaurant.", e);
}
}

// ---------- Menu dynamique ----------
async function loadMenu() {
const tabsEl = document.getElementById("menuTabs");
const contentEl = document.getElementById("menuContent");

try {
const res = await fetch("/api/menu");
if (!res.ok) throw new Error("Erreur de chargement");
const data = await res.json();

const categories = [...data.categories].sort((a, b) => a.order - b.order);
const itemsByCategory = {};
for (const cat of categories) itemsByCategory[cat.id] = [];
for (const item of data.items) {
if (!itemsByCategory[item.category]) itemsByCategory[item.category] = [];
itemsByCategory[item.category].push(item);
}

const visibleCategories = categories.filter(
(c) => (itemsByCategory[c.id] || []).length > 0
);

if (visibleCategories.length === 0) {
contentEl.innerHTML = `<p class="menu-empty">La carte sera bientôt disponible — revenez vite !</p>`;
return;
}

// Onglets
tabsEl.innerHTML = visibleCategories
.map(
(c, i) =>
`<button class="menu-tab ${i === 0 ? "active" : ""}" data-cat="${c.id}">${c.name}</button>`
)
.join("");

// Sections
contentEl.innerHTML = visibleCategories
.map(
(c) => `
<div class="menu-category" data-cat-section="${c.id}" style="${c === visibleCategories[0] ? "" : "display:none;"}">
<h3>${c.name}</h3>
<div class="menu-items">
${itemsByCategory[c.id]
.map(
(item) => `
<div class="menu-item">
<div class="menu-item-main">
<h4>${escapeHTML(item.name)}</h4>
${item.description ? `<p>${escapeHTML(item.description)}</p>` : ""}
</div>
<div class="price">${escapeHTML(item.price)}</div>
</div>`
)
.join("")}
</div>
</div>`
)
.join("");

tabsEl.querySelectorAll(".menu-tab").forEach((tab) => {
tab.addEventListener("click", () => {
tabsEl.querySelectorAll(".menu-tab").forEach((t) => t.classList.remove("active"));
tab.classList.add("active");
const cat = tab.dataset.cat;
contentEl.querySelectorAll("[data-cat-section]").forEach((sec) => {
sec.style.display = sec.dataset.catSection === cat ? "" : "none";
});
});
});
} catch (e) {
contentEl.innerHTML = `<p class="menu-empty">Impossible de charger la carte pour le moment. Merci de réessayer plus tard.</p>`;
console.error(e);
}
}

function escapeHTML(str) {
const div = document.createElement("div");
div.textContent = str;
return div.innerHTML;
}

loadInfo();
loadMenu();

// ---------- Révélation au défilement ----------
const revealEls = document.querySelectorAll(".reveal:not(.in-view)");
if ("IntersectionObserver" in window && revealEls.length) {
const io = new IntersectionObserver(
(entries) => {
entries.forEach((entry) => {
if (entry.isIntersecting) {
entry.target.classList.add("in-view");
io.unobserve(entry.target);
}
});
},
{ threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
);
revealEls.forEach((el) => io.observe(el));
} else {
revealEls.forEach((el) => el.classList.add("in-view"));
}
