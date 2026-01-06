import type { BaseEntity, Player, Vector2 } from "./types.js";

export enum MessageType {
    JOIN = 'join',
    INPUT = 'input',
    INIT = 'init',
    UPDATE = 'update',
    LEADERBOARD = 'leaderboard',
    GAME_OVER = 'game_over',
    STATS = 'stats',
    CLAIM_HOURLY = 'claim_hourly'
}

// Client -> Server
export interface JoinMessage {
    type: MessageType.JOIN;
    name: string;
    color?: string;
}

export interface ClaimHourlyMessage {
    type: MessageType.CLAIM_HOURLY;
}

export interface InputMessage {
    type: MessageType.INPUT;
    target: Vector2;
    split?: boolean;
    eject?: boolean;
}

// Server -> Client
export interface InitMessage {
    type: MessageType.INIT;
    worldSize: number;
    playerId: string;
    entities: BaseEntity[];
    players: Player[];
    coins: number;
    level: number;
    xp: number;
    nextLevelXp: number;
}

export interface StatsMessage {
    type: MessageType.STATS;
    coins: number;
    level: number;
    xp: number;
    nextLevelXp: number;
    hourlyAvailable: boolean; // Tell client if they can claim
    hourlyTimeLeft?: number; // ms left if not available
}

export interface UpdateMessage {
    type: MessageType.UPDATE;
    entities: BaseEntity[]; // List of visible entities (could be diffs later)
    removedEntityIds: string[];
}

export interface LeaderboardMessage {
    type: MessageType.LEADERBOARD;
    entries: { name: string; score: number }[];
}

export interface GameOverMessage {
    type: MessageType.GAME_OVER;
    reason: string;
}

export type ClientMessage = JoinMessage | InputMessage;
export type ServerMessage = InitMessage | UpdateMessage | LeaderboardMessage | GameOverMessage;
