import { Player as PlayerState, Vector2 } from 'shared';
import { Cell } from './Cell.js';
import { WebSocket } from 'ws';
import { World } from './World.js';
import { EjectedMass } from './EjectedMass.js';

export class Player implements PlayerState {
    public id: string;
    public name: string;
    public score: number = 0;
    public cells: Cell[] = [];
    public socket: WebSocket;

    // Progression
    public xp: number = 0;
    public level: number = 1;
    public coins: number = 0;
    public lastHourlyLine: number = 0;

    constructor(id: string, name: string, socket: WebSocket) {
        this.id = id;
        this.name = name;
        this.socket = socket;
    }

    addXp(amount: number) {
        this.xp += amount;
        this.checkLevelUp();
    }

    private checkLevelUp() {
        // Simple formula: Required = Level * 1000
        const required = this.level * 1000;
        if (this.xp >= required) {
            this.xp -= required;
            this.level++;
            // Reward: 100 coins per level
            this.coins += 100;
             this.checkLevelUp(); // Check again in case of massive XP gain
        }
    }

    getNextLevelXp(): number {
        return this.level * 1000;
    }

    addCell(cell: Cell) {
        this.cells.push(cell);
        this.updateScore();
    }

    removeCell(cellId: string) {
        this.cells = this.cells.filter(c => c.id !== cellId);
        this.updateScore();
    }

    updateScore() {
        this.score = this.cells.reduce((sum, cell) => sum + Math.floor(cell.mass), 0);
    }

    split(world: World, target: Vector2) {
        // Limit max cells
        if (this.cells.length >= 16) return;

        // Iterate on snapshot
        const currentCells = [...this.cells];
        let cellsAdded = 0;

        for (const cell of currentCells) {
            if (this.cells.length >= 16) break;
            if (cell.mass < 35) continue; // Minimum mass to split

            const newMass = cell.mass / 2;
            cell.setMass(newMass);

            // Direction calculation
            const dx = target.x - cell.position.x;
            const dy = target.y - cell.position.y;
            const dist = Math.sqrt(dx*dx + dy*dy) || 1;
            const dirX = dx / dist;
            const dirY = dy / dist;

            // Place new cell slightly ahead but close
            // Velocity will carry it.
            const startPos = {
                x: cell.position.x + dirX * (cell.radius * 0.1), 
                y: cell.position.y + dirY * (cell.radius * 0.1)
            };

            const newCell = new Cell(this.id, startPos, newMass, cell.color);
            newCell.target = target;
            // Boost - slightly stronger
            newCell.velocity = { x: dirX * 40, y: dirY * 40 };
            
            this.addCell(newCell);
            world.entities.push(newCell);
            cellsAdded++;
        }
    }

    eject(world: World, target: Vector2) {
        for (const cell of this.cells) {
            if (cell.mass < 35) continue;

            const loss = 18;
            cell.setMass(cell.mass - loss);
            this.updateScore();

            const dx = target.x - cell.position.x;
            const dy = target.y - cell.position.y;
            const dist = Math.sqrt(dx*dx + dy*dy) || 1;
            const dirX = dx / dist;
            const dirY = dy / dist;

            const startPos = {
                x: cell.position.x + dirX * (cell.radius + 20),
                y: cell.position.y + dirY * (cell.radius + 20)
            };

            const velocity = { x: dirX * 25, y: dirY * 25 };
            const ejected = new EjectedMass(startPos, cell.color, velocity);
            
            world.entities.push(ejected);
        }
    }
}

