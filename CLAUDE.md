# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development (without Docker)
```bash
# Backend
cd server && npm install && npm run dev   # tsx watch on port 3001

# Frontend
cd frontend && npm install && npm run dev  # Vite dev server on port 5173
```

### Production (Docker)
```bash
docker compose up -d --build
docker compose logs -f          # stream logs
docker compose down
```

### Build
```bash
cd server && npm run build       # tsc → dist/
cd frontend && npm run build     # tsc + vite build → dist/
```

No test suite is configured.

## Architecture

### Monorepo Layout
- `frontend/` — React 18 + TypeScript + Vite + Tailwind CSS
- `server/` — Express + Socket.io + TypeScript
- `docker-compose.yml` — three services: `server`, `frontend` (Nginx), `tunnel` (Cloudflare)

### Frontend
- **Routing**: React Router — two pages: `Home` (room create/join) and `Room` (main UI)
- **Room.tsx** is the central orchestrator: manages Socket.io listeners, local state, and renders all panels (chat, queue, people, comments, settings)
- **Real-time sync**: `socket.ts` creates the Socket.io client; event namespaces are `room:*`, `video:*`, `queue:*`, `chat:*`, `voice:*`
- **Voice chat**: `VoiceManager.ts` (SimplePeer/WebRTC, VAD) + `VoiceContext.tsx` (React Context) + `VoiceControls.tsx`
- **Theming**: `ThemeContext.tsx` holds 6 predefined themes (`themes.ts`); `useAmbientColors.ts` + `colorExtractor.ts` extract palette from YouTube thumbnails and blend into the active theme at 10% opacity via `AmbientBackground.tsx`
- **Types**: shared interfaces live in `frontend/src/types.ts`

### Backend
- **`server/src/index.ts`**: Express app, CORS, Socket.io server, REST endpoints (`/api/health`, `/api/ice-servers`, `/api/comments/:videoId`), and all Socket.io event handlers
- **`server/src/rooms.ts`**: in-memory `Map`-based room store; rooms are ephemeral and auto-cleaned when empty; handles host auto-transfer on disconnect
- **`server/src/types.ts`**: TypeScript interfaces shared across the server
- **WebRTC signaling**: server relays offer/answer/ICE-candidate messages between peers — no media passes through the server
- **YouTube comments**: proxied via configurable Invidious instances (env: `INVIDIOUS_INSTANCES`) with server-side caching

### Key Environment Variables
| Variable | Purpose |
|---|---|
| `APP_PORT` | External port (default 8080) |
| `CORS_ORIGIN` | Allowed origins for Socket.io/API |
| `TURN_URL / TURN_USERNAME / TURN_CREDENTIAL` | Optional TURN server for WebRTC NAT traversal |
| `INVIDIOUS_INSTANCES` | Comma-separated Invidious URLs for comments proxy |

### Deployment
Nginx (in the `frontend` Docker image) proxies `/api/*` and `/socket.io/*` to the `server` container on port 3001. Cloudflare Tunnel (`tunnel` service) provides public HTTPS without port forwarding. See `DEPLOYMENT.md` for full setup.
