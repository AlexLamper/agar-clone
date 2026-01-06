import { EntityType, BaseEntity, Vector2 } from 'shared';
import { v4 as uuidv4 } from 'uuid';

export class EjectedMass implements BaseEntity {
    public id: string;
    public type: EntityType = EntityType.Projectile;
    public position: Vector2;
    public radius: number = 13;
    public color: string;
    public velocity: Vector2;

    // Decay friction
    public friction: number = 0.9;

    constructor(position: Vector2, color: string, velocity: Vector2) {
        this.id = uuidv4();
        this.position = position;
        this.color = color;
        this.velocity = velocity;
    }
}
