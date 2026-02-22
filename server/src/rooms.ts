import { Room, User, ChatMessage, VideoState } from './types.js';
import { nanoid } from 'nanoid';

const rooms = new Map<string, Room>();

const AVATARS = [
  '🎬', '🍿', '🎮', '🎵', '🎨', '🚀', '⚡', '🔥',
  '💎', '🌟', '🎯', '🎪', '🎭', '🎸', '🎺', '🎻',
];

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function getRandomAvatar(): string {
  return AVATARS[Math.floor(Math.random() * AVATARS.length)];
}

export function createRoom(hostSocketId: string, userName: string): { room: Room; user: User } {
  let roomId = generateRoomCode();
  while (rooms.has(roomId)) {
    roomId = generateRoomCode();
  }

  const user: User = {
    id: hostSocketId,
    name: userName,
    roomId,
    avatar: getRandomAvatar(),
  };

  const room: Room = {
    id: roomId,
    hostId: hostSocketId,
    users: new Map([[hostSocketId, user]]),
    videoUrl: '',
    videoId: '',
    videoType: 'youtube',
    isPlaying: false,
    currentTime: 0,
    lastSyncTime: Date.now(),
    playbackRate: 1,
    seq: 0,
    queue: [],
    messages: [],
    createdAt: Date.now(),
    voiceUsers: new Set(),
    screenSharerId: null,
  };

  rooms.set(roomId, room);
  return { room, user };
}

export function joinRoom(roomId: string, socketId: string, userName: string): { room: Room; user: User } | null {
  const room = rooms.get(roomId.toUpperCase());
  if (!room) return null;

  const user: User = {
    id: socketId,
    name: userName,
    roomId: room.id,
    avatar: getRandomAvatar(),
  };

  room.users.set(socketId, user);

  const systemMsg: ChatMessage = {
    id: nanoid(),
    userId: 'system',
    userName: 'System',
    avatar: '🤖',
    text: `${userName} joined the room`,
    timestamp: Date.now(),
    type: 'system',
  };
  room.messages.push(systemMsg);

  return { room, user };
}

export function leaveRoom(socketId: string): { room: Room; user: User; newHostId?: string } | null {
  for (const [, room] of rooms) {
    const user = room.users.get(socketId);
    if (!user) continue;

    room.users.delete(socketId);

    const systemMsg: ChatMessage = {
      id: nanoid(),
      userId: 'system',
      userName: 'System',
      avatar: '🤖',
      text: `${user.name} left the room`,
      timestamp: Date.now(),
      type: 'system',
    };
    room.messages.push(systemMsg);

    if (room.users.size === 0) {
      rooms.delete(room.id);
      return { room, user };
    }

    let newHostId: string | undefined;
    if (room.hostId === socketId) {
      const firstUser = room.users.values().next().value;
      if (firstUser) {
        room.hostId = firstUser.id;
        newHostId = firstUser.id;
      }
    }

    return { room, user, newHostId };
  }
  return null;
}

export function getRoom(roomId: string): Room | undefined {
  return rooms.get(roomId.toUpperCase());
}

export function getUserRoom(socketId: string): Room | undefined {
  for (const [, room] of rooms) {
    if (room.users.has(socketId)) return room;
  }
  return undefined;
}

export function getRoomUsers(room: Room): User[] {
  return Array.from(room.users.values());
}

export function getVideoState(room: Room): VideoState {
  // Compute expected position at this moment (server-side only).
  // Clients use currentTime directly — no cross-clock math needed.
  let currentTime = room.currentTime;
  if (room.isPlaying) {
    const elapsed = (Date.now() - room.lastSyncTime) / 1000;
    currentTime += elapsed;
  }
  return {
    videoId: room.videoId,
    videoUrl: room.videoUrl,
    videoType: room.videoType,
    isPlaying: room.isPlaying,
    currentTime,
    playbackRate: room.playbackRate,
    timestamp: Date.now(),
    seq: room.seq,
  };
}

export function detectVideoType(url: string): 'youtube' | 'direct' | null {
  // Check YouTube first
  if (extractVideoId(url)) return 'youtube';

  // Check direct video URLs
  const directExtensions = /\.(mp4|webm|m3u8|mpd|ogg|mov|mkv)(\?.*)?$/i;
  if (directExtensions.test(url)) return 'direct';

  // Check for video MIME type hints in URL
  const videoMimeHints = /[?&](type|mime)=(video|application\/x-mpegURL|application\/dash\+xml)/i;
  if (videoMimeHints.test(url)) return 'direct';

  return null;
}

export function addMessage(room: Room, userId: string, text: string): ChatMessage | null {
  const user = room.users.get(userId);
  if (!user) return null;

  const message: ChatMessage = {
    id: nanoid(),
    userId: user.id,
    userName: user.name,
    avatar: user.avatar,
    text,
    timestamp: Date.now(),
    type: 'message',
  };

  room.messages.push(message);
  if (room.messages.length > 200) {
    room.messages = room.messages.slice(-200);
  }

  return message;
}

export function deleteMessage(room: Room, userId: string, messageId: string): boolean {
  const idx = room.messages.findIndex((m) => m.id === messageId && m.userId === userId)
  if (idx === -1) return false
  room.messages.splice(idx, 1)
  return true
}

export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export function getAllRooms(): Map<string, Room> {
  return rooms;
}

export function getRoomCount(): number {
  return rooms.size;
}

export function getTotalUsers(): number {
  let count = 0;
  for (const [, room] of rooms) {
    count += room.users.size;
  }
  return count;
}
