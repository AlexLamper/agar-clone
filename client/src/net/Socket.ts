import { MessageType } from 'shared';
import type { ClientMessage, ServerMessage, Vector2, JoinMessage } from 'shared';

type MessageHandler = (msg: ServerMessage) => void;

export class Socket {
    private ws: WebSocket;
    private messageHandler: MessageHandler;

    constructor(url: string, handler: MessageHandler) {
        this.ws = new WebSocket(url);
        this.messageHandler = handler;

        this.ws.onopen = () => {
            console.log('Connected to server');
        };

        this.ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data) as ServerMessage;
                this.messageHandler(msg);
            } catch (e) {
                console.error('Failed to parse message', e);
            }
        };
    }

    sendJoin(name: string, color?: string, skin?: string, savedLevel?: number, savedXp?: number, savedCoins?: number) {
        console.log('Sending join:', name);
        const msg: JoinMessage = {
            type: MessageType.JOIN,
            name,
            color,
            skin,
            savedLevel,
            savedXp,
            savedCoins
        };
        this.send(msg);
    }

    sendInput(target: Vector2, split: boolean = false, eject: boolean = false) {
        if (this.ws.readyState !== WebSocket.OPEN) return;
        
        const msg: ClientMessage = {
            type: MessageType.INPUT,
            target,
            split,
            eject
        };
        this.send(msg);
    }

    sendClaimHourly() {
        if (this.ws.readyState !== WebSocket.OPEN) return;
        // @ts-ignore
        const msg: ClientMessage = { type: MessageType.CLAIM_HOURLY };
        // @ts-ignore
        this.send(msg);
    }

    private send(msg: ClientMessage) {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg));
        } else {
            console.warn('Socket not open', this.ws.readyState);
        }
    }
}
