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

    constructor(id: string, name: string, socket: WebSocket) {
        this.id = id;
        this.name = name;
        this.socket = socket;
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

            // Place new cell slightly ahead
            // Radius of new cell
            const newRadius = Math.sqrt(newMass * 100 / Math.PI);
            
            // Should place it such that they don't instantly merge or are clearly separated?
            // Usually starts at same center but has high velocity. I'll offset it by radius.
            const startPos = {
                x: cell.position.x + dirX * (cell.radius + 5), 
                y: cell.position.y + dirY * (cell.radius + 5)
            };

            const newCell = new Cell(this.id, startPos, newMass, cell.color);
            newCell.target = target;
            // Boost
            newCell.velocity = { x: dirX * 20, y: dirY * 20 };
            
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

