import { MessageType, EntityType } from 'shared';
import type { BaseEntity, ServerMessage, Player } from 'shared';
import { Input } from './Input';
import { Renderer } from './Renderer';
import { Socket } from '../net/Socket';
import { SKINS } from '../skins';
import type { SkinDef } from '../skins';

// Interpolation wrapper
interface InterpolatedEntity extends BaseEntity {
    renderPos: { x: number, y: number };
    targetPos: { x: number, y: number };
    mass?: number;
}

export class Game {
    private canvas: HTMLCanvasElement;
    private renderer: Renderer;
    private input: Input;
    private socket: Socket;
    private selectedSkin: SkinDef = SKINS[0];

    private players: Player[] = []; 
    private leaderboard: {name: string, score: number}[] = [];
    private me: Player | undefined;
    private worldSize: number = 2000;
    
    private isRunning: boolean = false;
    private lastInputTime: number = 0;
    private hasJoined: boolean = false;
    private deathTime: number = 0;
    
    // For interpolation
    private clientEntities: Map<string, InterpolatedEntity> = new Map();

    constructor() {
        this.canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
        this.renderer = new Renderer(this.canvas);
        this.input = new Input(this.canvas);
        
        // Auto connect
        this.socket = new Socket('ws://localhost:3000', (msg) => this.handleMessage(msg));

        this.setupUI();
        this.setupGameOverUI();
    }

    private setupUI() {
        const btn = document.getElementById('playBtn');
        const input = document.getElementById('playerName') as HTMLInputElement;
        const colorInput = document.getElementById('playerColor') as HTMLInputElement;
        const overlay = document.getElementById('ui-overlay');

        // Load saved preferences
        if (input) {
            const savedName = localStorage.getItem('agar_playerName');
            if (savedName) input.value = savedName;
        }
        
        // Load Skin Preference
        const savedSkinId = localStorage.getItem('agar_skinId');
        if (savedSkinId) {
            const skin = SKINS.find(s => s.id === savedSkinId);
            if (skin) {
                 this.selectedSkin = skin;
            }
        }
        this.updateSkinUI();

        // Color Picker Logic
        const skinPreview = document.getElementById('skinPreview');
        const playerColorInput = document.getElementById('playerColor') as HTMLInputElement;
        const plusIcon = document.querySelector('.plus-icon') as HTMLElement;
        
        if (skinPreview) {
            // Default "No Skin" preview (maybe default color or just gray)
            skinPreview.style.backgroundColor = '#cccccc';
        }

        // Skin Modal Logic
        const skinSelector = document.getElementById('skinSelector');
        const skinModal = document.getElementById('skin-modal-overlay');
        const closeSkinModal = document.getElementById('close-skin-modal');
        const skinGrid = document.getElementById('skinGrid');

        const openSkinModal = (e: Event) => {
             e.preventDefault();
             e.stopPropagation();
             if (skinModal) skinModal.style.display = 'flex';
             renderSkinGrid();
        };

        const closeSkinModalFn = () => {
             if (skinModal) skinModal.style.display = 'none';
        }

        if (skinSelector) skinSelector.addEventListener('click', openSkinModal);
        if (closeSkinModal) closeSkinModal.addEventListener('click', closeSkinModalFn);

        // Click outside to close
        skinModal?.addEventListener('click', (e) => {
            if (e.target === skinModal) closeSkinModalFn();
        });

        const renderSkinGrid = () => {
             if (!skinGrid) return;
             skinGrid.innerHTML = '';
             SKINS.forEach(skin => {
                 const el = document.createElement('div');
                 el.className = 'skin-item';
                 if (skin.id === this.selectedSkin.id) el.classList.add('selected');
                 
                 // Render Content
                 if (skin.id === 'none') {
                     // Show color or just text
                     el.innerText = 'No Skin';
                     el.style.display = 'flex';
                     el.style.alignItems = 'center';
                     el.style.justifyContent = 'center';
                     el.style.fontSize = '12px';
                     el.style.color = '#333';
                 } else if (skin.canvas) {
                     el.style.backgroundImage = `url(${skin.canvas.toDataURL()})`;
                 }
                 
                 el.addEventListener('click', () => {
                     this.selectedSkin = skin;
                     this.updateSkinUI();
                     closeSkinModalFn();
                 });
                 skinGrid.appendChild(el);
             });
        }

        // Free Coins Logic
        const freeCoinsBtn = document.getElementById('freeCoinsBtn');
        const coinPopup = document.getElementById('popup-overlay'); // Hourly coin popup
        const closeCoinPopup = document.getElementById('close-coin-popup');
        const claimBtnVisual = document.getElementById('claim-btn-visual');

        freeCoinsBtn?.addEventListener('click', () => {
             if (freeCoinsBtn.style.pointerEvents === 'none') {
                 console.log("Button disabled");
                 return;
             }
             this.socket.sendClaimHourly();
             // Open feedback popup immediately (optimistic)
             if (coinPopup) coinPopup.style.display = 'flex';
        });

        const closeCoinFn = () => {
            if (coinPopup) coinPopup.style.display = 'none';
        };

        closeCoinPopup?.addEventListener('click', closeCoinFn);
        claimBtnVisual?.addEventListener('click', closeCoinFn);

        // Menu Buttons Logic
        const genericModal = document.getElementById('generic-modal-overlay');
        const genericTitle = document.getElementById('generic-modal-title');
        const closeGeneric = document.getElementById('close-generic-modal');

        const openGenericModal = (title: string) => {
            if (genericTitle) genericTitle.innerText = title;
            if (genericModal) genericModal.style.display = 'flex';
        };

        document.getElementById('btn-shop')?.addEventListener('click', () => openGenericModal('Shop'));
        document.getElementById('btn-leaderboard')?.addEventListener('click', () => openGenericModal('Leaderboards'));
        document.getElementById('btn-quests')?.addEventListener('click', () => openGenericModal('Quests'));

        // Settings Button Modal Logic
        const settingsBtn = document.getElementById('settings-btn');
        settingsBtn?.addEventListener('click', () => {
            if (genericTitle) genericTitle.innerText = 'Settings';
            if (genericModal) genericModal.style.display = 'flex';
        });

        closeGeneric?.addEventListener('click', () => {
            if (genericModal) genericModal.style.display = 'none';
        });

        const restartBtn = document.getElementById('restartBtn');
        restartBtn?.addEventListener('click', () => {
             const gameOverOverlay = document.getElementById('game-over-overlay');
             if (gameOverOverlay) gameOverOverlay.style.display = 'none';
             if (overlay) overlay.style.display = 'flex';
             this.clientEntities.clear();
        });

        btn?.addEventListener('click', () => {
             const name = input.value || 'Guest';
             
             // Logic: If skin is 'none', send UNDEFINED color (server picks random).
             // If skin is selected, send 'none' or null as color, server uses skin.
             // Actually, server code: if (skin) user has skin. Color is secondary or ignored?
             // Let's send undefined for color so server picks random color if no skin, 
             // or server picks random color for the "underneath" of the skin.
             
             // Save preferences
             localStorage.setItem('agar_playerName', name);
             if (this.selectedSkin.id !== 'none') {
                  localStorage.setItem('agar_skinId', this.selectedSkin.id);
             } else {
                  localStorage.removeItem('agar_skinId');
             }
             
             // If "No Skin" is selected, we want a RANDOM color.
             // If we send 'undefined' color, server logic `const startColor = color || this.getRandomColor();` handles it.
             // So we just don't send color at all.

             const skinId = this.selectedSkin.id === 'none' ? undefined : this.selectedSkin.id;
             console.log("Joing with skin:", skinId); // Debug
             this.socket.sendJoin(name, undefined, skinId);

             if (overlay) overlay.style.display = 'none';
             this.hasJoined = true;
             this.deathTime = 0;
             this.start();
        });
    }

    private setupGameOverUI() {
        const restartBtn = document.getElementById('restartBtn');
        const overlay = document.getElementById('game-over-overlay');
        const uiOverlay = document.getElementById('ui-overlay');

        restartBtn?.addEventListener('click', () => {
            if (overlay) overlay.style.display = 'none';
            if (uiOverlay) uiOverlay.style.display = 'flex'; // Go back to main menu
            this.hasJoined = false;
        });
    }

    start() {
        console.log('Starting game loop');
        if (this.isRunning) return;
        this.isRunning = true;
        this.loop();
    }

    private loop() {
        if (!this.isRunning) return;
        requestAnimationFrame(() => this.loop());

        // Process Interpolation
        this.updateInterpolation();

        // Check Death
        if (this.hasJoined && this.me) {
             const myCells = Array.from(this.clientEntities.values())
                .filter(e => e.type === EntityType.Player && (e as any).playerId === this.me!.id);
             
             // Simple death check:Joined but no cells found in update
             // Need a grace period? Init message should come first.
             // If we have received entities at least once, and now have 0, we dead.
             if (this.clientEntities.size > 0 && myCells.length === 0) {
                 // Check if we just died or if it's lag
                 // Let's assume death if it persists for a few frames?
                 // Or just trigger immediate.
                 if (this.deathTime === 0) {
                     this.deathTime = Date.now();
                 } else if (Date.now() - this.deathTime > 1000) {
                     // 1 second confirm
                     this.showGameOver();
                 }
             } else {
                 this.deathTime = 0;
             }
        }

        // Send Input (Throttled to 20Hz)
        const now = Date.now();
        if (this.me && now - this.lastInputTime > 50) { 
             const target = this.input.getTarget();
             this.socket.sendInput(target, this.input.split, this.input.eject);
             
             // Reset one-frame inputs
             this.input.split = false;
             this.input.eject = false;
             
             this.lastInputTime = now;
        }

        // Render (Use clientEntities values)
        // We need to convert Map back to array for renderer, or update renderer.
        // Let's just pass values().
        const renderList = Array.from(this.clientEntities.values()).map(e => ({
            ...e,
            position: e.renderPos // Override position with interpolated one
        }));

        this.renderer.render(renderList, this.players, this.me, this.worldSize, this.leaderboard, this.input.zoom);
        
        // Update input camera
        if (this.me) {
             const myCells = renderList.filter(e => (e as any).playerId === this.me!.id);
             if (myCells.length > 0) {
                 const cx = myCells.reduce((s, c) => s + c.position.x, 0) / myCells.length;
                 const cy = myCells.reduce((s, c) => s + c.position.y, 0) / myCells.length;
                 this.input.setCameraPos({ x: cx, y: cy });
             }
        }
    }

    private showGameOver() {
        const overlay = document.getElementById('game-over-overlay');
        const scoreSpan = document.getElementById('finalScore');
        if (scoreSpan && this.me) scoreSpan.innerText = this.me.score.toString();
        
        if (overlay) overlay.style.display = 'flex';
        this.isRunning = false; 
    }

    private updateInterpolation() {
        const LERP_FACTOR = 0.1; // Adjust for smoothness vs lag
        
        this.clientEntities.forEach(entity => {
            const dx = entity.targetPos.x - entity.renderPos.x;
            const dy = entity.targetPos.y - entity.renderPos.y;
            
            // If distance is huge (teleport/respawn), snap
            if (dx*dx + dy*dy > 500*500) {
                entity.renderPos.x = entity.targetPos.x;
                entity.renderPos.y = entity.targetPos.y;
            } else {
                entity.renderPos.x += dx * LERP_FACTOR;
                entity.renderPos.y += dy * LERP_FACTOR;
            }
        });
    }

    private handleMessage(msg: ServerMessage | any) {
        // console.log('Received message:', msg.type); // Too spammy for update
        switch (msg.type) {
            case MessageType.INIT:
                this.worldSize = msg.worldSize;
                this.syncEntities(msg.entities);
                this.players = msg.players;
                this.me = this.players.find(p => p.id === msg.playerId);
                // Initial Stats
                this.handleStats({
                    coins: (msg as any).coins || 0,
                    level: (msg as any).level || 1,
                    xp: (msg as any).xp || 0,
                    nextLevelXp: (msg as any).nextLevelXp || 1000,
                    hourlyAvailable: true, 
                    hourlyTimeLeft: 0
                });
                break;
            case MessageType.UPDATE:
                this.syncEntities(msg.entities);
                // Refind me if stats changed
                if (this.me) {
                    // Update score from client entities (interpolated ones have correct metadata)
                    const myCells = Array.from(this.clientEntities.values()).filter(e => (e as any).playerId === this.me!.id);
                    this.me.score = myCells.reduce((s, c) => s + Math.floor((c as any).mass), 0);
                }
                break;
            case MessageType.LEADERBOARD:
                this.leaderboard = msg.entries;
                break;
            case MessageType.GAME_OVER:
                this.showGameOver();
                break;
            case MessageType.STATS:
                this.handleStats(msg as any);
                break;
        }
    }

    private handleStats(msg: any) { // StatsMessage
         const menuCoins = document.getElementById('menuCoins');
         const menuLevel = document.getElementById('menuLevel');
         const menuXp = document.getElementById('menuXp');
         
         const menuXpBar = document.getElementById('menuXpBar');
         const menuXpText = document.getElementById('menuXpText');

         const freeCoinsText = document.getElementById('freeCoinsText');
         const freeCoinsBtn = document.getElementById('freeCoinsBtn');

         if (menuCoins) menuCoins.innerText = msg.coins != null ? msg.coins.toString() : '0';
         if (menuLevel) menuLevel.innerText = msg.level != null ? msg.level.toString() : '1';
         if (menuXp) menuXp.innerText = msg.xp != null ? msg.xp.toString() : '0';

         if (menuXpBar && menuXpText) {
             const xp = msg.xp || 0;
             const nextXp = msg.nextLevelXp || 1000;
             const pct = Math.min(100, Math.max(0, (xp / nextXp) * 100));
             menuXpBar.style.width = `${pct}%`;
             menuXpText.innerText = `${xp}/${nextXp} XP`;
         }

         if (freeCoinsText && freeCoinsBtn) {
             if (msg.hourlyAvailable) {
                 freeCoinsText.innerText = "Free Coins";
                 freeCoinsBtn.style.opacity = '1';
                 freeCoinsBtn.style.pointerEvents = 'auto';
                 freeCoinsBtn.style.cursor = 'pointer';
             } else {
                 const m = Math.floor(msg.hourlyTimeLeft / 60000);
                 const s = Math.floor((msg.hourlyTimeLeft % 60000) / 1000);
                 freeCoinsText.innerText = `Collect: ${m}m ${s}s`;
                 freeCoinsBtn.style.opacity = '0.5';
                 freeCoinsBtn.style.pointerEvents = 'none';
                 freeCoinsBtn.style.cursor = 'default';
             }
         }
    }

    private syncEntities(serverEntities: BaseEntity[]) {
        const serverIds = new Set(serverEntities.map(e => e.id));
        // console.log('Syncing count:', serverEntities.length); // Debug

        // Update or Add
        serverEntities.forEach(sEntity => {
            const current = this.clientEntities.get(sEntity.id);
            if (current) {
                // Update target
                current.targetPos = sEntity.position;
                // current.radius = sEntity.radius; // Don't snap radius
                
                // Animate radius
                const dr = sEntity.radius - current.radius;
                if (Math.abs(dr) > 0.5) {
                    current.radius += dr * 0.2; // Smooth radius growth/shrink
                } else {
                    current.radius = sEntity.radius;
                }

                current.mass = (sEntity as any).mass; // Hacky cast
                current.color = sEntity.color;
                
                // Force update skin if present
                if ((sEntity as any).skin !== undefined) {
                     // console.log('Entity has skin:', (sEntity as any).skin);
                     (current as any).skin = (sEntity as any).skin;
                }
            } else {
                // Add new
                if ((sEntity as any).skin) console.log("New entity skin:", (sEntity as any).skin);
                
                this.clientEntities.set(sEntity.id, {
                    ...sEntity,
                    renderPos: { ...sEntity.position },
                    targetPos: { ...sEntity.position }
                });
            }
        });

        // Remove dead
        for (const id of this.clientEntities.keys()) {
            if (!serverIds.has(id)) {
                this.clientEntities.delete(id);
            }
        }
    }

    private updateSkinUI() {
        const skinPreview = document.getElementById('skinPreview');
        if (!skinPreview) return;

        if (this.selectedSkin.id === 'none') {
            skinPreview.style.backgroundImage = 'none';
            skinPreview.style.backgroundColor = '#cccccc'; // Default placeholder
        } else {
            // Use the cached canvas if available
            if (this.selectedSkin.canvas) {
                skinPreview.style.backgroundImage = `url(${this.selectedSkin.canvas.toDataURL()})`;
                skinPreview.style.backgroundSize = 'cover';
                skinPreview.style.backgroundColor = 'transparent'; // Clear bg
                // Ensure pixelated look for preview
                skinPreview.style.imageRendering = 'pixelated'; 
            }
        }
    }
}
