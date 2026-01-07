export interface Vector2 {
    x: number;
    y: number;
}

export enum EntityType {
    Player = 0,
    Food = 1,
    Virus = 2,
    Projectile = 3 // Ejected mass
}

export interface BaseEntity {
    id: string;
    type: EntityType;
    position: Vector2;
    radius: number;
    color: string;
    skin?: string;
}

export interface Player {
    id: string;
    name: string;
    score: number;
}

// A cell belonging to a player
export interface CellEntity extends BaseEntity {
    type: EntityType.Player;
    playerId: string; // The owner player ID
    mass: number;
}

export interface FoodEntity extends BaseEntity {
    type: EntityType.Food;
}

export interface GameState {
    entities: Record<string, BaseEntity>; // Simplified for MVP, maybe optimize later
    players: Record<string, Player>;
    worldSize: number;
}
