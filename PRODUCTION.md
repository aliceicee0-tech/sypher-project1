# Melodia — Production Deployment Guide

Mettre Melodia en ligne, de A à Z. Stack recommandée (gratuite pour débuter) :

```
Frontend  →  Vercel        (React statique, ultra-rapide, gratuit)
Backend   →  Render.com     (serveur Node persistant, gratuit)
Database  →  MongoDB Atlas  (gratuit, 512 Mo)
Google    →  Cloud Console  (déjà configuré, app en production)
```

> ⚠️ **Lis ce guide en entier une fois** avant de commencer. L'ordre des étapes
> compte (notamment pour les URLs OAuth).

---

## 0. Pré-requis (5 min)

1. Ton code est sur **GitHub** (un dépôt, même privé).
2. Tu as tes **3 comptes** : Vercel, Render, MongoDB Atlas (création gratuite).
3. Tu as déjà tes **clés Treblo** (23 pour l'instant, tu complèteras le reste).
4. Ton app Google est **déjà en production** (vérifié ✅).

---

## 1. Architecture en production

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────┐
│   FRONTEND      │     │     BACKEND       │     │   Treblo API │
│  Vercel (React) │ ──→ │  Render (Express) │ ──→ │  23→100 clés │
│  melodia.vercel │     │  melodia-backend  │     │  failover ON │
│                 │     │       .onrender   │     └──────────────┘
└─────────────────┘     └────────┬──────────┘
       ↑                         │
       │       cookies           ▼
       │  (SameSite=None)  ┌──────────────┐
       └────────────────── │ MongoDB Atlas│
                            │  (gratuit)   │
                            └──────────────┘
```

Le frontend (Vercel) et le backend (Render) sont sur **des domaines différents**.
Le backend gère CORS + cookies cross-origin pour que l'auth marche.

---

## 2. ÉTAPE 1 — Base de données MongoDB Atlas (10 min)

1. Va sur https://www.mongodb.com/atlas → **Try Free** → crée un compte.
2. Crée un cluster **M0 Free** (region au choix, ex: AWS / Frankfurt).
3. Dans **Database Access** : crée un utilisateur (ex: `melodia`, mot de passe fort).
4. Dans **Network Access** : ajoute `0.0.0.0/0` (autorise toutes les IP — sinon
   Render ne pourra pas se connecter car son IP change).
5. Clique **Connect → Drivers** → copie la **connection string**. Elle ressemble à :
   ```
   mongodb+srv://melodia:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
6. Remplace `<password>` par ton vrai mot de passe. **Garde-la de côté.**

---

## 3. ÉTAPE 2 — Déployer le backend sur Render (15 min)

### 3a. Créer le service

1. Va sur https://render.com → sign up avec **GitHub**.
2. **New +** → **Blueprint** → sélectionne ton dépôt GitHub.
3. Render lit automatiquement `render.yaml` (déjà créé à la racine du projet).
4. Il détecte le service `melodia-backend`. Clique **Apply**.

### 3b. Configurer les variables d'environnement

Dans Render → ton service → **Environment** → ajoute chaque variable :

| Variable | Valeur | Notes |
|----------|--------|-------|
| `NODE_ENV` | `production` | (déjà dans render.yaml) |
| `CLIENT_URL` | `https://melodia.vercel.app` | ⚠️ mets TON future URL Vercel |
| `MONGODB_URI` | `mongodb+srv://melodia:...` | ta string Atlas de l'étape 1 |
| `JWT_SECRET` | (64 caractères hex) | génère avec : voir ci-dessous |
| `GOOGLE_CLIENT_ID` | `1063540...apps.googleusercontent.com` | depuis `.env` local |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-...` | depuis `.env` local |
| `GOOGLE_REDIRECT_URI` | `https://melodia-backend.onrender.com/api/auth/google/callback` | ⚠️ URL Render |
| `TREBLO_EXPECTED_KEYS` | `100` | (déjà dans render.yaml) |
| `MAX_USERS` | `100` | (déjà dans render.yaml) |
| `ADMIN_EMAILS` | `ton-email@gmail.com` | pour confirmer les paiements |
| `MVOLA_NUMBER` | `ton numéro Mvola` | pour les paiements |
| `ABUSE_MAX_SIGNUPS` | `5` | (déjà dans render.yaml) |

**Générer un JWT_SECRET** (sur ta machine locale) :
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3c. Ajouter les clés Treblo (23 pour l'instant)

Deux options :

**Option A — Variables d'env numérotées** (simple, pour 23 clés) :
Dans Render → Environment, ajoute `TREBLO_API_KEY_1`, `_2`, … `_23` avec tes clés.

**Option B — Fichier secret** (recommandé pour viser les 100) :
1. Crée un fichier `.treblo-keys` localement (une clé par ligne).
2. Render → **Secret Files** → Add Secret File → nom: `/etc/secrets/treblo-keys`
3. Colle le contenu de ton fichier.
4. Dans Environment, ajoute : `TREBLO_KEYS_FILE=/etc/secrets/treblo-keys`

### 3d. Déployer

Clique **Create Web Service** / **Apply**. Render build + démarre.
L'URL sera : `https://melodia-backend.onrender.com` (ou similaire).

**Vérifie** : visite `https://melodia-backend.onrender.com/api/health` →
```json
{"ok":true,"mockMode":false,"uptime":12,"keys":23,"db":true}
```
Si `db: true` → Atlas marche. Si `keys: 23` → tes clés sont chargées.

---

## 4. ÉTAPE 3 — Déployer le frontend sur Vercel (10 min)

### 4a. Importer

1. Va sur https://vercel.com → sign up avec **GitHub**.
2. **Add New Project** → importe ton dépôt.
3. **Root Directory** : sélectionne `frontend` (pas la racine du projet !).
4. Framework Preset : **Vite** (auto-détecté).

### 4b. Variable d'environnement CRITIQUE

Dans **Environment Variables**, ajoute :
```
VITE_API_URL = https://melodia-backend.onrender.com/api
```
⚠️ **L'URL doit correspondre à ton backend Render** (sans `/` final, avec `/api`).

### 4c. Déployer

Clique **Deploy**. Vercel build → URL : `https://melodia.vercel.app`.

---

## 5. ÉTAPE 4 — Mettre à jour Google OAuth (5 min)

Maintenant que tu as tes 2 URLs (Vercel + Render), va dans Google Cloud Console :

1. https://console.cloud.google.com/apis/credentials
2. Clique ton **OAuth 2.0 Client ID** → **Edit**.
3. Dans **Authorized JavaScript origins**, AJOUTE :
   - `https://melodia.vercel.app`
4. Dans **Authorized redirect URIs**, AJOUTE :
   - `https://melodia-backend.onrender.com/api/auth/google/callback`
5. **Save**. Garde les anciennes URLs `localhost` (pour tester en local).

---

## 6. ÉTAPE 5 — Test final de production (5 min)

1. Va sur `https://melodia.vercel.app`
2. Clique **Continue with Google** → choisis ton compte.
3. Tu dois être redirigé vers Google, puis vers Render, puis revenir sur Vercel **connecté**.
4. Génère une musique → ça doit marcher.
5. Va dans `/account` → ton quota s'affiche.

**Si ça marche → bravo, Melodia est en production ! 🎉**

---

## 7. Dépannage (problèmes courants)

### "Access blocked" au login Google
→ Vérifie que l'**URL de redirect** dans Google Cloud correspond EXACTEMENT à
celle dans `GOOGLE_REDIRECT_URI` sur Render. Une lettre en trop = blocage.

### Connecté puis immédiatement déconnecté
→ Le cookie ne voyage pas. Vérifie que `CLIENT_URL` sur Render = ton URL Vercel
exacte (avec `https://`, sans `/` final).

### `googleConfigured: false` sur la page de login
→ Vérifie `VITE_API_URL` sur Vercel pointe bien vers le backend Render avec `/api`.
Rebuild Vercel après changement (Redeploy).

### Erreur 500 sur `/api/auth/me`
→ Vérifie les logs Render (onglet **Logs**). Cherche `unhandled error:`.

### `db: false` dans /api/health
→ Atlas : vérifie Network Access = `0.0.0.0/0` et que le mot de passe dans
`MONGODB_URI` est correct.

### Le service Render "dort"
→ Le plan gratuit Render met le service en veille après 15 min d'inactivité.
La première requête prend ~30s pour le réveiller. C'est normal. Pour éviter ça,
passe au plan payant (~7$/mois) plus tard quand tu auras des utilisateurs.

---

## 8. Secrets checklist (à cocher avant le go-live)

- [ ] `JWT_SECRET` généré (64 hex) sur Render
- [ ] `MONGODB_URI` (Atlas) sur Render
- [ ] `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` sur Render
- [ ] `GOOGLE_REDIRECT_URI` = URL Render + `/api/auth/google/callback`
- [ ] `CLIENT_URL` = URL Vercel
- [ ] Clés Treblo (23+) ajoutées sur Render
- [ ] `ADMIN_EMAILS` = ton email (sinon impossible de confirmer les paiements)
- [ ] `VITE_API_URL` = URL Render + `/api` sur Vercel
- [ ] URLs ajoutées dans Google Cloud Console (origins + redirect)
- [ ] `/api/health` retourne `ok: true, db: true, keys: 23`

---

## 9. Pour ajouter les 87 clés Treblo restantes plus tard

Quand tu auras collecté les clés manquantes (de 24 à 100) :

1. Render → **Secret Files** → édite ton fichier `/etc/secrets/treblo-keys`.
2. Ajoute les nouvelles clés (une par ligne).
3. **Save Changes** → Render redémarre automatiquement.
4. Vérifie : `https://melodia-backend.onrender.com/api/health` → `keys` augmente.

C'est tout — pas besoin de toucher au code ou à Vercel.

---

## 10. Référence : la limite des 100 utilisateurs

`MAX_USERS=100` est une **limite dure** sur le total des comptes inscrits.

- Vérifiée à chaque **nouvelle inscription** dans `routes/auth.js`.
- Quand `countDocuments >= 100`, le nouvel inscrit est redirigé vers
  `/login?error=signup_closed` avec le message : *"Our beta is full…"*.
- **Les utilisateurs existants se connectent toujours** — la limite ne bloque
  que les comptes en plus.
- Aussi active en mode mémoire (si Mongo est down).
- Mets `MAX_USERS=0` pour désactiver la limite.

Surveille en direct (admin uniquement) :
```
GET https://melodia-backend.onrender.com/api/admin/status
→ { capacity: { users: 42, maxUsers: 100, full: false }, ... }
```

---

## 11. Référence : le failover des clés Treblo

Le moteur de bascule en chaîne (`providers/keys.js` + `services/trebloClient.js`) :

- **Crédits épuisés** (HTTP 401/402/403) → clé **retirée définitivement** pour la
  session, bascule immédiate à la suivante.
- **Erreur transitoire** (timeout / 5xx / réseau) → cooldown 60 s puis remise.
- **4 échecs transitoires** consécutifs → clé promue « retirée ».
- **Toutes épuisées** → erreur 502 claire au client.

Monitoring (admin uniquement) :
```
GET /api/admin/keys         → détail par slot + clés retirées
POST /api/admin/keys/3/revive  → remet la clé #3 en pool (après rechargement)
```
