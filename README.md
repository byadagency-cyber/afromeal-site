# AfroMeal — site vitrine + espace restaurateur

Site vitrine pour le restaurant AfroMeal (Nice), avec un menu gere dynamiquement depuis un panneau d'administration protege par mot de passe.

## Demarrage local

cd server && npm install && npm start

Site public: http://localhost:3000/
Espace restaurateur: http://localhost:3000/admin.html

Mot de passe par defaut: afromeal2026 (a changer des la premiere connexion, onglet Securite).

## Deploiement sur Render

1. Sur render.com, New + puis Web Service.
2. Connectez ce depot GitHub (afromeal-site).
3. Build Command: npm install
4. Start Command: npm start
5. Plan Free, puis Deploy.

Le fichier render.yaml a la racine du depot pre-remplit cette configuration automatiquement.

## Modifier le menu

Depuis /admin.html, onglet Menu: modifier, masquer ou ajouter des plats. Les changements sont immediats sur le site public.

## Securite

Mot de passe hache avec scrypt, jamais stocke en clair. Changez le mot de passe par defaut avant de partager le lien.
