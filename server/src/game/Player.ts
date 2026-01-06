import { Player as PlayerState } from 'shared';
import { Cell } from './Cell.js';
import { WebSocket } from 'ws';

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
}
