import { Player } from './Player.js';
import { World } from './World.js';
import { WebSocket } from 'ws';
import { EntityType, Vector2 } from 'shared';
import { Cell } from './Cell.js';

// Mock WebSocket for Bots
class MockSocket {
    send(data: any) {}
    readyState = 1; // Open
    on() {}
}

export class Bot extends Player {
    private world: World;
    private changeTargetTimer: number = 0;

    constructor(id: string, name: string, world: World) {
        super(id, name, new MockSocket() as unknown as WebSocket);
        this.world = world;
    }

    tick() {
        // Simple AI
        
        // 1. Check if we are alive (have cells)
        if (this.cells.length === 0) {
            // Respawn logic or stay dead?
            // For testing, let's respawn if we die
            this.world.addPlayer(this);
            return;
        }

        // 2. Control first cell (or average)
        // Find nearest food
        const myHead = this.cells[0]; // Simple AI uses first cell
        if (!myHead) return;

        // Scan surroundings (simulate vision)
        // We can cheat and look at world entities, but let's query spatial hash
        // Bot view distance
        const viewDist = 1000;
        const visible = this.world.spatialHash.query(myHead.position, viewDist);

        let target: Vector2 | null = null;
        let minDist = Infinity;
        let danger: Vector2 | null = null;
        let minDangerDist = Infinity;

        for (const entity of visible) {
            if (entity.id === myHead.id) continue;
            
            const dist = this.getDist(myHead.position, entity.position);

            // Avoid viruses if we are big
            if (entity.type === EntityType.Virus) {
                if (myHead.mass > 130 && dist < myHead.radius + 100) {
                     // Danger
                     if (dist < minDangerDist) {
                         minDangerDist = dist;
                         danger = entity.position;
                     }
                }
            }
            // Avoid bigger players
            else if (entity.type === EntityType.Player) {
                 const otherParams = entity as any; // Cast to access mass if available in base entity? 
                 // BaseEntity doesn't have mass, but in Server World it's a Cell object usually.
                 // We are in server code, so we can check instance
                 if (entity instanceof Cell) {
                     if (entity.playerId === this.id) continue; // Self

                     if (entity.mass > myHead.mass * 1.25) {
                         // Run away
                         if (dist < viewDist && dist < minDangerDist) {
                             minDangerDist = dist;
                             danger = entity.position;
                         }
                     } else if (entity.mass * 1.25 < myHead.mass) {
                         // Chase
                         if (dist < minDist) {
                             minDist = dist;
                             target = entity.position;
                         }
                     }
                 }
            } else if (entity.type === EntityType.Food) {
                // Food
                if (!target && !danger && dist < minDist) {
                     minDist = dist;
                     target = entity.position;
                }
            }
        }

        if (danger) {
            // Flee
            const dx = myHead.position.x - danger.x;
            const dy = myHead.position.y - danger.y;
            // Normalize and project far away
            this.updateTarget({
                x: myHead.position.x + dx * 10,
                y: myHead.position.y + dy * 10
            });
        }
        else if (target) {
            this.updateTarget(target);
        } else {
             // Random wander
             this.changeTargetTimer++;
             if (this.changeTargetTimer > 50) {
                 this.updateTarget(this.world.getRandomPosition());
                 this.changeTargetTimer = 0;
             }
        }
    }

    private updateTarget(pos: Vector2) {
        this.cells.forEach(c => c.target = pos);
    }

    private getDist(a: Vector2, b: Vector2) {
        return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
    }
}
