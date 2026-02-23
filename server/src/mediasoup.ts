import * as mediasoup from 'mediasoup';
import { networkInterfaces } from 'os';
import type {
  Worker,
  Router,
  WebRtcServer,
  WebRtcTransport,
  Producer,
  Consumer,
} from 'mediasoup/node/lib/types.js';
import type { RouterRtpCodecCapability } from 'mediasoup/node/lib/rtpParametersTypes.js';

// ——— Configuration ———

const ANNOUNCED_IP = process.env.MEDIASOUP_ANNOUNCED_IP || '';
const LISTEN_PORT = parseInt(process.env.MEDIASOUP_PORT || '40000', 10);
const NUM_WORKERS = parseInt(process.env.MEDIASOUP_NUM_WORKERS || '1', 10);

/** Auto-detect the first non-loopback IPv4 address */
function getLocalIp(): string {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

const mediaCodecs: RouterRtpCodecCapability[] = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
  },
];

// ——— State ———

interface PeerState {
  sendTransport: WebRtcTransport | null;
  recvTransport: WebRtcTransport | null;
  producer: Producer | null;
  consumers: Map<string, Consumer>; // keyed by consumer.id
}

interface RoomState {
  router: Router;
  peers: Map<string, PeerState>; // keyed by socketId
}

const workers: Worker[] = [];
const webRtcServers: WebRtcServer[] = [];
let nextWorkerIdx = 0;
const rooms = new Map<string, RoomState>();

// ——— Worker Management ———

export async function createWorkers(): Promise<void> {
  const announcedAddress = ANNOUNCED_IP || getLocalIp();

  for (let i = 0; i < NUM_WORKERS; i++) {
    const worker = await mediasoup.createWorker({
      logLevel: 'warn',
    });

    worker.on('died', () => {
      console.error(`mediasoup Worker ${worker.pid} died, exiting...`);
      process.exit(1);
    });

    // Create a WebRtcServer per worker — shares a single port for all transports
    const port = LISTEN_PORT + i;
    const webRtcServer = await worker.createWebRtcServer({
      listenInfos: [
        { protocol: 'udp', ip: '0.0.0.0', announcedAddress, port },
        { protocol: 'tcp', ip: '0.0.0.0', announcedAddress, port },
      ],
    });

    workers.push(worker);
    webRtcServers.push(webRtcServer);
    console.log(`[mediasoup] Worker ${worker.pid} + WebRtcServer on port ${port} (announced: ${announcedAddress})`);
  }
}

function getNextWorkerIdx(): number {
  const idx = nextWorkerIdx;
  nextWorkerIdx = (nextWorkerIdx + 1) % workers.length;
  return idx;
}

// ——— Router (per room) ———

export async function getOrCreateRouter(roomId: string): Promise<Router> {
  const existing = rooms.get(roomId);
  if (existing) return existing.router;

  const idx = getNextWorkerIdx();
  const worker = workers[idx];
  const router = await worker.createRouter({ mediaCodecs });

  rooms.set(roomId, { router, peers: new Map() });
  console.log(`[mediasoup] Router created for room ${roomId}`);
  return router;
}

export function getRtpCapabilities(roomId: string): mediasoup.types.RtpCapabilities | null {
  const room = rooms.get(roomId);
  return room ? room.router.rtpCapabilities : null;
}

// ——— Transport ———

export async function createWebRtcTransport(
  roomId: string,
  socketId: string,
  direction: 'send' | 'recv'
): Promise<{
  id: string;
  iceParameters: mediasoup.types.IceParameters;
  iceCandidates: mediasoup.types.IceCandidate[];
  dtlsParameters: mediasoup.types.DtlsParameters;
} | null> {
  const room = rooms.get(roomId);
  if (!room) return null;

  // Use the first WebRtcServer (single-worker setup)
  // For multi-worker, you'd map room -> worker index
  const webRtcServer = webRtcServers[0];

  const transport = await room.router.createWebRtcTransport({
    webRtcServer,
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate: 600000,
  });

  // Log transport lifecycle events for debugging
  transport.on('icestatechange', (iceState) => {
    console.log(`[mediasoup] Transport ${transport.id} (${direction}) ICE: ${iceState}`);
  });
  transport.on('dtlsstatechange', (dtlsState) => {
    console.log(`[mediasoup] Transport ${transport.id} (${direction}) DTLS: ${dtlsState}`);
    if (dtlsState === 'failed' || dtlsState === 'closed') {
      console.warn(`[mediasoup] Transport ${transport.id} (${direction}) DTLS ${dtlsState}`);
    }
  });
  // Ensure peer state exists
  if (!room.peers.has(socketId)) {
    room.peers.set(socketId, {
      sendTransport: null,
      recvTransport: null,
      producer: null,
      consumers: new Map(),
    });
  }

  const peer = room.peers.get(socketId)!;
  if (direction === 'send') {
    peer.sendTransport?.close();
    peer.sendTransport = transport;
  } else {
    peer.recvTransport?.close();
    peer.recvTransport = transport;
  }

  return {
    id: transport.id,
    iceParameters: transport.iceParameters,
    iceCandidates: transport.iceCandidates,
    dtlsParameters: transport.dtlsParameters,
  };
}

export async function connectTransport(
  roomId: string,
  socketId: string,
  transportId: string,
  dtlsParameters: mediasoup.types.DtlsParameters
): Promise<boolean> {
  const peer = rooms.get(roomId)?.peers.get(socketId);
  if (!peer) return false;

  const transport =
    peer.sendTransport?.id === transportId
      ? peer.sendTransport
      : peer.recvTransport?.id === transportId
        ? peer.recvTransport
        : null;

  if (!transport) return false;

  await transport.connect({ dtlsParameters });
  return true;
}

// ——— Producer ———

export async function produce(
  roomId: string,
  socketId: string,
  kind: mediasoup.types.MediaKind,
  rtpParameters: mediasoup.types.RtpParameters
): Promise<string | null> {
  const peer = rooms.get(roomId)?.peers.get(socketId);
  if (!peer?.sendTransport) return null;

  const producer = await peer.sendTransport.produce({ kind, rtpParameters });

  producer.on('transportclose', () => {
    peer.producer = null;
  });

  peer.producer = producer;
  return producer.id;
}

export function pauseProducer(roomId: string, socketId: string): void {
  const peer = rooms.get(roomId)?.peers.get(socketId);
  peer?.producer?.pause();
}

export function resumeProducer(roomId: string, socketId: string): void {
  const peer = rooms.get(roomId)?.peers.get(socketId);
  peer?.producer?.resume();
}

// ——— Consumer ———

export async function consume(
  roomId: string,
  socketId: string,
  producerId: string,
  rtpCapabilities: mediasoup.types.RtpCapabilities
): Promise<{
  id: string;
  producerId: string;
  kind: mediasoup.types.MediaKind;
  rtpParameters: mediasoup.types.RtpParameters;
} | null> {
  const room = rooms.get(roomId);
  if (!room) return null;

  if (!room.router.canConsume({ producerId, rtpCapabilities })) {
    console.warn(`[mediasoup] Cannot consume producer ${producerId} for ${socketId}`);
    return null;
  }

  const peer = room.peers.get(socketId);
  if (!peer?.recvTransport) return null;

  const consumer = await peer.recvTransport.consume({
    producerId,
    rtpCapabilities,
    paused: true, // start paused, client resumes after setup
  });

  consumer.on('transportclose', () => {
    peer.consumers.delete(consumer.id);
  });

  consumer.on('producerclose', () => {
    peer.consumers.delete(consumer.id);
  });

  peer.consumers.set(consumer.id, consumer);

  return {
    id: consumer.id,
    producerId: consumer.producerId,
    kind: consumer.kind,
    rtpParameters: consumer.rtpParameters,
  };
}

export async function resumeConsumer(
  roomId: string,
  socketId: string,
  consumerId: string
): Promise<boolean> {
  const peer = rooms.get(roomId)?.peers.get(socketId);
  if (!peer) return false;

  const consumer = peer.consumers.get(consumerId);
  if (!consumer) return false;

  await consumer.resume();
  return true;
}

// ——— Peer Cleanup ———

/** Returns the producerId that was closed (so callers can notify the room), or null */
export function removePeer(roomId: string, socketId: string): string | null {
  const room = rooms.get(roomId);
  if (!room) return null;

  const peer = room.peers.get(socketId);
  if (!peer) return null;

  const producerId = peer.producer?.id ?? null;

  // Close all consumers
  for (const [, consumer] of peer.consumers) {
    consumer.close();
  }

  // Close producer
  peer.producer?.close();

  // Close transports
  peer.sendTransport?.close();
  peer.recvTransport?.close();

  room.peers.delete(socketId);
  return producerId;
}

/** Returns list of existing producer IDs + their socket IDs for a room (excluding the given socket) */
export function getExistingProducers(
  roomId: string,
  excludeSocketId: string
): { socketId: string; producerId: string }[] {
  const room = rooms.get(roomId);
  if (!room) return [];

  const result: { socketId: string; producerId: string }[] = [];
  for (const [sid, peer] of room.peers) {
    if (sid !== excludeSocketId && peer.producer && !peer.producer.closed) {
      result.push({ socketId: sid, producerId: peer.producer.id });
    }
  }
  return result;
}

/** Clean up room router when room empties */
export function cleanupRoom(roomId: string): void {
  const room = rooms.get(roomId);
  if (!room) return;

  if (room.peers.size === 0) {
    room.router.close();
    rooms.delete(roomId);
    console.log(`[mediasoup] Router closed for room ${roomId}`);
  }
}

/** Initialize peer state when joining voice (before transport creation) */
export function ensurePeer(roomId: string, socketId: string): void {
  const room = rooms.get(roomId);
  if (!room) return;

  if (!room.peers.has(socketId)) {
    room.peers.set(socketId, {
      sendTransport: null,
      recvTransport: null,
      producer: null,
      consumers: new Map(),
    });
  }
}
