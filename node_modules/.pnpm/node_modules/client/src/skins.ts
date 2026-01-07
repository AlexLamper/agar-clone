export interface SkinDef {
    id: string;
    name: string;
    // Pixel Art Data
    width: number;
    height: number;
    palette: { [key: string]: string };
    loading?: boolean; // Internal use
    canvas?: HTMLCanvasElement; // Cached render
    pixels: string[]; // Rows of keys
}

export const SKINS: SkinDef[] = [
    { 
        id: 'none', 
        name: 'No Skin', 
        width: 0, 
        height: 0, 
        palette: {}, 
        pixels: [] 
    },
    { 
        id: 'virus', 
        name: 'Virus', 
        width: 8, 
        height: 8,
        palette: {
            'g': '#33FF33', // Green
            'd': '#22AA22', // Dark Green
            'f': '#22AA22', // Fix for missing palette entry
            '.': 'transparent'
        },
        pixels: [
            '..d..d..',
            '.dgggfd.',
            'dggggggd',
            '.gggggg.',
            '.gggggg.',
            'dggggggd',
            '.dgggfd.',
            '..d..d..'
        ]
    },
    { 
        id: 'coin', 
        name: 'Coin',
        width: 8, 
        height: 8,
        palette: {
            'y': '#FFD700', // Gold
            'o': '#DAA520', // Dark Goldenrod
            '.': 'transparent'
        },
        pixels: [
            '..oooo..',
            '.oyyyyo.',
            'oyyyyyyo',
            'oyyyyyyo',
            'oyyyyyyo',
            'oyyyyyyo',
            '.oyyyyo.',
            '..oooo..'
        ]
    }
];
