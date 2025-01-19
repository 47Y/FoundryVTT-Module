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

    static addSceneControls() {
        const tileControls = game.controls.controls.find(c => c.name === "tiles");
        if (tileControls) {
            tileControls.tools.push({
                name: "shuffle",
                title: "Shuffle Tiles",
                icon: "fas fa-random",
                button: true,
                onClick: () => this.shuffleTiles()
            });
            game.controls.render();
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
        allTiles.forEach(tile => {
            if (tile.locked) return;
            if (tile.elevation > 0) {
                let underTile = this.getTileUnderneath(tile);
                let offset = [tile.x - underTile.x, tile.y - underTile.y];
                overheadTiles.push({tile, offset});
                return;
            }
            locations.push([tile.x, tile.y]);
            tiles.push(tile);
        });

        // Handle overhead tiles first
        while (overheadTiles.length > 0) {
            const randomLocationIndex = Math.floor(Math.random() * locations.length);
            const randomLocation = locations[randomLocationIndex];
            let overheadTile = overheadTiles.pop();
            changes.push({
                _id: overheadTile.tile.id, 
                x: randomLocation[0] + overheadTile.offset[0], 
                y: randomLocation[1] + overheadTile.offset[1]
            });
        }

        // Handle regular tiles
        while (tiles.length > 0) {
            const randomTileIndex = Math.floor(Math.random() * tiles.length);
            const randomLocationIndex = Math.floor(Math.random() * locations.length);
            const randomTile = tiles[randomTileIndex];
            const randomLocation = locations[randomLocationIndex];

            changes.push({
                _id: randomTile.id, 
                x: randomLocation[0], 
                y: randomLocation[1]
            });

            tiles.splice(randomTileIndex, 1);
            locations.splice(randomLocationIndex, 1);
        }

        await scene.updateEmbeddedDocuments('Tile', changes);
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
