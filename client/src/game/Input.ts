import type { Vector2 } from 'shared';

export class Input {
    public mouse: Vector2 = { x: 0, y: 0 };
    private canvas: HTMLCanvasElement;
    private cameraPos: Vector2 = { x: 0, y: 0 };

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    }

    setCameraPos(pos: Vector2) {
        this.cameraPos = pos;
    }

    // Returns world coordinates target based on mouse position
    getTarget(): Vector2 {
        // Center of screen is player position (cameraPos)
        // Mouse is relative to top-left of screen
        
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;

        const dx = this.mouse.x - centerX;
        const dy = this.mouse.y - centerY;

        return {
            x: this.cameraPos.x + dx,
            y: this.cameraPos.y + dy
        };
    }

    private onMouseMove(e: MouseEvent) {
        this.mouse.x = e.clientX;
        this.mouse.y = e.clientY;
    }
}
