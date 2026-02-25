export interface User {
  id: string;
  name: string;
  roomId: string;
  avatar: string;
}

export interface QueueItem {
  id: string;
  videoId: string;
  videoUrl: string;
  title: string;
  addedBy: string;
  addedAt: number;
}

export interface Room {
  id: string;
  hostId: string;
  users: Map<string, User>;
  videoUrl: string;
  videoId: string;
  videoType: 'youtube' | 'direct';
  isPlaying: boolean;
  currentTime: number;
  lastSyncTime: number;
  playbackRate: number;
  seq: number;
  queue: QueueItem[];
  messages: ChatMessage[];
  createdAt: number;
  voiceUsers: Set<string>;
  screenSharerId: string | null;
  isHidden: boolean;
}

export interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  avatar: string;
  text: string;
  timestamp: number;
  type: 'message' | 'system';
}

export interface VideoState {
  videoId: string;
  videoUrl: string;
  videoType: 'youtube' | 'direct';
  isPlaying: boolean;
  currentTime: number;
  playbackRate: number;
  timestamp: number;
  seq: number;
}

export interface ClientToServerEvents {
  'room:create': (data: { userName: string }, callback: (response: { roomId: string; userId: string }) => void) => void;
  'room:join': (data: { roomId: string; userName: string }, callback: (response: { success: boolean; error?: string; userId?: string }) => void) => void;
  'room:leave': () => void;
  'video:load': (data: { url: string }) => void;
  'video:play': () => void;
  'video:pause': (data: { currentTime: number }) => void;
  'video:seek': (data: { currentTime: number }) => void;
  'video:rate': (data: { rate: number }) => void;
  'video:ended': () => void;
  'queue:add': (data: { url: string }, callback: (response: { success: boolean; error?: string }) => void) => void;
  'queue:remove': (data: { itemId: string }) => void;
  'queue:reorder': (data: { itemId: string; newIndex: number }) => void;
  'queue:play': (data: { itemId: string }) => void;
  'queue:play-next': () => void;
  'chat:message': (data: { text: string }) => void;
  'chat:delete': (data: { messageId: string }) => void;
  'voice:join': () => void;
  'voice:leave': () => void;
  'voice:offer': (data: { to: string; offer: RTCSessionDescriptionInit }) => void;
  'voice:answer': (data: { to: string; answer: RTCSessionDescriptionInit }) => void;
  'voice:ice-candidate': (data: { to: string; candidate: RTCIceCandidateInit }) => void;
  'room:toggle-hidden': () => void;
  'screen:start': () => void;
  'screen:stop': () => void;
  'screen:offer': (data: { to: string; offer: RTCSessionDescriptionInit }) => void;
  'screen:answer': (data: { to: string; answer: RTCSessionDescriptionInit }) => void;
  'screen:ice-candidate': (data: { to: string; candidate: RTCIceCandidateInit }) => void;
}

export interface ServerToClientEvents {
  'room:state': (data: {
    roomId: string;
    users: User[];
    hostId: string;
    videoState: VideoState;
    messages: ChatMessage[];
    queue: QueueItem[];
    screenSharerId: string | null;
    isHidden: boolean;
  }) => void;
  'room:hidden-changed': (data: { isHidden: boolean }) => void;
  'room:user-joined': (data: { user: User }) => void;
  'room:user-left': (data: { userId: string; userName: string }) => void;
  'room:host-changed': (data: { hostId: string }) => void;
  'video:state-update': (data: VideoState) => void;
  'video:load': (data: VideoState) => void;
  'queue:update': (data: { queue: QueueItem[] }) => void;
  'chat:message': (data: ChatMessage) => void;
  'chat:delete': (data: { messageId: string }) => void;
  'voice:user-joined': (data: { userId: string }) => void;
  'voice:user-left': (data: { userId: string }) => void;
  'voice:offer': (data: { from: string; offer: RTCSessionDescriptionInit }) => void;
  'voice:answer': (data: { from: string; answer: RTCSessionDescriptionInit }) => void;
  'voice:ice-candidate': (data: { from: string; candidate: RTCIceCandidateInit }) => void;
  'voice:active-users': (data: { userIds: string[] }) => void;
  'screen:started': (data: { sharerId: string }) => void;
  'screen:stopped': () => void;
  'screen:offer': (data: { from: string; offer: RTCSessionDescriptionInit }) => void;
  'screen:answer': (data: { from: string; answer: RTCSessionDescriptionInit }) => void;
  'screen:ice-candidate': (data: { from: string; candidate: RTCIceCandidateInit }) => void;
  'screen:viewer-joined': (data: { viewerId: string }) => void;
  'video:heartbeat': (data: VideoState) => void;
  'error': (data: { message: string }) => void;
}
