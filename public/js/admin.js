const TOKEN_KEY = "afromeal_admin_token";

const loginScreen = document.getElementById("loginScreen");
const adminShell = document.getElementById("adminShell");
const toastEl = document.getElementById("toast");

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}
function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function showToast(message, isError = false) {
  toastEl.textContent = message;
  toastEl.classList.toggle("error", isError);
  toastEl.style.display = "block";
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => (toastEl.style.display = "none"), 3200);
}

async function apiFetch(url, options = {}) {
  const token = getToken();
  const headers = Object.assign(
    { "Content-Type": "application/json" },
    options.headers || {},
    token ? { Authorization: "Bearer " + token } : {}
  );
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    clearToken();
    showLogin();
    throw new Error("Session expirée, merci de vous reconnecter.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Une erreur est survenue.");
  return data;
}

async function uploadFile(file) {
  const token = getToken();
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/admin/upload", {
    method: "POST",
    headers: token ? { Authorization: "Bearer " + token } : {},
    body: formData,
  });
  if (res.status === 401) {
    clearToken();
    showLogin();
    throw new Error("Session expirée, merci de vous reconnecter.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Échec de l'envoi du fichier.");
  return data.url;
}

function isVideoFileUrl(url) {
  return /\.(mp4|webm|mov)(\?.*)?$/i.test(String(url || "").trim());
}

function renderUploadPreview(el, url, emptyLabel) {
  if (!el) return;
  const trimmed = (url || "").trim();
  if (!trimmed) {
    el.textContent = emptyLabel || "Aucun fichier";
    return;
  }
  if (isVideoFileUrl(trimmed)) {
    el.innerHTML = `<video src="${attr(trimmed)}" muted></video>`;
  } else {
    el.innerHTML = `<img src="${attr(trimmed)}" alt="" />`;
  }
}

function showLogin() {
  loginScreen.style.display = "flex";
  adminShell.classList.remove("visible");
}
function showAdmin() {
  loginScreen.style.display = "none";
  adminShell.classList.add("visible");
  loadMenuPanel();
  loadInfoPanel();
  loadReviewsPanel();
}

// ---------- Connexion ----------
document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const password = document.getElementById("password").value;
  const errorEl = document.getElementById("loginError");
  errorEl.textContent = "";
  try {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Connexion impossible.");
    setToken(data.token);
    document.getElementById("password").value = "";
    showAdmin();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  try {
    await apiFetch("/api/admin/logout", { method: "POST" });
  } catch (e) {
    /* ignore */
  }
  clearToken();
  showLogin();
});

// ---------- Navigation entre panneaux ----------
document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.panel).classList.add("active");
  });
});

// ---------- Panel Menu ----------
function slugify(str) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 24) || "categorie";
}

async function loadMenuPanel() {
  const container = document.getElementById("categoriesContainer");
  container.innerHTML = "<p>Chargement…</p>";
  try {
    const menu = await apiFetch("/api/admin/menu");
    renderMenu(menu);
  } catch (err) {
    container.innerHTML = `<p class="error-msg">${err.message}</p>`;
  }
}

function renderMenu(menu) {
  const container = document.getElementById("categoriesContainer");
  const categories = [...menu.categories].sort((a, b) => a.order - b.order);
  container.innerHTML = "";

  if (categories.length === 0) {
    container.innerHTML = "<p>Aucune catégorie pour l'instant. Créez-en une pour commencer.</p>";
    return;
  }

  categories.forEach((cat) => {
    const items = menu.items.filter((i) => i.category === cat.id);
    const block = document.createElement("div");
    block.className = "category-block";
    block.innerHTML = `
      <div class="category-block-head">
        <h3>${escapeHTML(cat.name)}</h3>
        <button class="btn btn-outline btn-sm" data-delete-cat="${cat.id}">🗑 Supprimer la catégorie</button>
      </div>
      <div class="item-row head">
        <div>Nom du plat</div><div>Description</div><div>Prix</div><div>Badge</div><div>Photo</div><div>Visible</div><div></div><div></div>
      </div>
      <div class="items-list"></div>
      <div class="add-item-form" data-add-form="${cat.id}">
        <input placeholder="Nom du nouveau plat" data-field="name" />
        <input placeholder="Description (optionnel)" data-field="description" />
        <input placeholder="Prix (ex: 12,90 €)" data-field="price" />
        <input placeholder="Badge (ex: Populaire)" data-field="badge" />
        <div class="photo-field">
          <input placeholder="Photo (URL, optionnel)" data-field="image" />
          <label class="upload-btn-sm" title="Envoyer une photo">📷<input type="file" accept="image/*" data-upload-image hidden /></label>
        </div>
        <button class="btn btn-secondary btn-sm" data-add-item="${cat.id}">+ Ajouter</button>
      </div>
    `;
    const itemsList = block.querySelector(".items-list");
    items.forEach((item) => itemsList.appendChild(renderItemRow(item)));
    container.appendChild(block);
    wireUploadButtons(block);
  });

  container.querySelectorAll("[data-delete-cat]").forEach((btn) => {
    btn.addEventListener("click", () => deleteCategory(btn.dataset.deleteCat));
  });
  container.querySelectorAll("[data-add-item]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const form = btn.closest("[data-add-form]");
      const catId = form.dataset.addForm;
      const name = form.querySelector('[data-field="name"]').value.trim();
      const description = form.querySelector('[data-field="description"]').value.trim();
      const price = form.querySelector('[data-field="price"]').value.trim();
      const badge = form.querySelector('[data-field="badge"]').value.trim();
      const image = form.querySelector('[data-field="image"]').value.trim();
      if (!name || !price) {
        showToast("Nom et prix sont requis.", true);
        return;
      }
      addItem(catId, { name, description, price, badge, image }, form);
    });
  });
}

function wireUploadButtons(scopeEl) {
  scopeEl.querySelectorAll("[data-upload-image]").forEach((fileInput) => {
    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const photoField = fileInput.closest(".photo-field");
      const textInput = photoField.querySelector('[data-field="image"]');
      try {
        showToast("Envoi de la photo…");
        const url = await uploadFile(file);
        textInput.value = url;
        // Pour un plat déjà existant, on enregistre tout de suite : pas besoin
        // de cliquer sur « Enregistrer » en plus, ça évite d'oublier cette étape.
        const row = fileInput.closest(".item-row");
        const saveBtn = row ? row.querySelector("[data-save]") : null;
        if (saveBtn) {
          showToast("Photo envoyée, enregistrement…");
          saveBtn.click();
        } else {
          showToast("Photo envoyée ✅");
        }
      } catch (err) {
        showToast(err.message, true);
      }
    });
  });
}

function renderItemRow(item) {
  const row = document.createElement("div");
  row.className = "item-row" + (item.available === false ? " unavailable" : "");
  row.innerHTML = `
    <input value="${attr(item.name)}" data-field="name" />
    <input value="${attr(item.description || "")}" data-field="description" />
    <input value="${attr(item.price)}" data-field="price" />
    <input value="${attr(item.badge || "")}" data-field="badge" placeholder="ex: Populaire" />
    <div class="photo-field">
      <input value="${attr(item.image || "")}" data-field="image" placeholder="URL de la photo" />
      <label class="upload-btn-sm" title="Envoyer une photo">📷<input type="file" accept="image/*" data-upload-image hidden /></label>
    </div>
    <button class="pill-toggle ${item.available === false ? "off" : "on"}" data-toggle-available>
      ${item.available === false ? "Masqué" : "Visible"}
    </button>
    <button class="btn btn-outline btn-sm" data-save>💾 Enregistrer</button>
    <button class="btn btn-danger btn-sm" data-delete>🗑</button>
  `;

  let currentAvailable = item.available !== false;

  row.querySelector("[data-toggle-available]").addEventListener("click", (e) => {
    currentAvailable = !currentAvailable;
    e.target.textContent = currentAvailable ? "Visible" : "Masqué";
    e.target.classList.toggle("on", currentAvailable);
    e.target.classList.toggle("off", !currentAvailable);
    row.classList.toggle("unavailable", !currentAvailable);
  });

  row.querySelector("[data-save]").addEventListener("click", async () => {
    const name = row.querySelector('[data-field="name"]').value.trim();
    const description = row.querySelector('[data-field="description"]').value.trim();
    const price = row.querySelector('[data-field="price"]').value.trim();
    const badge = row.querySelector('[data-field="badge"]').value.trim();
    const image = row.querySelector('[data-field="image"]').value.trim();
    try {
      await apiFetch(`/api/admin/menu/items/${item.id}`, {
        method: "PUT",
        body: JSON.stringify({ name, description, price, badge, image, available: currentAvailable }),
      });
      showToast("Plat mis à jour ✅");
    } catch (err) {
      showToast(err.message, true);
    }
  });

  row.querySelector("[data-delete]").addEventListener("click", async () => {
    if (!confirm(`Supprimer « ${item.name} » de la carte ?`)) return;
    try {
      await apiFetch(`/api/admin/menu/items/${item.id}`, { method: "DELETE" });
      showToast("Plat supprimé.");
      loadMenuPanel();
    } catch (err) {
      showToast(err.message, true);
    }
  });

  return row;
}

async function addItem(categoryId, payload, formEl) {
  try {
    await apiFetch("/api/admin/menu/items", {
      method: "POST",
      body: JSON.stringify({ category: categoryId, ...payload }),
    });
    showToast("Plat ajouté ✅");
    loadMenuPanel();
  } catch (err) {
    showToast(err.message, true);
  }
}

async function deleteCategory(id) {
  if (!confirm("Supprimer cette catégorie ? (uniquement possible si elle est vide)")) return;
  try {
    await apiFetch(`/api/admin/menu/categories/${id}`, { method: "DELETE" });
    showToast("Catégorie supprimée.");
    loadMenuPanel();
  } catch (err) {
    showToast(err.message, true);
  }
}

document.getElementById("addCategoryBtn").addEventListener("click", async () => {
  const name = prompt("Nom de la nouvelle catégorie (ex : Boissons chaudes) :");
  if (!name || !name.trim()) return;
  const id = slugify(name);
  try {
    await apiFetch("/api/admin/menu/categories", {
      method: "POST",
      body: JSON.stringify({ id, name: name.trim() }),
    });
    showToast("Catégorie créée ✅");
    loadMenuPanel();
  } catch (err) {
    showToast(err.message, true);
  }
});

// ---------- Panel Infos du restaurant ----------
let hoursRows = [];

async function loadInfoPanel() {
  try {
    const info = await apiFetch("/api/info");
    document.getElementById("infoName").value = info.name || "";
    document.getElementById("infoIntro").value = info.intro || "";
    document.getElementById("infoAddress").value = info.address || "";
    document.getElementById("infoPhone").value = info.phone || "";
    document.getElementById("infoInstagram").value = info.instagram || "";
    document.getElementById("infoWhatsapp").value = info.whatsapp || "";
    document.getElementById("infoUberEats").value = info.ubereats || "";
    document.getElementById("infoDeliveroo").value = info.deliveroo || "";
    document.getElementById("infoLogo").value = info.logo || "";
    renderUploadPreview(document.getElementById("logoPreview"), info.logo, "Aucun logo");
    document.getElementById("infoCoverImage").value = info.coverImage || "";
    renderUploadPreview(document.getElementById("coverPreview"), info.coverImage, "Aucun fichier");
    document.getElementById("infoHighlight").value = info.highlight || "";
    hoursRows = Array.isArray(info.hours) ? [...info.hours] : [];
    renderHoursRows();
  } catch (err) {
    showToast(err.message, true);
  }
}

function renderHoursRows() {
  const container = document.getElementById("hoursContainer");
  container.innerHTML = "";
  hoursRows.forEach((row, idx) => {
    const el = document.createElement("div");
    el.className = "hours-row";
    el.innerHTML = `
      <input placeholder="Jours (ex : Mardi – Vendredi)" value="${attr(row.days)}" data-hours-days />
      <input placeholder="Horaires (ex : 11h30 – 14h00)" value="${attr(row.times)}" data-hours-times />
      <button type="button" class="btn btn-danger btn-sm">🗑</button>
    `;
    el.querySelector("[data-hours-days]").addEventListener("input", (e) => (hoursRows[idx].days = e.target.value));
    el.querySelector("[data-hours-times]").addEventListener("input", (e) => (hoursRows[idx].times = e.target.value));
    el.querySelector("button").addEventListener("click", () => {
      hoursRows.splice(idx, 1);
      renderHoursRows();
    });
    container.appendChild(el);
  });
}

document.getElementById("addHoursRow").addEventListener("click", () => {
  hoursRows.push({ days: "", times: "" });
  renderHoursRows();
});

// ---------- Upload logo & couverture (photo/vidéo) ----------
document.getElementById("logoFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const statusEl = document.getElementById("logoUploadStatus");
  statusEl.textContent = "Envoi en cours…";
  try {
    const url = await uploadFile(file);
    document.getElementById("infoLogo").value = url;
    renderUploadPreview(document.getElementById("logoPreview"), url, "Aucun logo");
    await apiFetch("/api/admin/info", { method: "PUT", body: JSON.stringify({ logo: url }) });
    statusEl.textContent = "Logo envoyé et enregistré ✅";
    showToast("Logo mis à jour ✅");
  } catch (err) {
    statusEl.textContent = err.message;
  }
});

document.getElementById("logoRemoveBtn").addEventListener("click", async () => {
  document.getElementById("infoLogo").value = "";
  document.getElementById("logoFile").value = "";
  renderUploadPreview(document.getElementById("logoPreview"), "", "Aucun logo");
  const statusEl = document.getElementById("logoUploadStatus");
  try {
    await apiFetch("/api/admin/info", { method: "PUT", body: JSON.stringify({ logo: "" }) });
    statusEl.textContent = "Logo retiré ✅";
    showToast("Logo retiré ✅");
  } catch (err) {
    statusEl.textContent = err.message;
  }
});

document.getElementById("coverFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const statusEl = document.getElementById("coverUploadStatus");
  statusEl.textContent = "Envoi en cours…";
  try {
    const url = await uploadFile(file);
    document.getElementById("infoCoverImage").value = url;
    renderUploadPreview(document.getElementById("coverPreview"), url, "Aucun fichier");
    await apiFetch("/api/admin/info", { method: "PUT", body: JSON.stringify({ coverImage: url }) });
    statusEl.textContent = "Fichier envoyé et enregistré ✅";
    showToast("Couverture mise à jour ✅");
  } catch (err) {
    statusEl.textContent = err.message;
  }
});

document.getElementById("coverRemoveBtn").addEventListener("click", async () => {
  document.getElementById("infoCoverImage").value = "";
  document.getElementById("coverFile").value = "";
  renderUploadPreview(document.getElementById("coverPreview"), "", "Aucun fichier");
  const statusEl = document.getElementById("coverUploadStatus");
  try {
    await apiFetch("/api/admin/info", { method: "PUT", body: JSON.stringify({ coverImage: "" }) });
    statusEl.textContent = "Couverture retirée ✅";
    showToast("Couverture retirée ✅");
  } catch (err) {
    statusEl.textContent = err.message;
  }
});

document.getElementById("infoCoverImage").addEventListener("input", (e) => {
  renderUploadPreview(document.getElementById("coverPreview"), e.target.value, "Aucun fichier");
});

document.getElementById("infoForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const successEl = document.getElementById("infoSuccess");
  const errorEl = document.getElementById("infoError");
  successEl.textContent = "";
  errorEl.textContent = "";
  const payload = {
    name: document.getElementById("infoName").value.trim(),
    intro: document.getElementById("infoIntro").value.trim(),
    address: document.getElementById("infoAddress").value.trim(),
    phone: document.getElementById("infoPhone").value.trim(),
    instagram: document.getElementById("infoInstagram").value.trim(),
    whatsapp: document.getElementById("infoWhatsapp").value.trim(),
    ubereats: document.getElementById("infoUberEats").value.trim(),
    deliveroo: document.getElementById("infoDeliveroo").value.trim(),
    logo: document.getElementById("infoLogo").value.trim(),
    coverImage: document.getElementById("infoCoverImage").value.trim(),
    highlight: document.getElementById("infoHighlight").value.trim(),
    hours: hoursRows.filter((h) => h.days.trim() || h.times.trim()),
  };
  try {
    await apiFetch("/api/admin/info", { method: "PUT", body: JSON.stringify(payload) });
    successEl.textContent = "Informations enregistrées ✅";
    showToast("Informations mises à jour ✅");
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

// ---------- Panel Avis clients ----------
async function loadReviewsPanel() {
  const container = document.getElementById("reviewsListAdmin");
  container.innerHTML = "<p>Chargement…</p>";
  try {
    const data = await apiFetch("/api/admin/reviews");
    renderReviewsAdmin(data.reviews || []);
  } catch (err) {
    container.innerHTML = `<p class="error-msg">${err.message}</p>`;
  }
}

function renderReviewsAdmin(reviews) {
  const container = document.getElementById("reviewsListAdmin");
  container.innerHTML = "";
  if (reviews.length === 0) {
    container.innerHTML = "<p>Aucun avis pour l'instant. La section « avis » reste masquée sur le site tant qu'aucun avis n'est ajouté.</p>";
    return;
  }
  reviews.forEach((r) => {
    const row = document.createElement("div");
    row.className = "review-row";
    row.innerHTML = `
      <div class="review-row-main">
        <strong>${escapeHTML(r.author || "")}</strong>
        <span class="review-row-stars">${"★".repeat(Math.max(1, Math.min(5, Number(r.rating) || 5)))}</span>
        <p>${escapeHTML(r.text || "")}</p>
      </div>
      <button class="btn btn-danger btn-sm" data-delete-review="${r.id}">🗑</button>
    `;
    row.querySelector("[data-delete-review]").addEventListener("click", async () => {
      if (!confirm("Supprimer cet avis ?")) return;
      try {
        await apiFetch(`/api/admin/reviews/${r.id}`, { method: "DELETE" });
        showToast("Avis supprimé.");
        loadReviewsPanel();
      } catch (err) {
        showToast(err.message, true);
      }
    });
    container.appendChild(row);
  });
}

document.getElementById("addReviewForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const successEl = document.getElementById("reviewSuccess");
  const errorEl = document.getElementById("reviewError");
  successEl.textContent = "";
  errorEl.textContent = "";
  const author = document.getElementById("reviewAuthor").value.trim();
  const text = document.getElementById("reviewText").value.trim();
  const rating = Number(document.getElementById("reviewRating").value) || 5;
  if (!author || !text) {
    errorEl.textContent = "L'auteur et le texte de l'avis sont requis.";
    return;
  }
  try {
    await apiFetch("/api/admin/reviews", {
      method: "POST",
      body: JSON.stringify({ author, text, rating }),
    });
    successEl.textContent = "Avis ajouté ✅";
    showToast("Avis ajouté ✅");
    e.target.reset();
    document.getElementById("reviewRating").value = 5;
    loadReviewsPanel();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

// ---------- Panel Sécurité ----------
document.getElementById("passwordForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const successEl = document.getElementById("passwordSuccess");
  const errorEl = document.getElementById("passwordError");
  successEl.textContent = "";
  errorEl.textContent = "";

  const currentPassword = document.getElementById("currentPassword").value;
  const newPassword = document.getElementById("newPassword").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  if (newPassword !== confirmPassword) {
    errorEl.textContent = "Les deux nouveaux mots de passe ne correspondent pas.";
    return;
  }

  try {
    await apiFetch("/api/admin/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    successEl.textContent = "Mot de passe mis à jour ✅";
    e.target.reset();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

// ---------- Utils ----------
function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
function attr(str) {
  return escapeHTML(str).replace(/"/g, "&quot;");
}

// ---------- Démarrage ----------
if (getToken()) {
  showAdmin();
} else {
  showLogin();
}
