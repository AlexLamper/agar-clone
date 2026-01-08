import { BaseEntity, EntityType, InputMessage, Vector2 } from 'shared';
import { Cell } from './Cell.js';
import { Player } from './Player.js';
import { Food } from './Food.js';
import { Virus } from './Virus.js';
import { EjectedMass } from './EjectedMass.js';

const WORLD_SIZE = 10000;
const MAX_FOOD = 2000; // Increased from 500
const MAX_VIRUSES = 20;
const BASE_SPEED = 2.5; // Reduced by 50%
const GRID_SIZE = 100; // Size of each grid cell

class SpatialHash {
    private grid: Map<string, BaseEntity[]> = new Map();
    private cellSize: number;

    constructor(cellSize: number) {
        this.cellSize = cellSize;
    }

    clear() {
        this.grid.clear();
    }

    insert(entity: BaseEntity) {
        // An entity might span multiple cells if it's large (players)
        // For simplicity for now, just insert into center cell. 
        // Better: insert into all overlapping cells.
        // Even better: Check multiple cells during query.
        
        // Let's insert based on center point.
        const key = this.getKey(entity.position);
        if (!this.grid.has(key)) {
            this.grid.set(key, []);
        }
        this.grid.get(key)!.push(entity);
    }

    // Query entities in a range
    query(position: Vector2, radius: number): BaseEntity[] {
        const result: BaseEntity[] = [];
        const startX = Math.floor((position.x - radius) / this.cellSize);
        const endX = Math.floor((position.x + radius) / this.cellSize);
        const startY = Math.floor((position.y - radius) / this.cellSize);
        const endY = Math.floor((position.y + radius) / this.cellSize);

        const checkedKeys = new Set<string>();

        for (let x = startX; x <= endX; x++) {
            for (let y = startY; y <= endY; y++) {
                const key = `${x},${y}`;
                if (checkedKeys.has(key)) continue;
                checkedKeys.add(key);

                const cellEntities = this.grid.get(key);
                if (cellEntities) {
                    result.push(...cellEntities);
                }
            }
        }
        return result;
    }
    
    // Viewport query for broadcasting
    queryRect(minX: number, minY: number, maxX: number, maxY: number): BaseEntity[] {
        const result: BaseEntity[] = [];
        const startX = Math.floor(minX / this.cellSize);
        const endX = Math.floor(maxX / this.cellSize);
        const startY = Math.floor(minY / this.cellSize);
        const endY = Math.floor(maxY / this.cellSize);
        
        const encountered = new Set<string>();

        for (let x = startX; x <= endX; x++) {
            for (let y = startY; y <= endY; y++) {
                const key = `${x},${y}`;
                const cellEntities = this.grid.get(key);
                if (cellEntities) {
                     for (const e of cellEntities) {
                         // Dedup if entities were in multiple buckets (currently only in one but safe is safe)
                         if (!encountered.has(e.id)) {
                             encountered.add(e.id);
                             result.push(e);
                         }
                     }
                }
            }
        }
        return result;
    }

    private getKey(pos: Vector2): string {
        const x = Math.floor(pos.x / this.cellSize);
        const y = Math.floor(pos.y / this.cellSize);
        return `${x},${y}`;
    }
}

export class World {
    public entities: BaseEntity[] = [];
    public players: Map<string, Player> = new Map();
    public width: number = WORLD_SIZE;
    public height: number = WORLD_SIZE;
    public spatialHash: SpatialHash;

    constructor() {
        this.spatialHash = new SpatialHash(GRID_SIZE);
        this.spawnFood(100);
        this.spawnViruses(20);
    }

    addPlayer(player: Player, color?: string) {
        this.players.set(player.id, player);
        // Spawn initial cell with Mass based on Level
        const startMass = player.getStartingMass();

        const pos = this.getRandomPosition();
        const startColor = color || this.getRandomColor();
        const cell = new Cell(player.id, pos, startMass, startColor, player.skin);
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

    handleInput(playerId: string, msg: InputMessage) {
        const player = this.players.get(playerId);
        if (!player) return;

        player.cells.forEach(cell => {
            cell.target = msg.target;
        });

        if (msg.split) player.split(this, msg.target);
        if (msg.eject) player.eject(this, msg.target);
    }

    tick() {
        // Rebuild spatial hash
        this.spatialHash.clear();
        this.entities.forEach(e => this.spatialHash.insert(e));

        // Move cells
        this.players.forEach(player => {
            player.cells.forEach(cell => {
                this.moveCell(cell);
                this.constrainMap(cell);
            });
        });

        // Move projectiles
        this.entities.forEach(e => {
            if (e.type === EntityType.Projectile) {
                this.moveProjectile(e as EjectedMass);
                this.constrainMap(e as any);
            }
        });

        // Collisions
        this.checkCollisions();

        // Spawn food - aggressively
        if (this.entities.filter(e => e.type === EntityType.Food).length < MAX_FOOD) {
            this.spawnFood(50); // Increased spawn rate
        }
        
        // Spawn viruses
        if (this.entities.filter(e => e.type === EntityType.Virus).length < MAX_VIRUSES) {
            this.spawnViruses(1);
        }

        // --- XP over Time Logic ---
        // "XP is earned every second depending on mass."
        // "Mass: The more mass you have, the more XP you earn per second."
        // "Splits: The more you split, the more XP you gain per cell."
        
        // Let's run this check every 25 ticks (approx 1 second at 25Hz, but we run 40Hz)
        // 40Hz = 40 ticks/sec. So every 40 ticks = 1 second.
        
        // We can use a counter in World or just reuse tick?
        // Let's use modulus on timestamp or tickCount. TickCount is in Server.ts.
        // World doesn't track tick count directly, but we can do it cheap:
        
        if (Date.now() % 1000 < 50) { // Rough "once per second" check (flaky)
            // Better: Server.ts calls tick(), let's trust caller handles frequency or we add internal counter.
        }
    }
    
    // Explicit method called by Server loop every second
    public givePassiveXp() {
        this.players.forEach(player => {
             // Calculate Total Mass
             const totalMass = player.cells.reduce((sum, c) => sum + c.mass, 0);
             if (totalMass === 0) return;
             
             // Base XP from mass:
             // "If you have 500 mass you will generate more XP per second than if you have 250 mass. 
             // If you are twice as big you only get about 30-40% more XP."
             // Formula: XP = Const * Mass^0.4 ?
             // 250^0.4 = 9.1
             // 500^0.4 = 12.0 (approx 32% increase) - Fits the description perfectly.
             
             let xpGain = Math.pow(totalMass, 0.4);
             
             // Split Multiplier:
             // "The more you split, the more XP you gain per cell."
             // "you have a cell with 500 mass (XP ~12), you will gain double the XP if you have two 250 cells."
             // Two 250 cells:
             // Cell 1: 250^0.4 = 9.1
             // Cell 2: 250^0.4 = 9.1
             // Total = 18.2.  12 vs 18.2 is ~50% more, not double.
             // If we sum XP per cell individually, we get the split bonus naturally!
             // So instead of Total Mass ^ 0.4, we do Sum(CellMass ^ 0.4).
             
             // Recalculate correctly:
             xpGain = player.cells.reduce((sum, c) => sum + Math.pow(c.mass, 0.4), 0);
             
             // Scaling to integer
             player.addXp(Math.floor(xpGain));
        });
    }


    public getVisibleEntities(player: Player, viewportW: number, viewportH: number): BaseEntity[] {
        // Find rough center of player (avg of all cells)
        if (player.cells.length === 0) return [];
        
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        
        player.cells.forEach(c => {
            minX = Math.min(minX, c.position.x);
            maxX = Math.max(maxX, c.position.x);
            minY = Math.min(minY, c.position.y);
            maxY = Math.max(maxY, c.position.y);
        });

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        // Add viewport margin
        // We need to know client viewport size... assume standard HD+ for now or pass it.
        // Assuming 1920x1080 / zoom.
        // Let's grab a large enough area.
        const viewW = viewportW * 1.5; // Margin
        const viewH = viewportH * 1.5;

        // Correct rect query
        return this.spatialHash.queryRect(
            centerX - viewW/2,
            centerY - viewH/2,
            centerX + viewW/2,
            centerY + viewH/2
        );
    }

    private moveCell(cell: Cell) {
        // Friction and velocity application
        cell.velocity.x *= 0.9;
        cell.velocity.y *= 0.9;
        
        cell.position.x += cell.velocity.x;
        cell.position.y += cell.velocity.y;

        // Target movement
        const dx = cell.target.x - cell.position.x;
        const dy = cell.target.y - cell.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0) {
            // Speed formula
            // Logarithmic decay? 
            // Previous: BASE_SPEED * Math.pow(cell.mass, -0.4) * 15
            // At mass 100: pow -> 0.158 -> speed ~ 2.37 * BASE
            // At mass 1000: pow -> 0.063 -> speed ~ 0.94 * BASE
            // At mass 10000: pow -> 0.025 -> speed ~ 0.3 * BASE (Too slow)
            
            // New Formula: Slower decay
            // Try pow -0.3
            // mass 100: 0.25 -> 3.75 * B
            // mass 1000: 0.125 -> 1.8 * B 
            // mass 10000: 0.063 -> 0.9 * B
            
            // Adjust factor to keep small cells fast but reasonable.
            const slowDown = Math.pow(cell.mass, -0.3); 
            // At mass 35 (start): 0.34
            // At mass 10: 0.5
            // So we want a multiplier.
            
            // Let's hardcode a better curve.
            // Speed = Base * (1 / (1 + mass/2000)) ? No linear decay is bad.
            
            // Use old formula but clamp minimum speed and reduce decay.
            const decay = Math.pow(cell.mass, -0.35); // Slightly less aggressive than -0.44
            const speed = Math.max(BASE_SPEED * decay * 15, 2.5); // Min speed 2.5
            
            const moveDist = Math.min(speed, dist);
            cell.position.x += (dx / dist) * moveDist;
            cell.position.y += (dy / dist) * moveDist;
        }
    }

    private constrainMap(entity: { position: Vector2 }) {
        entity.position.x = Math.max(0, Math.min(this.width, entity.position.x));
        entity.position.y = Math.max(0, Math.min(this.height, entity.position.y));
    }

    private moveProjectile(proj: EjectedMass) {
        proj.position.x += proj.velocity.x;
        proj.position.y += proj.velocity.y;
        proj.velocity.x *= proj.friction;
        proj.velocity.y *= proj.friction;
    }

    private spawnViruses(count: number) {
        for (let i = 0; i < count; i++) {
             const pos = this.getRandomPosition();
             const v = new Virus(pos);
             this.entities.push(v);
        }
    }

    private checkCollisions() {
        const removedEntityIds = new Set<string>();

        this.players.forEach(player => {
            player.cells.forEach(cell => {
                // Skip if this cell was already removed (merged into another)
                if (removedEntityIds.has(cell.id)) return;

                const candidates = this.spatialHash.query(cell.position, cell.radius + 100); 

                for (const other of candidates) {
                    if (cell.id === other.id) continue;
                    if (removedEntityIds.has(other.id)) continue; // Already eaten this tick

                    if (other.type === EntityType.Food) {
                         if (this.getDistance(cell.position, other.position) < cell.radius) {
                            cell.setMass(cell.mass + 1);
                            player.updateScore();
                            player.addXp(1);
                            this.removeEntity(other.id);
                            removedEntityIds.add(other.id);
                         }
                    } else if (other.type === EntityType.Projectile) {
                         if (this.getDistance(cell.position, other.position) < cell.radius) {
                             cell.setMass(cell.mass + 13);
                             player.updateScore();
                             player.addXp(5);
                             this.removeEntity(other.id);
                             removedEntityIds.add(other.id);
                         }
                    } else if (other.type === EntityType.Virus) {
                         const virus = other as Virus;
                         if (cell.mass > virus.mass * 1.1 && 
                             this.getDistance(cell.position, virus.position) < cell.radius) {
                             
                             this.removeEntity(virus.id);
                             removedEntityIds.add(virus.id);
                             player.addXp(50);
                             this.explodeCell(player, cell); 
                         }
                    } else if (other.type === EntityType.Player) {
                        const otherCell = other as Cell;
                        if (cell.playerId === otherCell.playerId) {
                            // Same player: Repel or Merge
                            const dist = this.getDistance(cell.position, otherCell.position);
                            const minDist = cell.radius + otherCell.radius;
                            
                            // Merge logic: Can merge after 30 seconds
                            const now = Date.now();
                            const canMerge = (now - cell.createdAt > 30000) && (now - otherCell.createdAt > 30000);

                            if (canMerge) {
                                // Merge if significant overlap
                                if (dist < cell.radius + otherCell.radius * 0.5 || dist < otherCell.radius + cell.radius * 0.5) {
                                     // Merge into the bigger one usually, or just this one
                                     cell.setMass(cell.mass + otherCell.mass);
                                     player.removeCell(otherCell.id);
                                     this.removeEntity(otherCell.id);
                                     removedEntityIds.add(otherCell.id);
                                }
                            } else {
                                // Elastic collision / Push apart
                                if (dist < minDist) {
                                    const overlap = minDist - dist;
                                    if (dist > 0) { // normalize
                                        const dx = (cell.position.x - otherCell.position.x) / dist;
                                        const dy = (cell.position.y - otherCell.position.y) / dist;
                                        
                                        // Push away
                                        const pushFactor = 0.5; // Smooth
                                        // adjust positions directly? Or velocity? 
                                        // Direct position constraint feels stiffer, good for "solid" feeling.
                                        
                                        // Move them apart proportional to inverse mass? 
                                        // Actually just split the overlap
                                        
                                        cell.position.x += dx * overlap * pushFactor;
                                        cell.position.y += dy * overlap * pushFactor;
                                        otherCell.position.x -= dx * overlap * pushFactor;
                                        otherCell.position.y -= dy * overlap * pushFactor;
                                    }
                                }
                            }
                            
                            continue;
                        }

                        if (cell.mass > otherCell.mass * 1.25 && 
                            this.getDistance(cell.position, otherCell.position) < cell.radius - otherCell.radius * 0.5) {
                            
                            cell.setMass(cell.mass + otherCell.mass);
                            player.updateScore();
                            player.addXp(Math.floor(otherCell.mass));
                            const victim = this.players.get(otherCell.playerId);
                            if (victim) victim.removeCell(otherCell.id);
                            this.removeEntity(otherCell.id);
                            removedEntityIds.add(otherCell.id);
                        }
                    }
                }
            });
        });
    }

    private explodeCell(player: Player, cell: Cell) {
        const splitsAllowed = 16 - player.cells.length;
        if (splitsAllowed <= 0) return;

        const pieces = Math.min(splitsAllowed, 6);
        const massPerPiece = cell.mass / (pieces + 1);
        
        cell.setMass(massPerPiece);
        
        for (let i = 0; i < pieces; i++) {
             const angle = (Math.PI * 2 * i) / pieces;
             const dirX = Math.cos(angle);
             const dirY = Math.sin(angle);
             
             const startPos = {
                 x: cell.position.x + dirX * cell.radius,
                 y: cell.position.y + dirY * cell.radius
             };
             
             const newCell = new Cell(player.id, startPos, massPerPiece, cell.color);
             newCell.target = cell.target;
             newCell.velocity = { x: dirX * 25, y: dirY * 25 };
             
             player.addCell(newCell);
             this.entities.push(newCell);
        }
    }

    private removeEntity(id: string) {
        this.entities = this.entities.filter(e => e.id !== id);
    }

    private spawnFood(count: number) {
        for (let i = 0; i < count; i++) {
            const pos = this.getRandomPosition();
            const food = new Food(pos, this.getRandomColor());
            this.entities.push(food);
        }
    }

    public getRandomPosition(): Vector2 {
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
