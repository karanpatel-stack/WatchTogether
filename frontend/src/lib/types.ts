export interface User {
  id: string;
  name: string;
  roomId: string;
  avatar: string;
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

export interface QueueItem {
  id: string;
  videoId: string;
  videoUrl: string;
  title: string;
  addedBy: string;
  addedAt: number;
}

export interface RoomState {
  roomId: string;
  users: User[];
  hostId: string;
  videoState: VideoState;
  messages: ChatMessage[];
  queue: QueueItem[];
  screenSharerId: string | null;
}
