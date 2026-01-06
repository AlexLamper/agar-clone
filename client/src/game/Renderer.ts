import { EntityType } from 'shared';
import type { BaseEntity, Player } from 'shared';

export class Renderer {
    private ctx: CanvasRenderingContext2D;
    private canvas: HTMLCanvasElement;
    private width: number = 0;
    private height: number = 0;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Could not get 2d context');
        this.ctx = context;
        
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
    }

    render(entities: BaseEntity[], me: Player | undefined, worldSize: number, leaderboard: {name: string, score: number}[]) {
        this.ctx.clearRect(0, 0, this.width, this.height);

        if (!me) {
            // Loading text or lobby
            this.ctx.fillStyle = 'black';
            this.ctx.fillText('Connecting...', 20, 20);
            return;
        }

        // Calculate camera position (center on player's first cell or centroid)
        let camX = 0, camY = 0;
        let myCells = entities.filter(e => e.type === EntityType.Player && (e as any).playerId === me.id);
        
        if (myCells.length > 0) {
            // Average pos
            camX = myCells.reduce((sum, c) => sum + c.position.x, 0) / myCells.length;
            camY = myCells.reduce((sum, c) => sum + c.position.y, 0) / myCells.length;
        } else {
             // Dead or spectator
             // Just stay where we were or center
             camX = worldSize / 2;
             camY = worldSize / 2;
        }

        this.ctx.save();
        
        // Translate to center camera
        this.ctx.translate(this.width / 2 - camX, this.height / 2 - camY);

        // Draw Grid
        this.drawGrid(worldSize);

        // Draw Entities
        // Sort by radius/layer so food is below cells
        entities.sort((a, b) => a.radius - b.radius); // Smaller first? Food is small.
        // Actually food is small, cells are big. We want food bottom.
        // But bigger cells cover smaller cells.
        // So allow z-index implicity by radius is okay for food vs cell, but cell vs cell?
        // Usually smallest radius on top? No, biggest on top implies eating? 
        // No, smallest is on TOP to not be hidden? 
        // In agar.io, if you overlap, the eater is on top? Or underneath?
        // Let's sort simply by type first (Food, then Cells) then by Mass ascending so large cells cover small ones?
        // No, small cells should be on top so you can see them being eaten?
        // Let's sort by radius ascending.
        
        entities.forEach(entity => {
            this.drawEntity(entity);
        });

        this.ctx.restore();

        // UI
        this.drawLeaderboard(leaderboard);
        this.drawScore(me.score);
    }

    private drawGrid(worldSize: number) {
        this.ctx.strokeStyle = '#ddd';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        
        // Draw grid lines
        const step = 50;
        
        // Draw borders
        this.ctx.strokeStyle = '#333';
        this.ctx.strokeRect(0, 0, worldSize, worldSize);
        
        this.ctx.strokeStyle = '#e5e5e5';
        for (let x = 0; x <= worldSize; x += step) {
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, worldSize);
        }
        for (let y = 0; y <= worldSize; y += step) {
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(worldSize, y);
        }
        this.ctx.stroke();
    }

    private drawEntity(entity: BaseEntity) {
        this.ctx.beginPath();
        this.ctx.arc(entity.position.x, entity.position.y, entity.radius, 0, Math.PI * 2);
        this.ctx.fillStyle = entity.color;
        this.ctx.fill();
        
        if (entity.type === EntityType.Player) {
             this.ctx.strokeStyle = '#333'; // Border
             this.ctx.lineWidth = 3;
             this.ctx.stroke();
             
             // Name? (Not in entity yet maybe)
        } else {
             // Food no border
        }
    }

    private drawLeaderboard(entries: {name: string, score: number}[]) {
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.ctx.fillRect(this.width - 220, 10, 200, 250);
        
        this.ctx.fillStyle = 'white';
        this.ctx.font = '16px Arial';
        this.ctx.fillText('Leaderboard', this.width - 200, 35);
        
        entries.forEach((entry, i) => {
            this.ctx.fillText(`${i + 1}. ${entry.name || 'Unnamed'} - ${entry.score}`, this.width - 210, 60 + i * 20);
        });
    }

    private drawScore(score: number) {
        this.ctx.fillStyle = 'black';
        this.ctx.font = '20px Arial';
        this.ctx.fillText(`Score: ${score}`, 20, this.height - 20);
    }
}
