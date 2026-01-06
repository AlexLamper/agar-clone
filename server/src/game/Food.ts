import { EntityType, FoodEntity, Vector2 } from 'shared';
import { v4 as uuidv4 } from 'uuid';

export class Food implements FoodEntity {
    public id: string;
    public type: EntityType.Food = EntityType.Food;
    public position: Vector2;
    public radius: number = 8; // Slightly bigger (was 5)
    public color: string;

    constructor(position: Vector2, color: string) {
        this.id = uuidv4();
        this.position = position;
        this.color = color;
    }
}
