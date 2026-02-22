import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { nanoid } from 'nanoid';
import {
  createRoom,
  joinRoom,
  leaveRoom,
  getUserRoom,
  getRoomUsers,
  getVideoState,
  addMessage,
  deleteMessage,
  extractVideoId,
  detectVideoType,
  getRoomCount,
  getTotalUsers,
} from './rooms.js';
import type { ClientToServerEvents, ServerToClientEvents, QueueItem } from './types.js';

const app = express();
const server = createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
  },
  pingInterval: 10000,
  pingTimeout: 5000,
});

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    rooms: getRoomCount(),
    users: getTotalUsers(),
    uptime: process.uptime(),
  });
});

// ICE servers config for WebRTC (STUN + TURN)
app.get('/api/ice-servers', (_req, res) => {
  const iceServers: { urls: string | string[]; username?: string; credential?: string }[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  // Add TURN server if configured via environment variables
  const turnUrl = process.env.TURN_URL;
  const turnUser = process.env.TURN_USERNAME;
  const turnCred = process.env.TURN_CREDENTIAL;

  if (turnUrl && turnUser && turnCred) {
    iceServers.push({
      urls: turnUrl,
      username: turnUser,
      credential: turnCred,
    });
  }

  res.json({ iceServers });
});

// --- YouTube Comments Proxy via Invidious ---
const DEFAULT_INVIDIOUS_INSTANCES = [
  'vid.puffyan.us',
  'inv.nadeko.net',
  'invidious.nerdvpn.de',
  'invidious.jing.rocks',
  'invidious.privacyredirect.com',
];

const INVIDIOUS_INSTANCES = process.env.INVIDIOUS_INSTANCES
  ? process.env.INVIDIOUS_INSTANCES.split(',').map((s) => s.trim())
  : DEFAULT_INVIDIOUS_INSTANCES;

const commentsCache = new Map<string, { data: unknown; expires: number }>();

// Fetch video title from YouTube oEmbed API
async function fetchVideoTitle(videoId: string): Promise<string> {
  try {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) return videoId;
    const data = await response.json() as { title?: string };
    return data.title || videoId;
  } catch {
    return videoId;
  }
}

app.get('/api/comments/:videoId', async (req, res) => {
  const { videoId } = req.params;
  const sortBy = (req.query.sort_by as string) || 'top';
  const continuation = req.query.continuation as string | undefined;

  const cacheKey = `${videoId}:${sortBy}:${continuation || ''}`;
  const cached = commentsCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    res.json(cached.data);
    return;
  }

  let url = '';
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      url = `https://${instance}/api/v1/comments/${videoId}?hl=en&sort_by=${sortBy}`;
      if (continuation) {
        url += `&continuation=${encodeURIComponent(continuation)}`;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) continue;

      const data = await response.json();
      commentsCache.set(cacheKey, { data, expires: Date.now() + 5 * 60 * 1000 });

      // Prune old cache entries periodically
      if (commentsCache.size > 200) {
        const now = Date.now();
        for (const [key, entry] of commentsCache) {
          if (entry.expires < now) commentsCache.delete(key);
        }
      }

      res.json(data);
      return;
    } catch {
      continue;
    }
  }

  res.status(502).json({ error: 'Failed to fetch comments from all Invidious instances' });
});

// Track which rooms are currently processing video:ended to prevent race conditions
const endedProcessing = new Set<string>();

io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`);

  socket.on('room:create', (data, callback) => {
    const { room, user } = createRoom(socket.id, data.userName);
    socket.join(room.id);
    console.log(`[room:create] ${user.name} created room ${room.id}`);

    callback({ roomId: room.id, userId: user.id });

    socket.emit('room:state', {
      roomId: room.id,
      users: getRoomUsers(room),
      hostId: room.hostId,
      videoState: getVideoState(room),
      messages: room.messages,
      queue: room.queue,
      screenSharerId: room.screenSharerId,
    });
  });

  socket.on('room:join', (data, callback) => {
    const result = joinRoom(data.roomId, socket.id, data.userName);
    if (!result) {
      callback({ success: false, error: 'Room not found. Check the code and try again.' });
      return;
    }

    const { room, user } = result;
    socket.join(room.id);
    console.log(`[room:join] ${user.name} joined room ${room.id}`);

    callback({ success: true, userId: user.id });

    socket.emit('room:state', {
      roomId: room.id,
      users: getRoomUsers(room),
      hostId: room.hostId,
      videoState: getVideoState(room),
      messages: room.messages,
      queue: room.queue,
      screenSharerId: room.screenSharerId,
    });

    socket.to(room.id).emit('room:user-joined', { user });

    // If screen share is active, notify the sharer about the new viewer
    if (room.screenSharerId && room.screenSharerId !== socket.id) {
      io.to(room.screenSharerId).emit('screen:viewer-joined', { viewerId: socket.id });
    }
    const systemMsg = room.messages[room.messages.length - 1];
    if (systemMsg) {
      io.to(room.id).emit('chat:message', systemMsg);
    }
  });

  socket.on('room:leave', () => {
    handleDisconnect();
  });

  socket.on('video:load', (data) => {
    const room = getUserRoom(socket.id);
    if (!room) return;

    const videoType = detectVideoType(data.url);
    if (!videoType) {
      socket.emit('error', { message: 'Invalid URL. Paste a YouTube link or a direct video URL (.mp4, .webm, .m3u8, etc.)' });
      return;
    }

    const user = room.users.get(socket.id);
    const userName = user?.name || 'Someone';

    if (videoType === 'youtube') {
      const videoId = extractVideoId(data.url)!;
      room.videoId = videoId;
      room.videoUrl = data.url;
      room.videoType = 'youtube';
    } else {
      room.videoId = '';
      room.videoUrl = data.url;
      room.videoType = 'direct';
    }

    room.isPlaying = true;
    room.currentTime = 0;
    room.lastSyncTime = Date.now();
    room.seq++;

    // Single atomic event: full state in one message
    io.to(room.id).emit('video:load', getVideoState(room));

    const systemMsg = addMessage(room, 'system', '');
    if (systemMsg) {
      systemMsg.text = `${userName} loaded a new video`;
      systemMsg.userId = 'system';
      systemMsg.userName = 'System';
      systemMsg.avatar = '🤖';
      systemMsg.type = 'system';
      io.to(room.id).emit('chat:message', systemMsg);
    }
  });

  socket.on('video:play', (data) => {
    const room = getUserRoom(socket.id);
    if (!room) return;

    room.isPlaying = true;
    room.currentTime = data.currentTime;
    room.lastSyncTime = Date.now();
    room.seq++;

    socket.to(room.id).emit('video:state-update', getVideoState(room));
  });

  socket.on('video:pause', (data) => {
    const room = getUserRoom(socket.id);
    if (!room) return;

    room.isPlaying = false;
    room.currentTime = data.currentTime;
    room.lastSyncTime = Date.now();
    room.seq++;

    socket.to(room.id).emit('video:state-update', getVideoState(room));
  });

  socket.on('video:seek', (data) => {
    const room = getUserRoom(socket.id);
    if (!room) return;

    room.currentTime = data.currentTime;
    room.lastSyncTime = Date.now();
    room.seq++;

    socket.to(room.id).emit('video:state-update', getVideoState(room));
  });

  socket.on('video:rate', (data) => {
    const room = getUserRoom(socket.id);
    if (!room) return;

    room.playbackRate = data.rate;
    room.seq++;
    socket.to(room.id).emit('video:state-update', getVideoState(room));
  });

  // Periodic sync: clients request current authoritative state
  socket.on('video:sync-request', () => {
    const room = getUserRoom(socket.id);
    if (!room) return;
    socket.emit('video:state-update', getVideoState(room));
  });

  socket.on('video:ended', () => {
    const room = getUserRoom(socket.id);
    if (!room) return;
    if (room.queue.length === 0) return;

    // Guard against race condition: multiple users firing video:ended simultaneously
    if (endedProcessing.has(room.id)) return;
    endedProcessing.add(room.id);

    const next = room.queue.shift()!;

    room.videoId = next.videoId;
    room.videoUrl = next.videoUrl;
    room.videoType = next.videoId ? 'youtube' : 'direct';
    room.isPlaying = true;
    room.currentTime = 0;
    room.lastSyncTime = Date.now();
    room.seq++;

    // Single atomic event for next-in-queue
    io.to(room.id).emit('video:load', getVideoState(room));
    io.to(room.id).emit('queue:update', { queue: room.queue });

    const systemMsg = addMessage(room, 'system', '');
    if (systemMsg) {
      systemMsg.text = `Now playing next in queue: ${next.title}`;
      systemMsg.userId = 'system';
      systemMsg.userName = 'System';
      systemMsg.avatar = '🤖';
      systemMsg.type = 'system';
      io.to(room.id).emit('chat:message', systemMsg);
    }

    // Release the lock after a short delay to prevent duplicate processing
    setTimeout(() => endedProcessing.delete(room.id), 2000);
  });

  socket.on('queue:add', (data, callback) => {
    const room = getUserRoom(socket.id);
    if (!room) {
      callback({ success: false, error: 'Not in a room' });
      return;
    }

    if (room.queue.length >= 50) {
      callback({ success: false, error: 'Queue is full (max 50 items)' });
      return;
    }

    const videoType = detectVideoType(data.url);
    if (!videoType) {
      callback({ success: false, error: 'Invalid URL. Paste a YouTube link or a direct video URL.' });
      return;
    }

    const videoId = videoType === 'youtube' ? extractVideoId(data.url)! : '';
    const user = room.users.get(socket.id);
    const item: QueueItem = {
      id: nanoid(),
      videoId,
      videoUrl: data.url,
      title: videoType === 'youtube' ? videoId : data.url.split('/').pop()?.split('?')[0] || 'Direct Video',
      addedBy: user?.name || 'Someone',
      addedAt: Date.now(),
    };

    room.queue.push(item);
    callback({ success: true });

    io.to(room.id).emit('queue:update', { queue: room.queue });

    // Fetch real title asynchronously for YouTube videos
    if (videoType === 'youtube') {
      fetchVideoTitle(videoId).then((title) => {
        item.title = title;
        io.to(room.id).emit('queue:update', { queue: room.queue });
      });
    }

    const systemMsg = addMessage(room, 'system', '');
    if (systemMsg) {
      systemMsg.text = `${item.addedBy} added a video to the queue`;
      systemMsg.userId = 'system';
      systemMsg.userName = 'System';
      systemMsg.avatar = '🤖';
      systemMsg.type = 'system';
      io.to(room.id).emit('chat:message', systemMsg);
    }
  });

  socket.on('queue:remove', (data) => {
    const room = getUserRoom(socket.id);
    if (!room) return;

    const idx = room.queue.findIndex((item) => item.id === data.itemId);
    if (idx === -1) return;

    room.queue.splice(idx, 1);
    io.to(room.id).emit('queue:update', { queue: room.queue });
  });

  socket.on('queue:reorder', (data) => {
    const room = getUserRoom(socket.id);
    if (!room) return;

    const idx = room.queue.findIndex((item) => item.id === data.itemId);
    if (idx === -1) return;

    const newIndex = Math.max(0, Math.min(data.newIndex, room.queue.length - 1));
    const [item] = room.queue.splice(idx, 1);
    room.queue.splice(newIndex, 0, item);

    io.to(room.id).emit('queue:update', { queue: room.queue });
  });

  socket.on('queue:play', (data) => {
    const room = getUserRoom(socket.id);
    if (!room) return;

    const idx = room.queue.findIndex((item) => item.id === data.itemId);
    if (idx === -1) return;

    const [item] = room.queue.splice(idx, 1);

    room.videoId = item.videoId;
    room.videoUrl = item.videoUrl;
    room.videoType = item.videoId ? 'youtube' : 'direct';
    room.isPlaying = true;
    room.currentTime = 0;
    room.lastSyncTime = Date.now();
    room.seq++;

    io.to(room.id).emit('video:load', getVideoState(room));
    io.to(room.id).emit('queue:update', { queue: room.queue });

    const systemMsg = addMessage(room, 'system', '');
    if (systemMsg) {
      systemMsg.text = `Now playing from queue: ${item.title}`;
      systemMsg.userId = 'system';
      systemMsg.userName = 'System';
      systemMsg.avatar = '🤖';
      systemMsg.type = 'system';
      io.to(room.id).emit('chat:message', systemMsg);
    }
  });

  socket.on('queue:play-next', () => {
    const room = getUserRoom(socket.id);
    if (!room) return;
    if (room.queue.length === 0) return;

    const next = room.queue.shift()!;

    room.videoId = next.videoId;
    room.videoUrl = next.videoUrl;
    room.videoType = next.videoId ? 'youtube' : 'direct';
    room.isPlaying = true;
    room.currentTime = 0;
    room.lastSyncTime = Date.now();
    room.seq++;

    io.to(room.id).emit('video:load', getVideoState(room));
    io.to(room.id).emit('queue:update', { queue: room.queue });

    const systemMsg = addMessage(room, 'system', '');
    if (systemMsg) {
      systemMsg.text = `Skipped to next in queue: ${next.title}`;
      systemMsg.userId = 'system';
      systemMsg.userName = 'System';
      systemMsg.avatar = '🤖';
      systemMsg.type = 'system';
      io.to(room.id).emit('chat:message', systemMsg);
    }
  });

  socket.on('chat:message', (data) => {
    const room = getUserRoom(socket.id);
    if (!room) return;

    const message = addMessage(room, socket.id, data.text);
    if (message) {
      io.to(room.id).emit('chat:message', message);
    }
  });

  socket.on('chat:delete', (data) => {
    const room = getUserRoom(socket.id)
    if (!room) return
    const deleted = deleteMessage(room, socket.id, data.messageId)
    if (deleted) {
      io.to(room.id).emit('chat:delete', { messageId: data.messageId })
    }
  })

  // --- Voice signaling ---
  socket.on('voice:join', () => {
    const room = getUserRoom(socket.id);
    if (!room) return;

    room.voiceUsers.add(socket.id);
    socket.to(room.id).emit('voice:user-joined', { userId: socket.id });
    socket.emit('voice:active-users', { userIds: Array.from(room.voiceUsers).filter((id) => id !== socket.id) });
  });

  socket.on('voice:leave', () => {
    const room = getUserRoom(socket.id);
    if (!room) return;

    room.voiceUsers.delete(socket.id);
    socket.to(room.id).emit('voice:user-left', { userId: socket.id });
  });

  socket.on('voice:offer', (data) => {
    io.to(data.to).emit('voice:offer', { from: socket.id, offer: data.offer });
  });

  socket.on('voice:answer', (data) => {
    io.to(data.to).emit('voice:answer', { from: socket.id, answer: data.answer });
  });

  socket.on('voice:ice-candidate', (data) => {
    io.to(data.to).emit('voice:ice-candidate', { from: socket.id, candidate: data.candidate });
  });

  // --- Screen share signaling ---
  socket.on('screen:start', () => {
    const room = getUserRoom(socket.id);
    if (!room) return;

    // Only one sharer at a time
    if (room.screenSharerId) {
      socket.emit('error', { message: 'Someone is already sharing their screen' });
      return;
    }

    room.screenSharerId = socket.id;
    socket.to(room.id).emit('screen:started', { sharerId: socket.id });

    // Notify the sharer about each existing user so they can create peer connections
    for (const [userId] of room.users) {
      if (userId !== socket.id) {
        socket.emit('screen:viewer-joined', { viewerId: userId });
      }
    }
  });

  socket.on('screen:stop', () => {
    const room = getUserRoom(socket.id);
    if (!room) return;

    if (room.screenSharerId === socket.id) {
      room.screenSharerId = null;
      socket.to(room.id).emit('screen:stopped');
    }
  });

  socket.on('screen:offer', (data) => {
    io.to(data.to).emit('screen:offer', { from: socket.id, offer: data.offer });
  });

  socket.on('screen:answer', (data) => {
    io.to(data.to).emit('screen:answer', { from: socket.id, answer: data.answer });
  });

  socket.on('screen:ice-candidate', (data) => {
    io.to(data.to).emit('screen:ice-candidate', { from: socket.id, candidate: data.candidate });
  });

  function handleDisconnect() {
    // Clean up voice before leaving room
    const roomBeforeLeave = getUserRoom(socket.id);
    if (roomBeforeLeave) {
      if (roomBeforeLeave.voiceUsers.has(socket.id)) {
        roomBeforeLeave.voiceUsers.delete(socket.id);
        socket.to(roomBeforeLeave.id).emit('voice:user-left', { userId: socket.id });
      }

      // Clean up screen share if this user was sharing
      if (roomBeforeLeave.screenSharerId === socket.id) {
        roomBeforeLeave.screenSharerId = null;
        socket.to(roomBeforeLeave.id).emit('screen:stopped');
      }
    }

    const result = leaveRoom(socket.id);
    if (!result) return;

    const { room, user, newHostId } = result;
    console.log(`[disconnect] ${user.name} left room ${room.id}`);

    socket.to(room.id).emit('room:user-left', {
      userId: user.id,
      userName: user.name,
    });

    const systemMsg = room.messages[room.messages.length - 1];
    if (systemMsg) {
      io.to(room.id).emit('chat:message', systemMsg);
    }

    if (newHostId) {
      io.to(room.id).emit('room:host-changed', { hostId: newHostId });
    }

    socket.leave(room.id);
  }

  socket.on('disconnect', () => {
    console.log(`[disconnect] ${socket.id}`);
    handleDisconnect();
  });
});

const PORT = parseInt(process.env.PORT || '3001', 10);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`WatchParty server running on port ${PORT}`);
});
