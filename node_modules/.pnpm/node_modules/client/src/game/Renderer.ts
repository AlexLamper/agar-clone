import { EntityType } from 'shared';
import type { BaseEntity, Player } from 'shared';
import { SKINS } from '../skins';
import type { SkinDef } from '../skins';

export class Renderer {
    private ctx: CanvasRenderingContext2D;
    private canvas: HTMLCanvasElement;
    private width: number = 0;
    private height: number = 0;
    private skinCanvasCache: Map<string, HTMLCanvasElement> = new Map();

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Could not get 2d context');
        this.ctx = context;
        
        // Preload Skins (Generate Canvases)
        SKINS.forEach(skin => {
            if (skin.id !== 'none') {
                const sCanvas = this.createSkinCanvas(skin);
                this.skinCanvasCache.set(skin.id, sCanvas);
                skin.canvas = sCanvas; // Also cache on object for easier UI access
            }
        });

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    public createSkinCanvas(skin: SkinDef): HTMLCanvasElement {
        const c = document.createElement('canvas');
        c.width = skin.width;
        c.height = skin.height;
        const ctx = c.getContext('2d');
        if (!ctx) return c;

        for (let y = 0; y < skin.height; y++) {
            const row = skin.pixels[y] || '';
            for (let x = 0; x < skin.width; x++) {
                const char = row[x] || '.';
                const color = skin.palette[char];
                if (color && color !== 'transparent') {
                    ctx.fillStyle = color;
                    ctx.fillRect(x, y, 1, 1);
                }
            }
        }
        return c;
    }

    public registerSkins(skins: SkinDef[]) {
        skins.forEach(skin => {
            if (skin.id !== 'none' && !this.skinCanvasCache.has(skin.id)) {
                const sCanvas = this.createSkinCanvas(skin);
                this.skinCanvasCache.set(skin.id, sCanvas);
                skin.canvas = sCanvas;
            }
        });
    }

    resize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        // Important for pixel art to stay sharp when scaled
        this.ctx.imageSmoothingEnabled = false;
    }

    render(entities: BaseEntity[], players: Player[], me: Player | undefined, worldSize: number, leaderboard: {name: string, score: number}[], zoom: number = 1.0) {
        this.ctx.clearRect(0, 0, this.width, this.height);

        if (!me) {
            // Loading text or lobby
            this.ctx.fillStyle = 'black';
            this.ctx.font = '30px Nunito, sans-serif';
            this.ctx.fillText('Connecting...', 20, 50);
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
             camX = worldSize / 2;
             camY = worldSize / 2;
        }

        this.ctx.save();
        
        // Translate to center camera with zoom
        this.ctx.translate(this.width / 2, this.height / 2);
        this.ctx.scale(zoom, zoom);
        this.ctx.translate(-camX, -camY);

        // Draw Grid
        this.drawGrid(worldSize);

        // Draw Entities
        // Sort by radius ascending so smaller cells (on top of larger?) or larger on top?
        // Agar.io: Small cells are drawn ON TOP of larger cells so you can see them being eaten.
        entities.sort((a, b) => a.radius - b.radius); // Smallest first (bottom) -> Largest last (top).
        // Wait, if Largest is last, it covers collision.
        // We want Smallest LAST so they bloom on top?
        // Actually, in Agar.io, if I am big, I cover the small cell I eat.
        // So small cells should be drawn FIRST (behind), Large cells LAST (front).
        // BUT if I am a small cell, I want to see myself.
        // Let's stick to sort by radius ascending (Small -> Large) means Large covers Small.
        // That is physically correct for "eating".
        
        entities.forEach(entity => {
            this.drawEntity(entity, players);
        });

        this.ctx.restore();

        // UI
        this.drawLeaderboard(leaderboard);
        this.drawScore(me.score);
    }

    private drawGrid(worldSize: number) {
        this.ctx.strokeStyle = '#cccccc'; // Darker grid lines
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        
        // Draw grid lines
        const step = 50;
        
        // Draw borders
        this.ctx.strokeStyle = '#333';
        this.ctx.strokeRect(0, 0, worldSize, worldSize);
        
        this.ctx.strokeStyle = '#bfbfbf'; // Inner grid more visible
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


    private drawEntity(entity: BaseEntity, players: Player[]) {
        this.ctx.beginPath();
        
        if (entity.type === EntityType.Virus) {
             const spikes = 20;
             const outerRadius = entity.radius;
             const innerRadius = entity.radius * 0.9;
             
             for (let i = 0; i < spikes * 2; i++) {
                 const r = (i % 2 === 0) ? outerRadius : innerRadius;
                 const a = (Math.PI * 2 * i) / (spikes * 2);
                 const x = entity.position.x + Math.cos(a) * r;
                 const y = entity.position.y + Math.sin(a) * r;
                 if (i === 0) this.ctx.moveTo(x, y);
                 else this.ctx.lineTo(x, y);
             }
             this.ctx.closePath();
             this.ctx.fillStyle = '#33FF33';
             this.ctx.fill();
             this.ctx.strokeStyle = '#22AA22';
             this.ctx.lineWidth = 3;
             this.ctx.stroke();
             return;
        }

        this.ctx.arc(entity.position.x, entity.position.y, entity.radius, 0, Math.PI * 2);
        
        this.ctx.fillStyle = entity.color;
        this.ctx.fill();

        // Skin
        if (entity.skin && entity.skin !== 'none') {
            const skinCanvas = this.skinCanvasCache.get(entity.skin);
            if (skinCanvas) {
                // Determine rotation:
                // Viruses spin? 
                // Players don't spin usually.
                
                this.ctx.save();
                this.ctx.beginPath(); 
                this.ctx.arc(entity.position.x, entity.position.y, entity.radius, 0, Math.PI * 2);
                this.ctx.clip();
                
                // Solid Background for skin
                this.ctx.fillStyle = '#000000'; // Or entity.color? 
                // User asked for "Border shouldn't be transparent... make it solid". 
                // This implies the INSIDE of the border. If the skin has transparency, we want it filled?
                // Or maybe they mean the stroke line itself?
                // "The border shouldn't be transparent (of the blob/player/skin), make it solid."
                // Currently EntityType.Player logic draws stroke.
                // If I fill here, any holes in pixel art become black (or entity color).
                this.ctx.fillStyle = entity.color; 
                this.ctx.fill();

                const size = entity.radius * 2;
                // Draw image centered at entity position
                // Check if skinCanvas is valid size
                if (skinCanvas.width > 0) {
                     this.ctx.drawImage(skinCanvas, 
                        entity.position.x - entity.radius, 
                        entity.position.y - entity.radius, 
                        size, size
                    );
                } else {
                    console.warn(`Skin canvas for ${entity.skin} has 0 width`); // Debug
                }
                this.ctx.restore();
            } else {
                 // console.warn(`Missing skin canvas for: ${entity.skin}`);
            }
        }
        
        if (entity.type === EntityType.Player) {
             this.ctx.strokeStyle = '#000000';
             this.ctx.lineWidth = 4 + entity.radius * 0.05;
             this.ctx.stroke();

             // Name
             if ((entity as any).mass > 10) { // Don't draw name on tiny cells
                 this.ctx.fillStyle = '#FFF';
                 this.ctx.font = `bold ${Math.max(12, entity.radius * 0.4)}px Ubuntu`;
                 this.ctx.textAlign = 'center';
                 this.ctx.textBaseline = 'middle';
                 this.ctx.lineWidth = 3;
                 this.ctx.strokeStyle = '#000';
                 
                 // Find name
                 let name = 'Unknown';
                 const p = players.find(p => p.id === (entity as any).playerId);
                 if (p) name = p.name;
                 
                 this.ctx.strokeText(name, entity.position.x, entity.position.y);
                 this.ctx.fillText(name, entity.position.x, entity.position.y);
             }
        } else if (entity.type === EntityType.Projectile) {
             this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
             this.ctx.lineWidth = 2;
             this.ctx.stroke();
        }
    }

    private drawLeaderboard(entries: {name: string, score: number}[]) {
        const width = 250;
        // Dynamic height based on entries, with min height and extra padding
        const lineHeight = 30;
        const headerHeight = 50; // Increased header space
        const bottomPadding = 20; // Extra space at bottom
        const contentHeight = Math.max(5, entries.length) * lineHeight;
        const height = headerHeight + contentHeight + bottomPadding;
        
        const x = this.width - width - 20;
        const y = 20;

        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'; // Semi-transparent background
        // Radius for rounded corners could be nice, but fillRect is standard
        this.ctx.fillRect(x, y, width, height);
        
        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 24px Nunito, sans-serif'; // Slightly bigger header
        this.ctx.textAlign = 'center';
        this.ctx.fillText('Leaderboard', x + width/2, y + 35);
        
        this.ctx.font = '18px Nunito, sans-serif';
        this.ctx.textAlign = 'left';
        
        entries.forEach((entry, i) => {
            const rowY = y + headerHeight + 10 + i * lineHeight; // +10 initial gap
            this.ctx.fillText(`${i + 1}.`, x + 20, rowY);
            
            // Name ellipsis
            let name = entry.name || 'Unnamed';
            if (name.length > 15) name = name.substring(0, 15) + '...';
            
            this.ctx.fillText(name, x + 50, rowY);
            
            this.ctx.textAlign = 'right';
            this.ctx.fillText(entry.score.toString(), x + width - 20, rowY);
            this.ctx.textAlign = 'left';
        });

        // Reset text align
        this.ctx.textAlign = 'left';
    }

    private drawScore(score: number) {
        const text = `Score: ${score}`;
        this.ctx.font = 'bold 24px Nunito, sans-serif';
        const metrics = this.ctx.measureText(text);
        const padding = 10;
        const boxWidth = metrics.width + padding * 2;
        const boxHeight = 40;
        const x = 20;
        const y = this.height - 20; // Bottom left anchor

        // Background
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        this.ctx.fillRect(x, y - boxHeight + 10, boxWidth, boxHeight); // +10 adjustment for baseline
        
        // Text
        this.ctx.fillStyle = 'white';
        this.ctx.fillText(text, x + padding, y);
    }
}
