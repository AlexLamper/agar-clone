import { Player as PlayerState, Vector2 } from 'shared';
import { Cell } from './Cell.js';
import { WebSocket } from 'ws';
import { World } from './World.js';
import { EjectedMass } from './EjectedMass.js';
import { LEVELS } from 'shared';

export class Player implements PlayerState {
    public id: string;
    public name: string;
    public score: number = 0;
    public cells: Cell[] = [];
    public socket: WebSocket;
    public skin?: string;

    // Progression
    public xp: number = 0;
    public level: number = 1;
    public coins: number = 0;
    public lastHourlyLine: number = 0;

    // Match Stats
    public spawnTime: number = 0;
    public foodEaten: number = 0;
    public cellsEaten: number = 0;
    public highestMass: number = 0;
    public leaderboardTime: number = 0;
    public topPosition: number = 0;

    constructor(id: string, name: string, socket: WebSocket, skin?: string) {
        this.id = id;
        this.name = name;
        this.socket = socket;
        this.skin = skin;
    }

    addXp(amount: number) {
        this.xp += amount;
        this.checkLevelUp();
    }

    private checkLevelUp() {
        let required = this.getNextLevelXp();
        
        while (this.xp >= required && this.level < 100) {
            this.xp -= required;
            this.level++;
            // Reward: 100 coins per level (kept from previous logic for fun)
            this.coins += 100;
            required = this.getNextLevelXp();
        }
        
        // Cap level 100
        if (this.level >= 100) {
            this.xp = 0;
        }
    }

    getNextLevelXp(): number {
        // Look up table
        // Levels are 1-based, array 0-based. Index = Level - 1
        const levelData = LEVELS[this.level - 1]; // Current level data
        return levelData ? levelData.xp : Infinity;
    }
    
    getStartingMass(): number {
         const levelData = LEVELS[this.level - 1];
         // Logic for Facebook boost not implemented fully (authentication), 
         // but assuming logged in / bonus capable:
         // Returning base mass from table.
         // +5 mass boost is effectively handled by levels table if we want?
         // User provided: Level 1 -> 10 mass.
         return levelData ? levelData.mass : 10;
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

            const newCell = new Cell(this.id, startPos, newMass, cell.color, cell.skin);
            newCell.target = target;
            // Boost - slightly stronger
            newCell.velocity = { x: dirX * 40, y: dirY * 40 };
            
            // XP for Splitting:
            // "The more you split, the more XP you gain per cell. 
            // Let us say for example you have a cell with 500 mass, you will gain double the XP if you have two 250 cells."
            // Formula idea: Gain XP proportional to the mass of the split cell?
            // Assuming simplified: +XP equal to mass of new cell? Or a fraction.
            // Let's give 1 XP per 10 mass split.
            this.addXp(Math.max(1, Math.floor(newMass / 10)));

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

