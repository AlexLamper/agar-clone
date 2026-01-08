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
    
    // AI State
    private state: 'wander' | 'eat' | 'flee' | 'chase' = 'wander';
    private currentTargetPos: Vector2 | null = null;
    private reactionDelay: number = 0;
    private bravery: number = 0.5; // 0 = Coward, 1 = Brave (Randomized per bot)

    constructor(id: string, name: string, world: World) {
        super(id, name, new MockSocket() as unknown as WebSocket);
        this.world = world;
        // Randomize bravery: determines how close they let big players get
        this.bravery = Math.random(); 
    }

    tick() {
        // Simple AI
        
        // 1. Check if we are alive (have cells)
        if (this.cells.length === 0) {
            // Respawn logic
            // Add slight delay before respawn? Handled by server tick usually, but here immediate:
            this.world.addPlayer(this);
            return;
        }

        const myHead = this.cells[0]; 
        if (!myHead) return;

        // Reaction delay to simulate human lag/reaction time
        if (this.reactionDelay > 0) {
            this.reactionDelay--;
            // If fleeing, keep fleeing. If wandering, keep wandering.
            // But if eating, maybe we want to continue eating.
            // For now, simple skip of decision making.
            if (this.currentTargetPos) this.updateTarget(this.currentTargetPos);
            return;
        }

        // Scan surroundings
        const viewDist = 1000;
        const visible = this.world.spatialHash.query(myHead.position, viewDist);

        let closestFood: Vector2 | null = null;
        let minFoodDist = Infinity;

        let closestPrey: Vector2 | null = null;
        let minPreyDist = Infinity;

        let closestThreat: Vector2 | null = null;
        let minThreatDist = Infinity;

        for (const entity of visible) {
            if (entity.id === myHead.id) continue;
            
            const dist = this.getDist(myHead.position, entity.position);

            if (entity.type === EntityType.Food) {
                if (dist < minFoodDist) {
                    minFoodDist = dist;
                    closestFood = entity.position;
                }
            }
            else if (entity.type === EntityType.Virus) {
                 if (myHead.mass > 130 && dist < myHead.radius + 150) {
                      // Treat virus as threat if big
                      if (dist < minThreatDist) {
                          minThreatDist = dist;
                          closestThreat = entity.position;
                      }
                 }
            }
            else if (entity.type === EntityType.Player && entity instanceof Cell) {
                if (entity.playerId === this.id) continue;

                if (entity.mass > myHead.mass * 1.25) {
                    // Threat
                    // Bravery factor: brave bots tolerate closer threats
                    const tolerance = 200 * (1 - this.bravery) + 50; 
                    const dangerZone = entity.radius + myHead.radius + tolerance;

                    if (dist < dangerZone) {
                        if (dist < minThreatDist) {
                            minThreatDist = dist;
                            closestThreat = entity.position;
                        }
                    }
                } else if (entity.mass * 1.25 < myHead.mass) {
                    // Prey
                    if (dist < minPreyDist) {
                        minPreyDist = dist;
                        closestPrey = entity.position;
                    }
                }
            }
        }

        // Decision Logic
        // Priority: Threat > Prey > Food > Wander
        
        // 1. Flee
        if (closestThreat) {
             // 10% chance to ignore threat momentarily (distracted/noob) if not SUPER close
             if (minThreatDist > myHead.radius + 100 && Math.random() < 0.1) {
                 // Ignore threat this tick
             } else {
                this.state = 'flee';
                const dx = myHead.position.x - closestThreat.x;
                const dy = myHead.position.y - closestThreat.y;
                this.currentTargetPos = {
                    x: myHead.position.x + dx * 10,
                    y: myHead.position.y + dy * 10
                };
                this.reactionDelay = 2; // Panic run for a few ticks
             }
        } 
        // 2. Chase
        else if (closestPrey && minPreyDist < 600) { // Only chase if reasonably close
             this.state = 'chase';
             this.currentTargetPos = closestPrey;
        }
        // 3. Eat Food
        else if (closestFood) {
             this.state = 'eat';
             this.currentTargetPos = closestFood;
        }
        // 4. Wander
        else {
             this.state = 'wander';
             this.changeTargetTimer++;
             if (!this.currentTargetPos || this.changeTargetTimer > 50) {
                 // Pick a random spot, occasionally towards center
                 if (Math.random() < 0.3) {
                     // Center-ish bias
                     this.currentTargetPos = { 
                         x: this.world.width/2 + (Math.random() - 0.5) * 1000, 
                         y: this.world.height/2 + (Math.random() - 0.5) * 1000 
                     };
                 } else {
                     this.currentTargetPos = this.world.getRandomPosition();
                 }
                 this.changeTargetTimer = 0;
             }
        }

        // Apply target
        if (this.currentTargetPos) {
            this.updateTarget(this.currentTargetPos);
        }
    }

    private updateTarget(pos: Vector2) {
        this.cells.forEach(c => c.target = pos);
    }

    private getDist(a: Vector2, b: Vector2) {
        return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
    }
}
