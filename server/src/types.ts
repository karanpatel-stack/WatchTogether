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
  'voice:join': (callback: (response: { rtpCapabilities: unknown; existingProducers: { socketId: string; producerId: string }[] }) => void) => void;
  'voice:leave': () => void;
  'voice:create-send-transport': (callback: (response: { id: string; iceParameters: unknown; iceCandidates: unknown; dtlsParameters: unknown } | null) => void) => void;
  'voice:create-recv-transport': (callback: (response: { id: string; iceParameters: unknown; iceCandidates: unknown; dtlsParameters: unknown } | null) => void) => void;
  'voice:connect-transport': (data: { transportId: string; dtlsParameters: unknown }, callback: (response: { connected: boolean }) => void) => void;
  'voice:produce': (data: { kind: string; rtpParameters: unknown }, callback: (response: { producerId: string | null }) => void) => void;
  'voice:consume': (data: { producerId: string; rtpCapabilities: unknown }, callback: (response: { id: string; producerId: string; kind: string; rtpParameters: unknown } | null) => void) => void;
  'voice:resume-consumer': (data: { consumerId: string }, callback: (response: { resumed: boolean }) => void) => void;
  'voice:pause-producer': () => void;
  'voice:resume-producer': () => void;
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
  }) => void;
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
  'voice:new-producer': (data: { socketId: string; producerId: string }) => void;
  'voice:producer-closed': (data: { socketId: string; producerId: string }) => void;
  'screen:started': (data: { sharerId: string }) => void;
  'screen:stopped': () => void;
  'screen:offer': (data: { from: string; offer: RTCSessionDescriptionInit }) => void;
  'screen:answer': (data: { from: string; answer: RTCSessionDescriptionInit }) => void;
  'screen:ice-candidate': (data: { from: string; candidate: RTCIceCandidateInit }) => void;
  'screen:viewer-joined': (data: { viewerId: string }) => void;
  'video:heartbeat': (data: VideoState) => void;
  'error': (data: { message: string }) => void;
}
