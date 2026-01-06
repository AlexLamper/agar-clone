import { WebSocketServer, WebSocket } from 'ws';
import { World } from '../game/World.js';
import { Player } from '../game/Player.js';
import { 
    MessageType, 
    ClientMessage, 
    InitMessage, 
    UpdateMessage, 
    LeaderboardMessage 
} from 'shared';
import { v4 as uuidv4 } from 'uuid';

export class GameServer {
    private wss: WebSocketServer;
    private world: World;
    private interval: NodeJS.Timeout | null = null;
    private TICK_RATE = 20; // 20 updates per second (50ms)

    constructor(port: number) {
        this.wss = new WebSocketServer({ port });
        this.world = new World();

        this.wss.on('connection', (ws) => this.handleConnection(ws));
        
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

    private handleMessage(ws: WebSocket, playerId: string, msg: ClientMessage) {
        console.log('Processing message:', msg.type);
        switch (msg.type) {
            case MessageType.JOIN:
                const player = new Player(playerId, msg.name, ws);
                this.world.addPlayer(player);
                
                // Send Init
                const initMsg: InitMessage = {
                    type: MessageType.INIT,
                    worldSize: this.world.width,
                    playerId: playerId,
                    entities: this.world.entities,
                    players: Array.from(this.world.players.values()).map(p => ({
                        id: p.id,
                        name: p.name,
                        score: p.score
                    }))
                };
                ws.send(JSON.stringify(initMsg));
                break;

            case MessageType.INPUT:
                this.world.handleInput(playerId, msg.target);
                break;
        }
    }

    private tick() {
        this.world.tick();
        this.broadcastUpdate();
    }

    private broadcastUpdate() {
        const updateMsg: UpdateMessage = {
            type: MessageType.UPDATE,
            entities: this.world.entities, // Optimization: Send only visible/changed later
            removedEntityIds: [] // Diffs not implemented yet
        };

        const data = JSON.stringify(updateMsg);
        
        this.wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(data);
            }
        });

        // Periodic leaderboard? Or every tick?
        // Let's do every tick for smoothness now
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
