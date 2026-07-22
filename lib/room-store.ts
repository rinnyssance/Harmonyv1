export interface HarmonyUser {
  username: string;
  color: string;
}

export interface HarmonyMessage {
  id: string;
  roomId: string;
  username: string;
  color: string;
  text: string;
  createdAt: number;
}

export interface StoredRoom {
  id: string;
  name: string;
  notesCount: number;
  isPrivate: boolean;
  accessCode?: string;
  isDefault: boolean;
  createdAt: number;
}

export interface CreateRoomInput {
  name: string;
  isPrivate: boolean;
  accessCode?: string;
}

export interface RoomStore {
  listRooms(): Promise<StoredRoom[]>;
  getRoom(roomId: string): Promise<StoredRoom | null>;
  createRoom(input: CreateRoomInput): Promise<StoredRoom>;
  incrementNotes(roomId: string): Promise<void>;
  getMessages(roomId: string): Promise<HarmonyMessage[]>;
  addMessage(roomId: string, message: HarmonyMessage): Promise<void>;
  pruneInactiveRooms(activeRoomIds: Set<string>, olderThan: number): Promise<number>;
}

interface HarmonyRedisTransaction {
  rPush(key: string, value: string): HarmonyRedisTransaction;
  lTrim(key: string, start: number, stop: number): HarmonyRedisTransaction;
  hDel(key: string, field: string): HarmonyRedisTransaction;
  del(key: string): HarmonyRedisTransaction;
  exec(): Promise<unknown>;
}

export interface HarmonyRedisClient {
  hSetNX(key: string, field: string, value: string): Promise<unknown>;
  hSet(key: string, field: string, value: string): Promise<unknown>;
  hGet(key: string, field: string): Promise<unknown>;
  hGetAll(key: string): Promise<Record<string, unknown>>;
  hLen(key: string): Promise<unknown>;
  hIncrBy(key: string, field: string, increment: number): Promise<unknown>;
  lRange(key: string, start: number, stop: number): Promise<unknown[]>;
  multi(): HarmonyRedisTransaction;
}

const MAX_ROOMS = 100;
const MAX_MESSAGES = 100;
const ROOMS_KEY = "harmony:rooms:v1";
const NOTES_KEY = "harmony:room-notes:v1";

const DEFAULT_ROOMS: Array<Omit<StoredRoom, "notesCount">> = [
  {
    id: "sunset-lounge",
    name: "Sunset Lounge 🌅",
    isPrivate: false,
    isDefault: true,
    createdAt: 0,
  },
  {
    id: "lavender-clouds",
    name: "Lavender Clouds ☁️",
    isPrivate: false,
    isDefault: true,
    createdAt: 0,
  },
  {
    id: "golden-hour",
    name: "Golden Hour 🎹",
    isPrivate: false,
    isDefault: true,
    createdAt: 0,
  },
];

function roomMessageKey(roomId: string) {
  return `harmony:room:${roomId}:messages:v1`;
}

function roomSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "sunset-room";
}

function parseRoom(value: string, notesCount = 0): StoredRoom | null {
  try {
    const room = JSON.parse(value) as Omit<StoredRoom, "notesCount">;
    if (!room.id || !room.name) return null;
    return { ...room, notesCount };
  } catch {
    return null;
  }
}

class MemoryRoomStore implements RoomStore {
  private readonly rooms = new Map<string, StoredRoom>();
  private readonly messages = new Map<string, HarmonyMessage[]>();

  constructor() {
    for (const room of DEFAULT_ROOMS) {
      this.rooms.set(room.id, { ...room, notesCount: 0 });
      this.messages.set(room.id, []);
    }
  }

  async listRooms() {
    return [...this.rooms.values()];
  }

  async getRoom(roomId: string) {
    return this.rooms.get(roomId) ?? null;
  }

  async createRoom(input: CreateRoomInput) {
    if (this.rooms.size >= MAX_ROOMS) throw new Error("Harmony has reached its room limit. Try again later.");

    const baseId = roomSlug(input.name);
    let id = baseId;
    let suffix = 2;
    while (this.rooms.has(id)) id = `${baseId}-${suffix++}`;

    const room: StoredRoom = {
      id,
      name: input.name,
      notesCount: 0,
      isPrivate: input.isPrivate,
      accessCode: input.accessCode,
      isDefault: false,
      createdAt: Date.now(),
    };
    this.rooms.set(id, room);
    this.messages.set(id, []);
    return room;
  }

  async incrementNotes(roomId: string) {
    const room = this.rooms.get(roomId);
    if (room) room.notesCount += 1;
  }

  async getMessages(roomId: string) {
    return this.messages.get(roomId) ?? [];
  }

  async addMessage(roomId: string, message: HarmonyMessage) {
    const messages = this.messages.get(roomId) ?? [];
    messages.push(message);
    if (messages.length > MAX_MESSAGES) messages.shift();
    this.messages.set(roomId, messages);
  }

  async pruneInactiveRooms(activeRoomIds: Set<string>, olderThan: number) {
    let removed = 0;
    for (const room of this.rooms.values()) {
      if (!room.isDefault && room.createdAt < olderThan && !activeRoomIds.has(room.id)) {
        this.rooms.delete(room.id);
        this.messages.delete(room.id);
        removed += 1;
      }
    }
    return removed;
  }
}

class RedisRoomStore implements RoomStore {
  constructor(private readonly client: HarmonyRedisClient) {}

  async initialize() {
    for (const room of DEFAULT_ROOMS) {
      await this.client.hSetNX(ROOMS_KEY, room.id, JSON.stringify(room));
      await this.client.hSetNX(NOTES_KEY, room.id, "0");
    }
  }

  async listRooms() {
    const [roomValues, noteValues] = await Promise.all([
      this.client.hGetAll(ROOMS_KEY),
      this.client.hGetAll(NOTES_KEY),
    ]);

    return Object.entries(roomValues)
      .map(([id, value]) => parseRoom(String(value), Number(noteValues[id] ?? 0)))
      .filter((room): room is StoredRoom => room !== null);
  }

  async getRoom(roomId: string) {
    const [value, notes] = await Promise.all([
      this.client.hGet(ROOMS_KEY, roomId),
      this.client.hGet(NOTES_KEY, roomId),
    ]);
    return value ? parseRoom(String(value), Number(notes ?? 0)) : null;
  }

  async createRoom(input: CreateRoomInput) {
    if (Number(await this.client.hLen(ROOMS_KEY)) >= MAX_ROOMS) {
      throw new Error("Harmony has reached its room limit. Try again later.");
    }

    const baseId = roomSlug(input.name);
    for (let suffix = 1; suffix <= MAX_ROOMS + 1; suffix += 1) {
      const id = suffix === 1 ? baseId : `${baseId}-${suffix}`;
      const storedRoom: Omit<StoredRoom, "notesCount"> = {
        id,
        name: input.name,
        isPrivate: input.isPrivate,
        accessCode: input.accessCode,
        isDefault: false,
        createdAt: Date.now(),
      };
      if (await this.client.hSetNX(ROOMS_KEY, id, JSON.stringify(storedRoom))) {
        await this.client.hSet(NOTES_KEY, id, "0");
        return { ...storedRoom, notesCount: 0 };
      }
    }

    throw new Error("Could not create a unique room name.");
  }

  async incrementNotes(roomId: string) {
    await this.client.hIncrBy(NOTES_KEY, roomId, 1);
  }

  async getMessages(roomId: string) {
    const values = await this.client.lRange(roomMessageKey(roomId), 0, -1);
    return values.flatMap((value) => {
      try {
        return [JSON.parse(String(value)) as HarmonyMessage];
      } catch {
        return [];
      }
    });
  }

  async addMessage(roomId: string, message: HarmonyMessage) {
    await this.client
      .multi()
      .rPush(roomMessageKey(roomId), JSON.stringify(message))
      .lTrim(roomMessageKey(roomId), -MAX_MESSAGES, -1)
      .exec();
  }

  async pruneInactiveRooms(activeRoomIds: Set<string>, olderThan: number) {
    const rooms = await this.listRooms();
    const expired = rooms.filter(
      (room) => !room.isDefault && room.createdAt < olderThan && !activeRoomIds.has(room.id),
    );
    if (!expired.length) return 0;

    const transaction = this.client.multi();
    for (const room of expired) {
      transaction.hDel(ROOMS_KEY, room.id);
      transaction.hDel(NOTES_KEY, room.id);
      transaction.del(roomMessageKey(room.id));
    }
    await transaction.exec();
    return expired.length;
  }
}

export async function createRoomStore(redisClient?: HarmonyRedisClient): Promise<RoomStore> {
  if (!redisClient) return new MemoryRoomStore();

  const store = new RedisRoomStore(redisClient);
  await store.initialize();
  return store;
}
