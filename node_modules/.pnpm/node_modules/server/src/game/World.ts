import { BaseEntity, EntityType, InputMessage, Vector2 } from 'shared';
import { Cell } from './Cell.js';
import { Player } from './Player.js';
import { Food } from './Food.js';

const WORLD_SIZE = 2000;
const MAX_FOOD = 500;
const BASE_SPEED = 5;

export class World {
    public entities: BaseEntity[] = [];
    public players: Map<string, Player> = new Map();
    public width: number = WORLD_SIZE;
    public height: number = WORLD_SIZE;

    constructor() {
        this.spawnFood(100);
    }

    addPlayer(player: Player) {
        this.players.set(player.id, player);
        // Spawn initial cell
        const pos = this.getRandomPosition();
        const cell = new Cell(player.id, pos, 20, this.getRandomColor());
        player.addCell(cell);
        this.entities.push(cell);
    }

    removePlayer(playerId: string) {
        const player = this.players.get(playerId);
        if (player) {
            player.cells.forEach(c => {
                this.entities = this.entities.filter(e => e.id !== c.id);
            });
            this.players.delete(playerId);
        }
    }

    handleInput(playerId: string, input: InputMessage['target']) {
        const player = this.players.get(playerId);
        if (!player) return;

        player.cells.forEach(cell => {
            cell.target = input;
        });
    }

    tick() {
        // Move cells
        this.players.forEach(player => {
            player.cells.forEach(cell => {
                this.moveCell(cell);
                this.constrainMap(cell);
            });
        });

        // Collisions
        this.checkCollisions();

        // Spawn food
        if (this.entities.filter(e => e.type === EntityType.Food).length < MAX_FOOD) {
            this.spawnFood(5);
        }
    }

    private moveCell(cell: Cell) {
        const dx = cell.target.x - cell.position.x;
        const dy = cell.target.y - cell.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist === 0) return;

        // Speed formula: Lower speed for higher mass
        // Using a simple decay curve
        const speed = Math.max(BASE_SPEED * Math.pow(cell.mass, -0.4) * 10, 1);
        
        // Normalize and scale
        const moveDist = Math.min(speed, dist);
        cell.position.x += (dx / dist) * moveDist;
        cell.position.y += (dy / dist) * moveDist;
    }

    private constrainMap(cell: Cell) {
        cell.position.x = Math.max(0, Math.min(this.width, cell.position.x));
        cell.position.y = Math.max(0, Math.min(this.height, cell.position.y));
    }

    private checkCollisions() {
        // Naive O(N^2) for now
        // Player vs Food
        const foods = this.entities.filter(e => e.type === EntityType.Food) as Food[];
        
        this.players.forEach(player => {
            player.cells.forEach(cell => {
                // Check food
                for (let i = foods.length - 1; i >= 0; i--) {
                    const food = foods[i];
                    if (this.getDistance(cell.position, food.position) < cell.radius) {
                        // Eat food
                        cell.setMass(cell.mass + 1);
                        this.entities = this.entities.filter(e => e.id !== food.id);
                        foods.splice(i, 1);
                    }
                }

                // Check other players (eating)
                this.players.forEach(otherPlayer => {
                    otherPlayer.cells.forEach(otherCell => {
                        if (cell.id === otherCell.id) return;
                        if (cell.playerId === otherCell.playerId) return; // No self-eat yet

                        // Eat condition: 20% larger + overlap center
                        if (cell.mass > otherCell.mass * 1.25 && 
                            this.getDistance(cell.position, otherCell.position) < cell.radius - otherCell.radius * 0.5) {
                            
                            cell.setMass(cell.mass + otherCell.mass);
                            otherPlayer.removeCell(otherCell.id);
                            this.entities = this.entities.filter(e => e.id !== otherCell.id);
                            
                            // If player dead
                            if (otherPlayer.cells.length === 0) {
                                // Send game over? Or respawn logic handled by Server
                            }
                        }
                    });
                });
            });
        });
    }

    private spawnFood(count: number) {
        for (let i = 0; i < count; i++) {
            const pos = this.getRandomPosition();
            const food = new Food(pos, this.getRandomColor());
            this.entities.push(food);
        }
    }

    private getRandomPosition(): Vector2 {
        return {
            x: Math.random() * this.width,
            y: Math.random() * this.height
        };
    }

    private getRandomColor(): string {
        const colors = ['#FF5555', '#55FF55', '#5555FF', '#FFFF55', '#FF55FF', '#55FFFF'];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    private getDistance(a: Vector2, b: Vector2): number {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
}
