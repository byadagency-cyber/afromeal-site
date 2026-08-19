document.getElementById("year").textContent = new Date().getFullYear();

// Menu mobile
const navToggle = document.getElementById("navToggle");
const navLinks = document.getElementById("navLinks");
navToggle?.addEventListener("click", () => navLinks.classList.toggle("open"));
navLinks?.querySelectorAll("a").forEach((a) =>
  a.addEventListener("click", () => navLinks.classList.remove("open"))
);

// ---------- Infos pratiques (adresse, téléphone, horaires) ----------
let restaurantWhatsapp = "";

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
    if (info.coverImage) {
      const cover = document.getElementById("heroCoverPhoto");
      if (isVideoUrl(info.coverImage)) {
        cover.style.backgroundImage = "";
        cover.innerHTML = `<video src="${attrHTML(info.coverImage)}" autoplay muted loop playsinline></video>`;
      } else {
        cover.innerHTML = "";
        cover.style.backgroundImage = `url("${info.coverImage.replace(/"/g, "")}")`;
      }
      cover.classList.add("visible");
    }
    if (info.logo) {
      const logoImgHTML = `<img src="${attrHTML(info.logo)}" alt="AfroMeal" class="custom-logo-img" />`;
      ["headerLogoBadge", "footerLogoBadge", "mapLogoBadge"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = logoImgHTML;
      });
    }
    restaurantWhatsapp = (info.whatsapp || "").trim();
    updateWhatsappAvailability();
  } catch (e) {
    console.error("Impossible de charger les informations du restaurant.", e);
  }
}

// ---------- Menu dynamique ----------
const menuItemsById = {};

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
      menuItemsById[item.id] = item;
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
        <div class="card-grid">
          ${itemsByCategory[c.id]
            .map(
              (item) => `
            <div class="card">
              <div class="card-photo">
                ${item.image
                  ? `<img src="${attrHTML(item.image)}" alt="" loading="lazy" />`
                  : `<svg viewBox="0 0 24 24"><use href="#d-plate"/></svg>`}
                ${item.badge ? `<span class="card-badge">${escapeHTML(item.badge)}</span>` : ""}
                <span class="price-badge">${escapeHTML(item.price)}</span>
              </div>
              <div class="card-body">
                <h4>${escapeHTML(item.name)}</h4>
                ${item.description ? `<p>${escapeHTML(item.description)}</p>` : ""}
                <div class="card-footer">
                  <div class="qty-stepper" data-item-id="${item.id}">
                    <button type="button" class="qty-btn minus" aria-label="Retirer un ${attrHTML(item.name)}">
                      <svg viewBox="0 0 24 24"><use href="#i-minus"/></svg>
                    </button>
                    <span class="qty-value">0</span>
                    <button type="button" class="qty-btn plus" aria-label="Ajouter un ${attrHTML(item.name)}">
                      <svg viewBox="0 0 24 24"><use href="#i-plus"/></svg>
                    </button>
                  </div>
                </div>
              </div>
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

    contentEl.querySelectorAll(".qty-stepper").forEach((stepper) => {
      const id = stepper.dataset.itemId;
      stepper.querySelector(".plus").addEventListener("click", () => changeQty(id, 1));
      stepper.querySelector(".minus").addEventListener("click", () => changeQty(id, -1));
    });

    syncQtyDisplays();
  } catch (e) {
    contentEl.innerHTML = `<p class="menu-empty">Impossible de charger la carte pour le moment. Merci de réessayer plus tard.</p>`;
    console.error(e);
  }
}

function isVideoUrl(url) {
  return /\.(mp4|webm|mov)(\?.*)?$/i.test(String(url).trim());
}

// ---------- Avis clients ----------
async function loadReviews() {
  const section = document.getElementById("socialProof");
  const listEl = document.getElementById("reviewsList");
  if (!section || !listEl) return;
  try {
    const res = await fetch("/api/reviews");
    if (!res.ok) throw new Error("Erreur de chargement des avis");
    const data = await res.json();
    const reviews = Array.isArray(data.reviews) ? data.reviews : [];

    if (reviews.length === 0) {
      section.style.display = "none";
      listEl.innerHTML = "";
      return;
    }

    listEl.innerHTML = reviews
      .map((r) => {
        const rating = Math.max(1, Math.min(5, Number(r.rating) || 5));
        const stars = "★".repeat(rating) + "☆".repeat(5 - rating);
        return `
        <div class="review-item reveal in-view">
          <div class="stars">${stars}</div>
          <p class="quote">&laquo;&nbsp;${escapeHTML(r.text || "")}&nbsp;&raquo;</p>
          <p class="attribution">— ${escapeHTML(r.author || "")}</p>
        </div>`;
      })
      .join("");
    section.style.display = "";
  } catch (e) {
    console.error("Impossible de charger les avis.", e);
    section.style.display = "none";
  }
}

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
function attrHTML(str) {
  return escapeHTML(str).replace(/"/g, "&quot;");
}

// ---------- Panier ----------
const CART_STORAGE_KEY = "afromeal_cart";
let cart = {}; // { itemId: quantity }

function loadCartFromStorage() {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    cart = raw ? JSON.parse(raw) : {};
  } catch (e) {
    cart = {};
  }
}
function saveCartToStorage() {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  } catch (e) {
    /* stockage indisponible, tant pis */
  }
}

function changeQty(itemId, delta) {
  const current = cart[itemId] || 0;
  const next = Math.max(0, current + delta);
  if (next === 0) delete cart[itemId];
  else cart[itemId] = next;
  saveCartToStorage();
  syncQtyDisplays();
  renderCart();
}

function syncQtyDisplays() {
  document.querySelectorAll(".qty-stepper").forEach((stepper) => {
    const id = stepper.dataset.itemId;
    const qty = cart[id] || 0;
    stepper.querySelector(".qty-value").textContent = qty;
  });
  updateFabCount();
}

function parsePrice(priceStr) {
  if (!priceStr) return 0;
  const match = String(priceStr).match(/(\d+)[.,](\d+)/) || String(priceStr).match(/(\d+)/);
  if (!match) return 0;
  if (match[2] !== undefined) return parseFloat(`${match[1]}.${match[2]}`);
  return parseFloat(match[1]);
}
function formatPrice(num) {
  return num.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function cartCount() {
  return Object.values(cart).reduce((sum, qty) => sum + qty, 0);
}
function cartTotal() {
  return Object.entries(cart).reduce((sum, [id, qty]) => {
    const item = menuItemsById[id];
    return item ? sum + parsePrice(item.price) * qty : sum;
  }, 0);
}

function updateFabCount() {
  const countEl = document.getElementById("cartFabCount");
  const count = cartCount();
  if (count > 0) {
    countEl.textContent = count;
    countEl.style.display = "flex";
  } else {
    countEl.style.display = "none";
  }
}

// ---------- Suggestions de vente additionnelle (upsell) ----------
function getUpsellSuggestions() {
  const cartCategories = new Set(
    Object.keys(cart)
      .map((id) => menuItemsById[id]?.category)
      .filter(Boolean)
  );
  const wanted = ["boissons", "desserts", "sauces"];
  const suggestions = [];
  for (const catId of wanted) {
    if (cartCategories.has(catId)) continue;
    const candidate = Object.values(menuItemsById).find(
      (i) => i.category === catId && i.available !== false
    );
    if (candidate) suggestions.push(candidate);
    if (suggestions.length >= 2) break;
  }
  return suggestions;
}

function buildUpsellHTML() {
  const suggestions = getUpsellSuggestions();
  if (suggestions.length === 0) return "";
  return `
    <div class="cart-upsell">
      <p class="cart-upsell-label">Envie d&rsquo;ajouter&nbsp;?</p>
      <div class="cart-upsell-chips">
        ${suggestions
          .map(
            (item) => `
          <button type="button" class="upsell-chip" data-upsell-add="${item.id}">
            <span class="i-plus"><svg viewBox="0 0 24 24"><use href="#i-plus"/></svg></span>
            ${escapeHTML(item.name)} <span class="upsell-price">${escapeHTML(item.price)}</span>
          </button>`
          )
          .join("")}
      </div>
    </div>`;
}

function renderCart() {
  const itemsEl = document.getElementById("cartItems");
  const footerEl = document.getElementById("cartFooter");
  const entries = Object.entries(cart).filter(([id]) => menuItemsById[id]);

  if (entries.length === 0) {
    itemsEl.innerHTML = `<p class="cart-empty">Votre panier est vide. Ajoutez des plats depuis la carte&nbsp;!</p>`;
    footerEl.style.display = "none";
    updateFabCount();
    return;
  }

  itemsEl.innerHTML =
    entries
      .map(([id, qty]) => {
        const item = menuItemsById[id];
        const lineTotal = parsePrice(item.price) * qty;
        return `
        <div class="cart-item">
          ${item.image ? `<img class="cart-item-thumb" src="${attrHTML(item.image)}" alt="" />` : ""}
          <div class="cart-item-info">
            <h5>${escapeHTML(item.name)}</h5>
            <div class="cart-item-price">${qty} × ${escapeHTML(item.price)} = ${formatPrice(lineTotal)}</div>
          </div>
          <div class="cart-item-controls">
            <div class="qty-stepper" data-item-id="${id}">
              <button type="button" class="qty-btn minus" aria-label="Retirer un ${attrHTML(item.name)}">
                <svg viewBox="0 0 24 24"><use href="#i-minus"/></svg>
              </button>
              <span class="qty-value">${qty}</span>
              <button type="button" class="qty-btn plus" aria-label="Ajouter un ${attrHTML(item.name)}">
                <svg viewBox="0 0 24 24"><use href="#i-plus"/></svg>
              </button>
            </div>
            <button type="button" class="cart-item-remove" data-remove="${id}" aria-label="Supprimer ${attrHTML(item.name)} du panier">
              <svg viewBox="0 0 24 24"><use href="#i-trash"/></svg>
            </button>
          </div>
        </div>`;
      })
      .join("") + buildUpsellHTML();

  itemsEl.querySelectorAll(".qty-stepper").forEach((stepper) => {
    const id = stepper.dataset.itemId;
    stepper.querySelector(".plus").addEventListener("click", () => changeQty(id, 1));
    stepper.querySelector(".minus").addEventListener("click", () => changeQty(id, -1));
  });
  itemsEl.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      delete cart[btn.dataset.remove];
      saveCartToStorage();
      syncQtyDisplays();
      renderCart();
    });
  });
  itemsEl.querySelectorAll("[data-upsell-add]").forEach((btn) => {
    btn.addEventListener("click", () => changeQty(btn.dataset.upsellAdd, 1));
  });

  footerEl.style.display = "block";
  document.getElementById("cartTotal").textContent = formatPrice(cartTotal());
  updateWhatsappLink();
  updateFabCount();
}

function buildWhatsappMessage() {
  const lines = ["Bonjour AfroMeal, je souhaite passer la commande suivante :", ""];
  Object.entries(cart).forEach(([id, qty]) => {
    const item = menuItemsById[id];
    if (!item) return;
    const lineTotal = parsePrice(item.price) * qty;
    lines.push(`- ${qty}x ${item.name} — ${formatPrice(lineTotal)}`);
  });
  lines.push("");
  lines.push(`Total : ${formatPrice(cartTotal())}`);
  lines.push("");
  lines.push("(Merci de préciser : sur place ou à emporter, et l'heure souhaitée)");
  return lines.join("\n");
}

function updateWhatsappLink() {
  const btn = document.getElementById("cartWhatsappBtn");
  if (!btn) return;
  const digits = restaurantWhatsapp.replace(/[^\d]/g, "");
  if (!digits) {
    btn.href = "#";
    btn.setAttribute("aria-disabled", "true");
    return;
  }
  btn.removeAttribute("aria-disabled");
  btn.href = `https://wa.me/${digits}?text=${encodeURIComponent(buildWhatsappMessage())}`;
}

function updateWhatsappAvailability() {
  const noteEl = document.getElementById("cartWhatsappNote");
  const btn = document.getElementById("cartWhatsappBtn");
  if (!noteEl || !btn) return;
  const available = !!restaurantWhatsapp.trim();
  noteEl.style.display = available ? "none" : "block";
  btn.style.display = available ? "inline-flex" : "none";
  updateWhatsappLink();
}

function openCart() {
  document.getElementById("cartDrawer").classList.add("open");
  document.getElementById("cartOverlay").classList.add("open");
}
function closeCart() {
  document.getElementById("cartDrawer").classList.remove("open");
  document.getElementById("cartOverlay").classList.remove("open");
}

document.getElementById("cartFab")?.addEventListener("click", openCart);
document.getElementById("cartCloseBtn")?.addEventListener("click", closeCart);
document.getElementById("cartOverlay")?.addEventListener("click", closeCart);

loadCartFromStorage();
loadInfo();
loadMenu().then(() => renderCart());
loadReviews();

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
