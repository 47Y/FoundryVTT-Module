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
