import type { Vector2 } from 'shared';

export class Input {
    public mouse: Vector2 = { x: 0, y: 0 };
    private canvas: HTMLCanvasElement;
    private cameraPos: Vector2 = { x: 0, y: 0 };

    public split: boolean = false;
    public eject: boolean = false;
    public zoom: number = 1.0;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        window.addEventListener('mousemove', (e) => this.onMouseMove(e));
        window.addEventListener('keydown', (e) => this.onKeyDown(e));
        window.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    }

    setCameraPos(pos: Vector2) {
        this.cameraPos = pos;
    }

    private onKeyDown(e: KeyboardEvent) {
        if ((e.target as HTMLElement).tagName === 'INPUT') return; 

        if (e.code === 'Space') {
            this.split = true;
        } else if (e.code === 'KeyW') {
            this.eject = true;
        }
    }

    private onWheel(e: WheelEvent) {
        e.preventDefault();
        const zoomSpeed = 0.001;
        this.zoom -= e.deltaY * zoomSpeed;
        this.zoom = Math.max(0.1, Math.min(2.0, this.zoom));
    }

    // Returns world coordinates target based on mouse position
    getTarget(): Vector2 {
        // Center of screen is player position (cameraPos)
        // Mouse is relative to top-left of screen
        
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;

        const dx = (this.mouse.x - centerX) / this.zoom;
        const dy = (this.mouse.y - centerY) / this.zoom;

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
