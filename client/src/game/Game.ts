import { MessageType, EntityType } from 'shared';
import type { BaseEntity, ServerMessage, Player } from 'shared';
import { Input } from './Input';
import { Renderer } from './Renderer';
import { Socket } from '../net/Socket';

// Interpolation wrapper
interface InterpolatedEntity extends BaseEntity {
    renderPos: { x: number, y: number };
    targetPos: { x: number, y: number };
    mass?: number;
}

export class Game {
    private canvas: HTMLCanvasElement;
    private renderer: Renderer;
    private input: Input;
    private socket: Socket;

    private players: Player[] = []; 
    private leaderboard: {name: string, score: number}[] = [];
    private me: Player | undefined;
    private worldSize: number = 2000;
    
    private isRunning: boolean = false;
    private lastInputTime: number = 0;
    private hasJoined: boolean = false;
    private deathTime: number = 0;
    
    // For interpolation
    private clientEntities: Map<string, InterpolatedEntity> = new Map();

    constructor() {
        this.canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
        this.renderer = new Renderer(this.canvas);
        this.input = new Input(this.canvas);
        
        // Auto connect
        this.socket = new Socket('ws://localhost:3000', (msg) => this.handleMessage(msg));

        this.setupUI();
        this.setupGameOverUI();
    }

    private setupUI() {
        const btn = document.getElementById('playBtn');
        const input = document.getElementById('playerName') as HTMLInputElement;
        const colorInput = document.getElementById('playerColor') as HTMLInputElement;
        const overlay = document.getElementById('ui-overlay');

        // Load saved preferences
        if (input) {
            const savedName = localStorage.getItem('agar_playerName');
            if (savedName) input.value = savedName;
        }
        if (colorInput) {
            const savedColor = localStorage.getItem('agar_playerColor');
            if (savedColor) colorInput.value = savedColor;
        }

        const restartBtn = document.getElementById('restartBtn');
        restartBtn?.addEventListener('click', () => {
             const gameOverOverlay = document.getElementById('game-over-overlay');
             if (gameOverOverlay) gameOverOverlay.style.display = 'none';
             if (overlay) overlay.style.display = 'flex';
             this.clientEntities.clear();
        });

        btn?.addEventListener('click', () => {
             const name = input.value || 'Guest';
             const color = colorInput?.value;

             // Save preferences
             localStorage.setItem('agar_playerName', name);
             if (color) localStorage.setItem('agar_playerColor', color);

             this.socket.sendJoin(name, color);
             if (overlay) overlay.style.display = 'none';
             this.hasJoined = true;
             this.deathTime = 0;
             this.start();
        });
    }

    private setupGameOverUI() {
        const restartBtn = document.getElementById('restartBtn');
        const overlay = document.getElementById('game-over-overlay');
        const uiOverlay = document.getElementById('ui-overlay');

        restartBtn?.addEventListener('click', () => {
            if (overlay) overlay.style.display = 'none';
            if (uiOverlay) uiOverlay.style.display = 'flex'; // Go back to main menu
            this.hasJoined = false;
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

        // Process Interpolation
        this.updateInterpolation();

        // Check Death
        if (this.hasJoined && this.me) {
             const myCells = Array.from(this.clientEntities.values())
                .filter(e => e.type === EntityType.Player && (e as any).playerId === this.me!.id);
             
             // Simple death check:Joined but no cells found in update
             // Need a grace period? Init message should come first.
             // If we have received entities at least once, and now have 0, we dead.
             if (this.clientEntities.size > 0 && myCells.length === 0) {
                 // Check if we just died or if it's lag
                 // Let's assume death if it persists for a few frames?
                 // Or just trigger immediate.
                 if (this.deathTime === 0) {
                     this.deathTime = Date.now();
                 } else if (Date.now() - this.deathTime > 1000) {
                     // 1 second confirm
                     this.showGameOver();
                 }
             } else {
                 this.deathTime = 0;
             }
        }

        // Send Input (Throttled to 20Hz)
        const now = Date.now();
        if (this.me && now - this.lastInputTime > 50) { 
             const target = this.input.getTarget();
             this.socket.sendInput(target, this.input.split, this.input.eject);
             
             // Reset one-frame inputs
             this.input.split = false;
             this.input.eject = false;
             
             this.lastInputTime = now;
        }

        // Render (Use clientEntities values)
        // We need to convert Map back to array for renderer, or update renderer.
        // Let's just pass values().
        const renderList = Array.from(this.clientEntities.values()).map(e => ({
            ...e,
            position: e.renderPos // Override position with interpolated one
        }));

        this.renderer.render(renderList, this.me, this.worldSize, this.leaderboard, this.input.zoom);
        
        // Update input camera
        if (this.me) {
             const myCells = renderList.filter(e => (e as any).playerId === this.me!.id);
             if (myCells.length > 0) {
                 const cx = myCells.reduce((s, c) => s + c.position.x, 0) / myCells.length;
                 const cy = myCells.reduce((s, c) => s + c.position.y, 0) / myCells.length;
                 this.input.setCameraPos({ x: cx, y: cy });
             }
        }
    }

    private showGameOver() {
        const overlay = document.getElementById('game-over-overlay');
        const scoreSpan = document.getElementById('finalScore');
        if (scoreSpan && this.me) scoreSpan.innerText = this.me.score.toString();
        
        if (overlay) overlay.style.display = 'flex';
        this.isRunning = false; 
    }

    private updateInterpolation() {
        const LERP_FACTOR = 0.1; // Adjust for smoothness vs lag
        
        this.clientEntities.forEach(entity => {
            const dx = entity.targetPos.x - entity.renderPos.x;
            const dy = entity.targetPos.y - entity.renderPos.y;
            
            // If distance is huge (teleport/respawn), snap
            if (dx*dx + dy*dy > 500*500) {
                entity.renderPos.x = entity.targetPos.x;
                entity.renderPos.y = entity.targetPos.y;
            } else {
                entity.renderPos.x += dx * LERP_FACTOR;
                entity.renderPos.y += dy * LERP_FACTOR;
            }
        });
    }

    private handleMessage(msg: ServerMessage) {
        // console.log('Received message:', msg.type); // Too spammy for update
        switch (msg.type) {
            case MessageType.INIT:
                this.worldSize = msg.worldSize;
                this.syncEntities(msg.entities);
                this.players = msg.players;
                this.me = this.players.find(p => p.id === msg.playerId);
                break;
            case MessageType.UPDATE:
                this.syncEntities(msg.entities);
                // Refind me if stats changed
                if (this.me) {
                    // Update score from client entities (interpolated ones have correct metadata)
                    const myCells = Array.from(this.clientEntities.values()).filter(e => (e as any).playerId === this.me!.id);
                    this.me.score = myCells.reduce((s, c) => s + Math.floor((c as any).mass), 0);
                }
                break;
            case MessageType.LEADERBOARD:
                this.leaderboard = msg.entries;
                break;
            case MessageType.GAME_OVER:
                this.showGameOver();
                break;
        }
    }

    private syncEntities(serverEntities: BaseEntity[]) {
        const serverIds = new Set(serverEntities.map(e => e.id));

        // Update or Add
        serverEntities.forEach(sEntity => {
            const current = this.clientEntities.get(sEntity.id);
            if (current) {
                // Update target
                current.targetPos = sEntity.position;
                current.radius = sEntity.radius;
                current.mass = (sEntity as any).mass; // Hacky cast
                current.color = sEntity.color;
            } else {
                // Add new
                this.clientEntities.set(sEntity.id, {
                    ...sEntity,
                    renderPos: { ...sEntity.position },
                    targetPos: { ...sEntity.position }
                });
            }
        });

        // Remove dead
        for (const id of this.clientEntities.keys()) {
            if (!serverIds.has(id)) {
                this.clientEntities.delete(id);
            }
        }
    }
}
