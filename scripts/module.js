class TileShuffler {
    static init() {
        game.settings.register('tile-shuffler', 'showButton', {
            name: 'Show Shuffle Button',
            hint: 'Shows a button in the scene controls to shuffle tiles',
            scope: 'world',
            config: true,
            type: Boolean,
            default: true
        });
    }

    static ready() {
        if (game.settings.get('tile-shuffler', 'showButton')) {
            this.addSceneControls();
        }
    }

    static addSceneControls(tileControls) {
        if (tileControls) {
            tileControls.tools.push({
                name: "shuffle",
                title: "Shuffle Tiles",
                icon: "fas fa-random",
                button: true,
                onClick: () => this.shuffleTiles()
            });
            
            // Add new lock hex group button
            tileControls.tools.push({
                name: "lockHexGroup",
                title: "Lock Hex Group",
                icon: "fas fa-lock",
                button: true,
                onClick: () => this.lockSelectedHexGroup()
            });
        }
    }

    static async shuffleTiles() {
        const scene = canvas.scene;
        if (!scene) return;

        const tiles = [];
        const locations = [];
        const overheadTiles = [];
        const changes = [];
        const allTiles = scene.tiles;

        // Store all unlocked tiles and their locations
        const tileMap = new Map(); // For quick tile lookups
        allTiles.forEach(tile => {
            if (tile.locked) return;
            if (tile.elevation > 0) {
                let underTile = tileMap.get(this.getClosestTileId(tile, allTiles));
                if (underTile) {
                    let offset = [tile.x - underTile.x, tile.y - underTile.y];
                    overheadTiles.push({tile, offset});
                }
                return;
            }
            locations.push([tile.x, tile.y]);
            tiles.push(tile);
            tileMap.set(tile.id, tile);
        });

        // Fisher-Yates shuffle for locations
        for (let i = locations.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [locations[i], locations[j]] = [locations[j], locations[i]];
        }

        // Prepare all changes at once
        changes.push(...overheadTiles.map((overheadTile, index) => ({
            _id: overheadTile.tile.id,
            x: locations[index][0] + overheadTile.offset[0],
            y: locations[index][1] + overheadTile.offset[1]
        })));

        // Add regular tile changes
        changes.push(...tiles.map((tile, index) => ({
            _id: tile.id,
            x: locations[index + overheadTiles.length][0],
            y: locations[index + overheadTiles.length][1]
        })));

        await scene.updateEmbeddedDocuments('Tile', changes);
    }

    static getClosestTileId(tile, allTiles) {
        let shortestDistance = Infinity;
        let closestTileId = null;
        
        for (const otherTile of allTiles) {
            if (tile === otherTile || otherTile.elevation > 0) continue;
            const distance = Math.hypot(tile.x - otherTile.x, tile.y - otherTile.y);
            if (distance < shortestDistance) {
                shortestDistance = distance;
                closestTileId = otherTile.id;
            }
        }
        return closestTileId;
    }

    static getTileUnderneath(tile) {
        let shortestDistance = Infinity;
        let closestTile = null;
        const allTiles = canvas.scene.tiles;

        allTiles.forEach(otherTile => {
            if (tile === otherTile) return;
            const distance = Math.hypot(tile.x - otherTile.x, tile.y - otherTile.y);
            if (distance < shortestDistance) {
                shortestDistance = distance;
                closestTile = otherTile;
            }
        });
        return closestTile;
    }

    static async lockSelectedHexGroup() {
        const controlled = canvas.tiles.controlled;
        if (controlled.length !== 1) {
            ui.notifications.warn("Please select exactly one tile to lock as a hex group.");
            return;
        }

        const centerTile = controlled[0];
        const size = centerTile.width; // Assuming hexes are regular (width = height)
        const elevation = centerTile.elevation;
        
        // Get all tiles at same elevation
        const tilesAtElevation = canvas.scene.tiles.filter(t => t.elevation === elevation);
        
        // Calculate hex centers at distance of size*√3/2 (hex grid spacing)
        const hexSpacing = size * Math.sqrt(3) / 2;
        const adjacentPositions = [
            [0, -size],           // North
            [hexSpacing, -size/2], // Northeast
            [hexSpacing, size/2],  // Southeast
            [0, size],            // South
            [-hexSpacing, size/2], // Southwest
            [-hexSpacing, -size/2] // Northwest
        ];

        // Find tiles to lock
        const tilesToLock = [centerTile];
        const centerX = centerTile.x + size/2;
        const centerY = centerTile.y + size/2;

        for (const [offsetX, offsetY] of adjacentPositions) {
            const targetX = centerX + offsetX;
            const targetY = centerY + offsetY;
            
            // Find the closest tile to each hex position
            const nearbyTile = tilesAtElevation.find(t => {
                const tileCenter = {
                    x: t.x + t.width/2,
                    y: t.y + t.height/2
                };
                const distance = Math.hypot(tileCenter.x - targetX, tileCenter.y - targetY);
                return distance < size/3; // Tolerance for slight misalignment
            });

            if (nearbyTile) tilesToLock.push(nearbyTile);
        }

        // Update all found tiles to locked state
        const updates = tilesToLock.map(tile => ({
            _id: tile.id,
            locked: true
        }));

        await canvas.scene.updateEmbeddedDocuments('Tile', updates);
        ui.notifications.info(`Locked ${updates.length} tiles in hex group.`);
    }
}

Hooks.once('init', () => {
    TileShuffler.init();
});

Hooks.once('ready', () => {
    TileShuffler.ready();
});

Hooks.on('getSceneControlButtons', (controls) => {
    if (!game.user.isGM) return;
    const tileControls = controls.find(c => c.name === "tiles");
    if (tileControls) TileShuffler.addSceneControls(tileControls);
});
