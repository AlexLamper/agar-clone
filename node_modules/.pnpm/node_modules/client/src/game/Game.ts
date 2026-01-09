import { MessageType, EntityType } from 'shared';
import type { BaseEntity, ServerMessage, Player } from 'shared';
import { LEVELS } from 'shared';
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
        
        // Load custom skins on startup (Moved here to ensure loaded before UI rendering)
        const existingCustomsStr = localStorage.getItem('agar_custom_skins');
        if (existingCustomsStr) {
             try {
                const customs: SkinDef[] = JSON.parse(existingCustomsStr);
                customs.forEach(c => {
                    // Avoid dups
                    if (!SKINS.find(s => s.id === c.id)) {
                        SKINS.push(c);
                        // Generate canvas cache via renderer
                        c.canvas = this.renderer.createSkinCanvas(c);
                        // Also inject into renderer internal cache if needed, but renderer exposes createSkinCanvas purely functional? 
                        // Actually renderer has internal cache `this.skinCanvasCache.set(skin.id, sCanvas);`
                        // We need to call that.
                        // Or we expose a method `registerSkin(skin)` on renderer.
                        // For now, let's just piggyback on `createSkinCanvas` being public and cache handling in updateSkinUI loop?
                        // No, Renderer's loop happens in constructor.
                        // We should expose a register method.
                        
                        // Hack: Since Renderer.ts uses SKINS global export in its constructor, 
                        // if we push to SKINS *after* renderer is created, renderer won't cache them automatically.
                        // But `updateSkinUI` calls `createSkinCanvas` and caches on `this.selectedSkin.canvas`.
                        // But `render` loop uses `skinCanvasCache`.
                        // Fix: Let's make `render` use `skin.canvas` if available? Or add to cache.
                    }
                });
                
                // Hacky fix: Manually add to renderer cache
                this.renderer.registerSkins(customs);
             } catch(e) { console.error("Error loading custom skins", e); }
        }

        // Auto connect
        // Determine WebSocket URL based on environment
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = import.meta.env.PROD ? window.location.host : 'localhost:3000';
        // Use /ws path in production for easier Nginx routing
        const path = import.meta.env.PROD ? '/ws' : '';
        const wsUrl = `${protocol}//${host}${path}`;
        
        console.log('Connecting to Server:', wsUrl);
        this.socket = new Socket(wsUrl, (msg) => this.handleMessage(msg));

        this.setupUI();
        this.setupGameOverUI();
    }

    private setupUI() {
        const btn = document.getElementById('playBtn');
        const input = document.getElementById('playerName') as HTMLInputElement;
        const colorInput = document.getElementById('playerColor') as HTMLInputElement;
        const overlay = document.getElementById('ui-overlay');

        // Restore Stats UI immediately from persistence
        const savedLevel = localStorage.getItem('agar_level');
        const savedCoins = localStorage.getItem('agar_coins');
        const savedXp = localStorage.getItem('agar_xp');
        
        const menuCoins = document.getElementById('menuCoins');
        const menuLevel = document.getElementById('menuLevel');
        const menuXp = document.getElementById('menuXp');
        const menuXpBar = document.getElementById('menuXpBar');
        const menuXpText = document.getElementById('menuXpText');

        if (menuCoins) menuCoins.innerText = savedCoins || '0';
        if (menuLevel) menuLevel.innerText = savedLevel || '1';
        if (menuXp) menuXp.innerText = savedXp || '0';
        
        if (menuXpBar && menuXpText && savedLevel && savedXp) {
             const lvl = parseInt(savedLevel);
             const xp = parseInt(savedXp);
             const nextXp = LEVELS[lvl - 1] ? LEVELS[lvl-1].xp : 1000;
             const pct = Math.min(100, Math.max(0, (xp / nextXp) * 100));
             menuXpBar.style.width = `${pct}%`;
             menuXpText.innerText = `${xp}/${nextXp} XP`;
        }


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
        
        // --- Skin Editor Logic ---
        this.setupSkinEditor(renderSkinGrid);

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
             
             // Restore stats from storage
             const savedLevel = localStorage.getItem('agar_level');
             const savedXp = localStorage.getItem('agar_xp');
             const savedCoins = localStorage.getItem('agar_coins');

             this.socket.sendJoin(
                 name, 
                 undefined, 
                 skinId, 
                 savedLevel ? parseInt(savedLevel) : 1, 
                 savedXp ? parseInt(savedXp) : 0, 
                 savedCoins ? parseInt(savedCoins) : 0
            );

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

    private showGameOver(stats?: any) {
        const overlay = document.getElementById('game-over-overlay');
        
        if (stats) {
            const foodEl = document.getElementById('stat-food');
            const timeEl = document.getElementById('stat-time');
            const cellsEl = document.getElementById('stat-cells');
            const massEl = document.getElementById('stat-mass');
            const lbEl = document.getElementById('stat-lb-time');
            const topEl = document.getElementById('stat-top');

            if (foodEl) foodEl.innerText = stats.foodEaten.toString();
            if (cellsEl) cellsEl.innerText = stats.cellsEaten.toString();
            if (massEl) massEl.innerText = stats.highestMass.toString();
            
            if (timeEl) {
                const s = Math.floor(stats.timeAlive || 0);
                const min = Math.floor(s / 60);
                const sec = s % 60;
                timeEl.innerText = `${min}:${sec.toString().padStart(2, '0')}`;
            }

            if (lbEl) {
                const s = Math.floor(stats.leaderboardTime || 0);
                const min = Math.floor(s / 60);
                const sec = s % 60;
                lbEl.innerText = `${min}:${sec.toString().padStart(2, '0')}`;
            }
            
            if (topEl) {
                topEl.innerText = (stats.topPosition && stats.topPosition > 0 && stats.topPosition < 1000) ? stats.topPosition.toString() : '-';
            }
        }
        
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
                this.showGameOver((msg as any).stats);
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

         // Save stats locally on update (Use truthy check carefully: 0 is falsy but valid)
         // Level is 1+, ok. XP and Coins can be 0.
         if (msg.level != null) localStorage.setItem('agar_level', msg.level.toString());
         if (msg.xp != null) localStorage.setItem('agar_xp', msg.xp.toString());
         if (msg.coins != null) localStorage.setItem('agar_coins', msg.coins.toString());

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
            // If it's a new custom skin, we might need to generate the canvas or it should already be there
            if (!this.selectedSkin.canvas) {
                // Try to generate on the fly if missing (e.g. just created)
                this.selectedSkin.canvas = this.renderer.createSkinCanvas(this.selectedSkin);
            }

            if (this.selectedSkin.canvas) {
                skinPreview.style.backgroundImage = `url(${this.selectedSkin.canvas.toDataURL()})`;
                skinPreview.style.backgroundSize = 'cover';
                skinPreview.style.backgroundColor = 'transparent'; // Clear bg
                // Ensure pixelated look for preview
                skinPreview.style.imageRendering = 'pixelated'; 
            }
        }
    }

    private setupSkinEditor(refreshGrid: () => void) {
        const btnCreate = document.getElementById('btn-create-skin');
        const editorOverlay = document.getElementById('skin-editor-overlay');
        const btnSave = document.getElementById('btn-save-skin');
        const btnCancel = document.getElementById('btn-cancel-skin');
        const closeEditor = document.getElementById('close-editor-modal');
        const canvas = document.getElementById('editorCanvas') as HTMLCanvasElement;
        const colorPicker = document.getElementById('editorColorPicker') as HTMLInputElement;
        const paletteContainer = document.getElementById('editorPalette');
        const nameInput = document.getElementById('editorSkinName') as HTMLInputElement;
        
        if (!btnCreate || !editorOverlay || !canvas) return;

        const GRID_SIZE = 16;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.imageSmoothingEnabled = false;

        // Editor State
        let currentColor = '#ff0000';
        let pixels: string[][] = []; // [y][x] hex color
        
        // Init Grid
        const resetGrid = () => {
             pixels = [];
             for(let y=0; y<GRID_SIZE; y++) {
                 const row = [];
                 for(let x=0; x<GRID_SIZE; x++) {
                     row.push('#ffffff'); // Start filled white
                 }
                 pixels.push(row);
             }
        };

        const drawGrid = () => {
             const scale = canvas.width / GRID_SIZE;
             ctx.clearRect(0, 0, canvas.width, canvas.height);
             for(let y=0; y<GRID_SIZE; y++) {
                 for(let x=0; x<GRID_SIZE; x++) {
                     ctx.fillStyle = pixels[y][x];
                     ctx.fillRect(x*scale, y*scale, scale, scale);
                     // Grid lines
                     /*
                     ctx.strokeStyle = '#ccc';
                     ctx.lineWidth = 1;
                     ctx.strokeRect(x*scale, y*scale, scale, scale);
                     */
                 }
             }
        };

        const generatePalette = () => {
             if (!paletteContainer) return;
             paletteContainer.innerHTML = '';
             const defaultColors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff', '#ffffff', '#000000', '#FFA500', '#808080'];
             defaultColors.forEach(c => {
                 const d = document.createElement('div');
                 d.className = 'palette-color';
                 d.style.backgroundColor = c;
                 d.onclick = () => {
                     currentColor = c;
                     if (colorPicker) colorPicker.value = c;
                 };
                 paletteContainer.appendChild(d);
             });
        };

        btnCreate.addEventListener('click', () => {
            resetGrid();
            drawGrid();
            generatePalette();
            // Close selector, open editor
            const selector = document.getElementById('skin-modal-overlay');
            if (selector) selector.style.display = 'none';
            editorOverlay.style.display = 'flex';
        });

        const closeFn = () => {
            editorOverlay.style.display = 'none';
            // Re-open selector
            const selector = document.getElementById('skin-modal-overlay');
            if (selector) selector.style.display = 'flex';
        };

        btnCancel?.addEventListener('click', closeFn);
        closeEditor?.addEventListener('click', closeFn);

        // Drawing Logic
        let isDrawing = false;
        const paint = (e: MouseEvent) => {
             const rect = canvas.getBoundingClientRect();
             const x = Math.floor((e.clientX - rect.left) / (rect.width / GRID_SIZE));
             const y = Math.floor((e.clientY - rect.top) / (rect.height / GRID_SIZE));
             
             if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) {
                 if (e.buttons === 1) { // Left click paint
                     pixels[y][x] = currentColor;
                     drawGrid();
                 } else if (e.buttons === 2) { // Right click pick
                     currentColor = pixels[y][x];
                     if(colorPicker) colorPicker.value = currentColor;
                 }
             }
        };

        canvas.addEventListener('mousedown', (e) => { isDrawing = true; paint(e); });
        canvas.addEventListener('mousemove', (e) => { if (isDrawing) paint(e); });
        canvas.addEventListener('mouseup', () => isDrawing = false);
        canvas.addEventListener('mouseleave', () => isDrawing = false);
        canvas.addEventListener('contextmenu', e => e.preventDefault());

        colorPicker?.addEventListener('input', (e) => {
            currentColor = (e.target as HTMLInputElement).value;
        });

        // Save
        btnSave?.addEventListener('click', () => {
            // Convert pixels to skin def
            const id = 'custom_' + Date.now();
            const pixStrings: string[] = [];
            const palette: {[k:string]: string} = {};
            let charCode = 65; // A

            // Map unique colors to chars
            const colorMap = new Map<string, string>();
            
            pixels.forEach(row => {
                let rowStr = "";
                row.forEach(c => {
                    if (!colorMap.has(c)) {
                        const char = String.fromCharCode(charCode++);
                        colorMap.set(c, char);
                        palette[char] = c;
                    }
                    rowStr += colorMap.get(c);
                });
                pixStrings.push(rowStr);
            });

            // Make sure corners are NOT transparent - we initialized with white.
            // User requirement: "Always have all pixels filled". 
            // Our logic fills with white initially, so unless we add erase tool, it's solid.

            // Use the SkinDef interface
            const newSkin: SkinDef = {
                id,
                name: nameInput.value || 'Custom',
                width: GRID_SIZE,
                height: GRID_SIZE,
                palette,
                pixels: pixStrings
            };

            // Add to list
            SKINS.push(newSkin);
            
            // Generate canvas immediately
            newSkin.canvas = this.renderer.createSkinCanvas(newSkin);
            this.renderer.registerSkins([newSkin]);

            // Save to LocalStorage (simple array of custom skins)
            // Just saving one for now or appending? 
            // For this task, persisting in runtime memory and localstorage array is good.
            const existingCustomsStr = localStorage.getItem('agar_custom_skins');
            let customs = existingCustomsStr ? JSON.parse(existingCustomsStr) : [];
            customs.push(newSkin);
            localStorage.setItem('agar_custom_skins', JSON.stringify(customs));

            // Select it
            this.selectedSkin = newSkin;
            this.updateSkinUI();
            
            refreshGrid(); // Update the grid with new skin
            closeFn();
        });
        
        // Load custom skins on startup
        /* Moved to constructor 
        const existingCustomsStr = localStorage.getItem('agar_custom_skins');
        if (existingCustomsStr) {
             try {
                const customs: SkinDef[] = JSON.parse(existingCustomsStr);
                customs.forEach(c => {
                    // Avoid dups
                    if (!SKINS.find(s => s.id === c.id)) {
                        SKINS.push(c);
                        // Generate canvas? handled by updateSkinUI lazy load or manual loop
                        // Need access to renderer.
                    }
                });
             } catch(e) { console.error("Error loading custom skins", e); }
        }
        */
    }
}
