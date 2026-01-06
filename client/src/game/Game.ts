import { MessageType } from 'shared';
import type { BaseEntity, ServerMessage, Player } from 'shared';
import { Input } from './Input';
import { Renderer } from './Renderer';
import { Socket } from '../net/Socket';

export class Game {
    private canvas: HTMLCanvasElement;
    private renderer: Renderer;
    private input: Input;
    private socket: Socket;

    private entities: BaseEntity[] = [];
    private players: Player[] = []; // for leaderboard
    private leaderboard: {name: string, score: number}[] = [];
    private me: Player | undefined;
    private worldSize: number = 2000;
    
    private isRunning: boolean = false;

    constructor() {
        this.canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
        this.renderer = new Renderer(this.canvas);
        this.input = new Input(this.canvas);
        
        // Auto connect
        this.socket = new Socket('ws://localhost:3000', (msg) => this.handleMessage(msg));

        this.setupUI();
    }

    private setupUI() {
        const btn = document.getElementById('playBtn');
        const input = document.getElementById('playerName') as HTMLInputElement;
        const overlay = document.getElementById('loginOverlay');

        btn?.addEventListener('click', () => {
             const name = input.value || 'Guest';
             this.socket.sendJoin(name);
             if (overlay) overlay.style.display = 'none';
             this.start();
        });
    }

    start() {
        console.log('Starting game loop');
        if (this.isRunning) return;
        this.isRunning = true;
        this.loop();
    }

    private loop() {
        if (!this.isRunning) return;
        requestAnimationFrame(() => this.loop());

        // Send Input
        if (this.me) { // Only send input if we joined and are alive (logic for dead needed)
             const target = this.input.getTarget();
             this.socket.sendInput(target);
        } else {
            console.log('Waiting for me...');
        }

        // Render
        this.renderer.render(this.entities, this.me, this.worldSize, this.leaderboard);
        
        // Update input camera
        // Note: Renderer calculates camera inside render, maybe Input needs it too?
        // Input needs camera pos to convert mouse to world.
        // We can pass the camera position to input here.
        // Similar logic to renderer:
        if (this.me) {
             const myCells = this.entities.filter(e => (e as any).playerId === this.me!.id);
             if (myCells.length > 0) {
                 const cx = myCells.reduce((s, c) => s + c.position.x, 0) / myCells.length;
                 const cy = myCells.reduce((s, c) => s + c.position.y, 0) / myCells.length;
                 this.input.setCameraPos({ x: cx, y: cy });
             }
        }
    }

    private handleMessage(msg: ServerMessage) {
        console.log('Received message:', msg.type);
        switch (msg.type) {
            case MessageType.INIT:
                this.worldSize = msg.worldSize;
                this.entities = msg.entities;
                // We need to set 'me'. msg.playerId tells us our ID.
                // But we need to find the player object in the list? 
                // msg.players has list of players.
                this.players = msg.players;
                this.me = this.players.find(p => p.id === msg.playerId);
                break;
            case MessageType.UPDATE:
                this.entities = msg.entities;
                // Refind me if stats changed
                if (this.me) {
                    // Update me from entities? No, me is Player object.
                    // Score is in player object. 
                    // Wait, UPDATE only sends entities.
                    // Does it send Player data? 
                    // Protocol: UpdateMessage has { entities, removedEntityIds }.
                    // It does NOT send player score updates currently.
                    // We need to calculate score from cells or receive player updates.
                    
                    // For now, let's recalculate my score from my cells:
                    const myCells = this.entities.filter(e => (e as any).playerId === this.me!.id);
                    this.me.score = myCells.reduce((s, c) => s + Math.floor((c as any).mass), 0);
                }
                break;
            case MessageType.LEADERBOARD:
                this.leaderboard = msg.entries;
                break;
        }
    }
}
