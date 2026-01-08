import { WebSocketServer, WebSocket } from 'ws';
import { World } from '../game/World.js';
import { Player } from '../game/Player.js';
import { Bot } from '../game/Bot.js';
import { 
    MessageType, 
    ClientMessage, 
    InitMessage, 
    UpdateMessage, 
    LeaderboardMessage,
    StatsMessage,
    ClaimHourlyMessage
} from 'shared';
import { v4 as uuidv4 } from 'uuid';

export class GameServer {
    private wss: WebSocketServer;
    private world: World;
    private interval: NodeJS.Timeout | null = null;
    private TICK_RATE = 40; // 40Hz for smoother gameplay
    private tickCount = 0;
    private bots: Bot[] = [];

    constructor(port: number) {
        this.wss = new WebSocketServer({ port });
        this.world = new World();

        this.wss.on('connection', (ws) => this.handleConnection(ws));
        
        // Add Bots
        for (let i = 0; i < 10; i++) {
             const bot = new Bot(uuidv4(), `Bot ${i+1}`, this.world);
             this.bots.push(bot);
             this.world.addPlayer(bot);
        }

        console.log(`Server started on port ${port}`);
    }

    start() {
        this.interval = setInterval(() => this.tick(), 1000 / this.TICK_RATE);
    }
    
    private handleConnection(ws: WebSocket) {
        console.log('New connection');
        // Temp ID until join
        const tempId = uuidv4();
        
        ws.on('message', (data) => {
            try {
                // console.log('Received message from', tempId); // Spammy
                const msg = JSON.parse(data.toString()) as ClientMessage;
                this.handleMessage(ws, tempId, msg);
            } catch (e) {
                console.error('Invalid message', e);
            }
        });

        ws.on('close', () => {
            console.log('Connection closed', tempId);
            this.world.removePlayer(tempId);
        });
    }

    private handleMessage(ws: WebSocket, playerId: string, msg: ClientMessage | ClaimHourlyMessage) {
        // console.log('Processing message:', msg.type);
        switch (msg.type) {
            case MessageType.JOIN:
                const player = new Player(playerId, msg.name, ws, msg.skin);
                this.world.addPlayer(player, msg.color);
                
                // Calculate initial visible entities
                let scale = 1;
                if (player.score > 0) {
                    scale = Math.max(1, Math.pow(player.score, 0.1));
                }
                const width = 1920 * scale;
                const height = 1080 * scale;
                const visibleEntities = this.world.getVisibleEntities(player, width, height);

                // Send Init
                const initMsg: InitMessage = {
                    type: MessageType.INIT,
                    worldSize: this.world.width,
                    playerId: playerId,
                    entities: visibleEntities,
                    players: Array.from(this.world.players.values()).map(p => ({
                        id: p.id,
                        name: p.name,
                        score: p.score
                    })),
                    coins: player.coins,
                    xp: player.xp,
                    level: player.level,
                    nextLevelXp: player.getNextLevelXp()
                };
                ws.send(JSON.stringify(initMsg));
                break;

            case MessageType.CLAIM_HOURLY:
                const p = this.world.players.get(playerId);
                if (p) {
                    const now = Date.now();
                    // Allow if never claimed (0) or > 1 hour ago
                    if (p.lastHourlyLine === 0 || now - p.lastHourlyLine >= 3600000) {
                        p.coins += 20;
                        p.lastHourlyLine = now;
                        // Stats will update next tick or we can force one
                    }
                }
                break;

            case MessageType.INPUT:
                this.world.handleInput(playerId, msg);
                break;
        }
    }

    private tick() {
        // Update Bots
        this.bots.forEach(bot => bot.tick());

        this.world.tick();
        this.broadcastUpdate();
        
        this.tickCount++;
        if (this.tickCount % 20 === 0) { // Every 0.5s
             this.broadcastLeaderboard();
        }
        if (this.tickCount % 40 === 0) { // Every 1s
            this.broadcastStats();
        }
    }

    private broadcastStats() {
        this.world.players.forEach(player => {
            if (player instanceof Bot) return;
            if (player.socket.readyState === WebSocket.OPEN) {
                const now = Date.now();
                const timeLeft = Math.max(0, 3600000 - (now - player.lastHourlyLine));
                const available = player.lastHourlyLine === 0 || timeLeft === 0;

                const msg: StatsMessage = {
                    type: MessageType.STATS,
                    coins: player.coins,
                    level: player.level,
                    xp: player.xp,
                    nextLevelXp: player.getNextLevelXp(),
                    hourlyAvailable: available,
                    hourlyTimeLeft: available ? 0 : timeLeft
                };
                player.socket.send(JSON.stringify(msg));
            }
        });
    }

    private broadcastUpdate() {
        // Send updates individually based on viewport
        const deadPlayers: string[] = [];

        this.world.players.forEach(player => {
            if (player instanceof Bot) return; // Skip bots updates

            if (player.cells.length === 0) {
                // Dead
                if (player.socket.readyState === WebSocket.OPEN) {
                    const msg = { type: MessageType.GAME_OVER };
                    player.socket.send(JSON.stringify(msg));
                }
                deadPlayers.push(player.id);
                return;
            }

            if (player.socket.readyState === WebSocket.OPEN) {
                // Get visible entities
                // Zoom factor: As player grows, view grows.
                // Simple formula: viewScale = Math.pow(playerScale, 0.4)?
                // For now fixed large viewport or based on score.
                
                let scale = 1;
                if (player.score > 0) {
                    scale = Math.max(1, Math.pow(player.score, 0.1));
                }
                const width = 1920 * scale;
                const height = 1080 * scale;

                const visibleEntities = this.world.getVisibleEntities(player, width, height);
                
                const updateMsg: UpdateMessage = {
                    type: MessageType.UPDATE,
                    entities: visibleEntities, 
                    removedEntityIds: [] 
                };
                player.socket.send(JSON.stringify(updateMsg));
            }
        });

        // Cleanup dead players
        deadPlayers.forEach(id => this.world.removePlayer(id));
    }

    private broadcastLeaderboard() {
        const leaderboardMsg: LeaderboardMessage = {
            type: MessageType.LEADERBOARD,
            entries: Array.from(this.world.players.values())
                .sort((a, b) => b.score - a.score)
                .slice(0, 10)
                .map(p => ({ name: p.name, score: p.score }))
        };
        
        const lbData = JSON.stringify(leaderboardMsg);
        this.wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(lbData);
            }
        });
    }

}
