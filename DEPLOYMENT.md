# WatchTogether Deployment Guide

## Architecture

```
Internet → Cloudflare → cloudflared container → frontend (nginx) → server (node)
```

- **No port forwarding** — Cloudflare Tunnel creates an outbound connection from your server
- **No reverse proxy** — replaces Nginx Proxy Manager entirely
- **HTTPS automatic** — Cloudflare handles SSL
- **Docker Compose** via Dockge on TrueNAS

---

## Step 1: Create a Cloudflare Tunnel

### 1. Go to Cloudflare Zero Trust Dashboard

1. Log in to https://one.dash.cloudflare.com
2. Go to **Networks** → **Tunnels**
3. Click **Create a tunnel**
4. Select **Cloudflared** as the connector
5. Name it (e.g. `watchparty`)
6. Copy the **tunnel token** — you'll need this

### 2. Configure the Tunnel Route

In the tunnel config, add a **Public Hostname**:

| Field | Value |
|-------|-------|
| Subdomain | `watch` (or whatever you want) |
| Domain | `yourdomain.com` |
| Type | `HTTP` |
| URL | `frontend:80` |

This tells Cloudflare to route `watch.yourdomain.com` → the frontend container on port 80 (internal Docker network).

**Additional settings** (click the hostname to expand):

Under **HTTP Settings**:
- **HTTP/2 Origin**: ON
- **WebSocket**: ON (critical for Socket.IO)
- **No TLS Verify**: ON (the internal connection is HTTP between containers)

---

## Step 2: Set Environment Variables

Create a `.env` file in your project root (or set in Dockge UI):

```env
# Cloudflare Tunnel token from Step 1
TUNNEL_TOKEN=eyJhIjoiYWJjZGVmZy4uLi...

# CORS origin — your public URL
CORS_ORIGIN=https://watch.yourdomain.com

# TURN server for voice chat (see Step 3)
TURN_URL=turn:openrelay.metered.ca:443
TURN_USERNAME=openrelayproject
TURN_CREDENTIAL=openrelayproject
```

---

## Step 3: TURN Server for Voice Chat

WebRTC audio goes peer-to-peer, NOT through the tunnel. Users behind restrictive NATs need a TURN relay server. Pick one:

### Option A: Free TURN Provider (Quickest)

No setup needed, just set env vars:

```env
TURN_URL=turn:openrelay.metered.ca:443
TURN_USERNAME=openrelayproject
TURN_CREDENTIAL=openrelayproject
```

Or sign up at https://www.metered.ca/ for a dedicated free tier (500GB/month).

### Option B: Self-Hosted coturn (More Reliable)

Add to `docker-compose.yml`:

```yaml
  coturn:
    image: coturn/coturn:latest
    container_name: watchparty-coturn
    restart: unless-stopped
    network_mode: host
    volumes:
      - ./coturn/turnserver.conf:/etc/coturn/turnserver.conf:ro
```

Create `coturn/turnserver.conf`:

```conf
listening-port=3478
realm=yourdomain.com
server-name=yourdomain.com
lt-cred-mech
user=watchtogether:your-secure-password
min-port=49152
max-port=65535
no-multicast-peers
no-cli
fingerprint
```

**coturn needs direct access** — it can't go through Cloudflare Tunnel (UDP traffic). You'll need:
- Port forward **3478 TCP+UDP** and **49152-65535 UDP** on your router
- A DNS record for `turn.yourdomain.com` → your public IP (**DNS only, grey cloud** in Cloudflare — NOT proxied)

```env
TURN_URL=turn:turn.yourdomain.com:3478
TURN_USERNAME=watchtogether
TURN_CREDENTIAL=your-secure-password
```

> Note: The web app itself needs zero port forwarding (that's the point of the tunnel). Only coturn needs ports if you self-host it. Using Option A avoids this entirely.

---

## Step 4: Deploy

```bash
docker compose up -d --build
```

Or in Dockge: **Update & Restart** the stack.

Your app is live at `https://watch.yourdomain.com` — no port forwarding, no NPM, no SSL config.

---

## How Traffic Flows

```
Browser (User A)
    ↓ HTTPS
Cloudflare Edge
    ↓ Tunnel (outbound from your server)
cloudflared container
    ↓ HTTP (internal Docker network)
frontend container (nginx:80)
    ├─ Static files: /  → serves React app
    ├─ /api/*           → proxy to server:3001
    └─ /socket.io/*     → proxy to server:3001 (WebSocket)
            ↓
server container (node:3001)
    └─ Relays WebRTC signaling (offers/answers/ICE candidates)

Voice audio: Browser A ←──P2P (or via TURN)──→ Browser B
```

---

## Migrating from Nginx Proxy Manager

If you're currently using NPM:

1. Add the `tunnel` service to your docker-compose (already done)
2. Set `TUNNEL_TOKEN` in your env
3. Remove the `ports` mapping from frontend (already done — no port 8080 exposed)
4. Remove or disable the NPM proxy host for watchparty
5. `docker compose up -d --build`
6. Verify `https://watch.yourdomain.com` works
7. Remove the port forwarding rule on your router for port 8080

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| 502 Bad Gateway | Tunnel can't reach frontend | Check `frontend` container is running, URL in tunnel config is `frontend:80` |
| WebSocket disconnects | WebSocket not enabled in tunnel | Enable WebSocket in tunnel hostname HTTP settings |
| Voice fails between users | No TURN server | Set TURN env vars (Option A or B above) |
| "Microphone access denied" | Not HTTPS | Should be automatic with tunnel — check URL is `https://` |
| Join Voice does nothing | Mic blocked by browser | Click the lock icon in URL bar, allow microphone |
| Tunnel shows "unhealthy" | Token wrong or container can't reach Cloudflare | Check `TUNNEL_TOKEN`, check container logs: `docker logs watchparty-tunnel` |

## Testing TURN

Verify your TURN server works:
1. Open https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/
2. Add your TURN server URL + credentials
3. Click "Gather candidates"
4. You should see `relay` type candidates — TURN is working
