# Melodia

> Premium AI music generation studio — a melody-first creative workspace that turns any idea into a full song.

Melodia lets creators assemble **blocks (nodes)** on an infinite canvas to generate and
chain AI music, refine it, and share it through a clean public player. The design language is
**Black & White Chic** — pure white, deep black, ultra-thin gray lines, generous white space.

## Architecture

```
[ FRONTEND ]               [ BACKEND ]                  [ GENERATION API ]
 React + React Flow   -->   Node.js / Express proxy  -->  Treblo (default engine)
 (monochrome theme)         (hides the secret key)        (returns .mp3)
```

The backend acts as a **secure proxy**: the generation API key never reaches the browser.

## Monorepo layout

```
.
├── backend/    Express API, Mongoose models, generation client (mock fallback)
└── frontend/   React (Vite) app, React Flow editor, share player
```

## Getting started

### 1. Backend

```bash
cd backend
cp .env.example .env      # then fill in the values
npm install
npm run dev               # http://localhost:4000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev               # http://localhost:5173
```

## Environment variables

| Variable             | Where     | Description                                              |
| -------------------- | --------- | -------------------------------------------------------- |
| `TREBLO_API_KEY`     | backend   | Secret generation key. **Leave empty to run in mock mode.**  |
| `TREBLO_API_BASE_URL`| backend   | Generation API base URL (default `https://api.treblo.com/v1`).   |
| `MONGODB_URI`        | backend   | MongoDB connection string (default db `melodia`).        |
| `PORT`               | backend   | API port (default `4000`).                               |

### Important: never commit your key

Do **not** put `TREBLO_API_KEY` in the source or in chat. Locally it lives in `backend/.env`
(git-ignored). For CI/CD/deployment, add it in **Settings → CI/CD → Variables** as a
**masked & protected** variable.

## Mock mode

If `TREBLO_API_KEY` is empty, the generation client returns a sample audio URL after a short
simulated delay, so the whole app runs end-to-end before the real API is wired up.

## Roadmap

- [x] Phase 1 — scaffolding, monochrome UI, node editor, secure proxy w/ mock fallback
- [x] Renaming — MusiBlock → Melodia across the codebase
- [ ] Phase 2 — real generation API wiring + real waveform + audio seek/scrub
- [ ] Phase 3 — sequential playback + persistence polish
- [ ] Phase 4 — auth (Google), share-page polish, rate-limiting
- [ ] Phase 5 — public explore gallery, like/remix
