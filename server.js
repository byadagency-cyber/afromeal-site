/**
 * AfroMeal — serveur du site vitrine + panneau d'administration
 * ----------------------------------------------------------------
 * - Sert le site public (public/index.html) et le panneau admin (public/admin.html)
 * - Expose une API JSON pour lire/modifier le menu
 * - Authentification admin par mot de passe (haché avec scrypt, aucune dépendance externe)
 *
 * Démarrage : npm install && npm start
 * Mot de passe admin par défaut : voir README.md (à changer dès la première connexion !)
 */

const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 3000;

// Si un Volume persistant Railway est attaché (variable fournie automatiquement
// par Railway), les données et fichiers envoyés y sont stockés afin de survivre
// aux redéploiements. Sinon (développement local), on utilise les dossiers du repo.
const VOLUME_ROOT = process.env.RAILWAY_VOLUME_MOUNT_PATH || null;
const SEED_DATA_DIR = path.join(__dirname, "data");
const DATA_DIR = VOLUME_ROOT ? path.join(VOLUME_ROOT, "data") : SEED_DATA_DIR;
const MENU_FILE = path.join(DATA_DIR, "menu.json");
const INFO_FILE = path.join(DATA_DIR, "info.json");
const ADMIN_FILE = path.join(DATA_DIR, "admin.json");
const REVIEWS_FILE = path.join(DATA_DIR, "reviews.json");
const UPLOADS_DIR = VOLUME_ROOT ? path.join(VOLUME_ROOT, "uploads") : path.join(__dirname, "public", "uploads");

const DEFAULT_PASSWORD = process.env.ADMIN_DEFAULT_PASSWORD || "afromeal2026";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

// ---------- Petites fonctions utilitaires (fichiers + mots de passe) ----------

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  const check = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(check, "hex"), Buffer.from(hash, "hex"));
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  // Première utilisation d'un Volume tout neuf : on le pré-remplit avec les
  // données par défaut du dépôt (menu, infos, avis), une seule fois.
  if (VOLUME_ROOT) {
    ["menu.json", "info.json", "reviews.json"].forEach((file) => {
      const dest = path.join(DATA_DIR, file);
      const src = path.join(SEED_DATA_DIR, file);
      if (!fs.existsSync(dest) && fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
      }
    });
  }
}
ensureDataDir();

function ensureAdminFile() {
  if (!fs.existsSync(ADMIN_FILE)) {
    const { salt, hash } = hashPassword(DEFAULT_PASSWORD);
    writeJSON(ADMIN_FILE, { salt, hash });
    console.log("──────────────────────────────────────────────────────────");
    console.log(" Aucun mot de passe admin trouvé : mot de passe par défaut créé.");
    console.log(` Mot de passe par défaut : "${DEFAULT_PASSWORD}"`);
    console.log(" Changez-le immédiatement depuis /admin.html une fois connecté.");
    console.log("──────────────────────────────────────────────────────────");
  }
}
ensureAdminFile();

function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}
ensureUploadsDir();

function ensureReviewsFile() {
  if (!fs.existsSync(REVIEWS_FILE)) {
    writeJSON(REVIEWS_FILE, { reviews: [] });
  }
}
ensureReviewsFile();

// ---------- Sessions admin (en mémoire, simple et suffisant pour 1 seul admin) ----------

const sessions = new Map(); // token -> expiry timestamp

function createSession() {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const expiry = token && sessions.get(token);
  if (!expiry || expiry < Date.now()) {
    if (token) sessions.delete(token);
    return res.status(401).json({ error: "Non autorisé. Merci de vous reconnecter." });
  }
  // glisse l'expiration (session active = prolongée)
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  next();
}

// ---------- Middleware ----------

app.use(express.json());
app.use("/uploads", express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, "public")));

// ---------- Upload de fichiers (photos / vidéos) ----------

const ALLOWED_UPLOAD_TYPES = /\.(jpe?g|png|gif|webp|svg|mp4|webm|mov)$/i;

const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = crypto.randomBytes(8).toString("hex");
    cb(null, `${Date.now()}-${unique}${ext}`);
  },
});

const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 Mo (photos + courtes vidéos)
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_UPLOAD_TYPES.test(file.originalname)) {
      return cb(new Error("Type de fichier non autorisé. Formats acceptés : images (jpg, png, gif, webp, svg) ou vidéos (mp4, webm, mov)."));
    }
    cb(null, true);
  },
});

app.post("/api/admin/upload", requireAdmin, (req, res) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || "Échec du téléversement." });
    }
    if (!req.file) {
      return res.status(400).json({ error: "Aucun fichier reçu." });
    }
    res.status(201).json({ url: `/uploads/${req.file.filename}` });
  });
});

// ---------- API publique ----------

app.get("/api/menu", (req, res) => {
  const menu = readJSON(MENU_FILE);
  // Le site public ne montre que les plats marqués disponibles
  const items = menu.items.filter((i) => i.available !== false);
  res.json({ categories: menu.categories, items });
});

app.get("/api/info", (req, res) => {
  res.json(readJSON(INFO_FILE));
});

app.get("/api/reviews", (req, res) => {
  res.json(readJSON(REVIEWS_FILE));
});

// ---------- Authentification admin ----------

app.post("/api/admin/login", (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: "Mot de passe requis." });

  const admin = readJSON(ADMIN_FILE);
  if (!verifyPassword(password, admin.salt, admin.hash)) {
    return res.status(401).json({ error: "Mot de passe incorrect." });
  }
  const token = createSession();
  res.json({ token });
});

app.post("/api/admin/logout", requireAdmin, (req, res) => {
  const token = (req.headers.authorization || "").slice(7);
  sessions.delete(token);
  res.json({ ok: true });
});

app.post("/api/admin/change-password", requireAdmin, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Mot de passe actuel et nouveau mot de passe requis." });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: "Le nouveau mot de passe doit contenir au moins 6 caractères." });
  }
  const admin = readJSON(ADMIN_FILE);
  if (!verifyPassword(currentPassword, admin.salt, admin.hash)) {
    return res.status(401).json({ error: "Mot de passe actuel incorrect." });
  }
  const { salt, hash } = hashPassword(newPassword);
  writeJSON(ADMIN_FILE, { salt, hash });
  res.json({ ok: true });
});

// ---------- Administration du menu (protégé) ----------

app.get("/api/admin/menu", requireAdmin, (req, res) => {
  res.json(readJSON(MENU_FILE));
});

app.post("/api/admin/menu/items", requireAdmin, (req, res) => {
  const { category, name, description, price, available, image, badge } = req.body || {};
  if (!category || !name || !price) {
    return res.status(400).json({ error: "Catégorie, nom et prix sont requis." });
  }
  const menu = readJSON(MENU_FILE);
  if (!menu.categories.some((c) => c.id === category)) {
    return res.status(400).json({ error: "Catégorie inconnue." });
  }
  const item = {
    id: crypto.randomBytes(6).toString("hex"),
    category,
    name,
    description: description || "",
    price,
    available: available !== false,
    image: image || "",
    badge: badge || "",
  };
  menu.items.push(item);
  writeJSON(MENU_FILE, menu);
  res.status(201).json(item);
});

app.put("/api/admin/menu/items/:id", requireAdmin, (req, res) => {
  const menu = readJSON(MENU_FILE);
  const item = menu.items.find((i) => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: "Plat introuvable." });

  const { category, name, description, price, available, image, badge } = req.body || {};
  if (category) {
    if (!menu.categories.some((c) => c.id === category)) {
      return res.status(400).json({ error: "Catégorie inconnue." });
    }
    item.category = category;
  }
  if (name !== undefined) item.name = name;
  if (description !== undefined) item.description = description;
  if (price !== undefined) item.price = price;
  if (available !== undefined) item.available = !!available;
  if (image !== undefined) item.image = image;
  if (badge !== undefined) item.badge = badge;

  writeJSON(MENU_FILE, menu);
  res.json(item);
});

app.delete("/api/admin/menu/items/:id", requireAdmin, (req, res) => {
  const menu = readJSON(MENU_FILE);
  const idx = menu.items.findIndex((i) => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Plat introuvable." });
  menu.items.splice(idx, 1);
  writeJSON(MENU_FILE, menu);
  res.json({ ok: true });
});

// Gestion simple des catégories (ajouter / renommer / supprimer)
app.post("/api/admin/menu/categories", requireAdmin, (req, res) => {
  const { id, name } = req.body || {};
  if (!id || !name) return res.status(400).json({ error: "Identifiant et nom requis." });
  const menu = readJSON(MENU_FILE);
  if (menu.categories.some((c) => c.id === id)) {
    return res.status(400).json({ error: "Cette catégorie existe déjà." });
  }
  const order = menu.categories.length
    ? Math.max(...menu.categories.map((c) => c.order)) + 1
    : 1;
  menu.categories.push({ id, name, order });
  writeJSON(MENU_FILE, menu);
  res.status(201).json({ id, name, order });
});

app.delete("/api/admin/menu/categories/:id", requireAdmin, (req, res) => {
  const menu = readJSON(MENU_FILE);
  if (menu.items.some((i) => i.category === req.params.id)) {
    return res.status(400).json({ error: "Impossible de supprimer une catégorie qui contient des plats." });
  }
  menu.categories = menu.categories.filter((c) => c.id !== req.params.id);
  writeJSON(MENU_FILE, menu);
  res.json({ ok: true });
});

// ---------- Gestion des avis clients (protégé) ----------

app.get("/api/admin/reviews", requireAdmin, (req, res) => {
  res.json(readJSON(REVIEWS_FILE));
});

app.post("/api/admin/reviews", requireAdmin, (req, res) => {
  const { author, text, rating } = req.body || {};
  if (!author || !text) {
    return res.status(400).json({ error: "Nom et texte de l'avis requis." });
  }
  const data = readJSON(REVIEWS_FILE);
  const review = {
    id: crypto.randomBytes(6).toString("hex"),
    author,
    text,
    rating: rating ? Math.max(1, Math.min(5, Number(rating))) : 5,
  };
  data.reviews.push(review);
  writeJSON(REVIEWS_FILE, data);
  res.status(201).json(review);
});

app.put("/api/admin/reviews/:id", requireAdmin, (req, res) => {
  const data = readJSON(REVIEWS_FILE);
  const review = data.reviews.find((r) => r.id === req.params.id);
  if (!review) return res.status(404).json({ error: "Avis introuvable." });

  const { author, text, rating } = req.body || {};
  if (author !== undefined) review.author = author;
  if (text !== undefined) review.text = text;
  if (rating !== undefined) review.rating = Math.max(1, Math.min(5, Number(rating) || 5));

  writeJSON(REVIEWS_FILE, data);
  res.json(review);
});

app.delete("/api/admin/reviews/:id", requireAdmin, (req, res) => {
  const data = readJSON(REVIEWS_FILE);
  const idx = data.reviews.findIndex((r) => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Avis introuvable." });
  data.reviews.splice(idx, 1);
  writeJSON(REVIEWS_FILE, data);
  res.json({ ok: true });
});

// Informations pratiques du restaurant (adresse, horaires, téléphone...)
app.put("/api/admin/info", requireAdmin, (req, res) => {
  const current = readJSON(INFO_FILE);
  const updated = { ...current, ...req.body };
  writeJSON(INFO_FILE, updated);
  res.json(updated);
});

app.listen(PORT, () => {
  console.log(`AfroMeal — serveur lancé sur http://localhost:${PORT}`);
  console.log(`Site public : http://localhost:${PORT}/`);
  console.log(`Panneau admin : http://localhost:${PORT}/admin.html`);
});
