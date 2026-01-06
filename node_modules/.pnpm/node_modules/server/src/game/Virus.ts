import { EntityType, BaseEntity, Vector2 } from 'shared';
import { v4 as uuidv4 } from 'uuid';

export class Virus implements BaseEntity {
    public id: string;
    public type: EntityType = EntityType.Virus;
    public position: Vector2;
    public radius: number;
    public color: string = '#33FF33'; // Standard green
    public mass: number;

    constructor(position: Vector2, mass: number = 100) {
        this.id = uuidv4();
        this.position = position;
        this.mass = mass;
        this.radius = Math.sqrt(this.mass * 100 / Math.PI); // Logic same as cell
    }

    setMass(mass: number) {
        this.mass = mass;
        this.radius = Math.sqrt(this.mass * 100 / Math.PI);
    }
}
