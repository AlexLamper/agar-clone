import { BaseEntity, Player, Vector2 } from "./types.js";

export enum MessageType {
    JOIN = 'join',
    INPUT = 'input',
    INIT = 'init',
    UPDATE = 'update',
    LEADERBOARD = 'leaderboard',
    GAME_OVER = 'game_over'
}

// Client -> Server
export interface JoinMessage {
    type: MessageType.JOIN;
    name: string;
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
