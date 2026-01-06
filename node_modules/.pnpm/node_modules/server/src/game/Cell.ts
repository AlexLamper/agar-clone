import { EntityType, CellEntity, Vector2 } from 'shared';
import { v4 as uuidv4 } from 'uuid';

export class Cell implements CellEntity {
    public id: string;
    public type: EntityType.Player = EntityType.Player;
    public position: Vector2;
    public radius: number;
    public color: string;
    public playerId: string;
    public mass: number;
    
    public velocity: Vector2 = { x: 0, y: 0 };
    public target: Vector2 = { x: 0, y: 0 };
    public createdAt: number;

    constructor(playerId: string, position: Vector2, mass: number, color: string) {
        this.id = uuidv4();
        this.playerId = playerId;
        this.position = position;
        this.mass = mass;
        this.color = color;
        this.radius = Math.sqrt(this.mass * 100 / Math.PI); // Radius from mass
        this.createdAt = Date.now();
    }

    // Update mass and radius
    setMass(mass: number) {
        this.mass = mass;
        this.radius = Math.sqrt(this.mass * 100 / Math.PI);
    }
}
