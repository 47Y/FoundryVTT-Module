class TileShuffler {
	static init() {
		game.settings.register("tile-shuffler", "showButton", {
			name: "Show Shuffle Button",
			hint: "Shows a button in the scene controls to shuffle tiles",
			scope: "world",
			config: true,
			type: Boolean,
			default: true
		});
	}

	static ready() {
		if (game.settings.get("tile-shuffler", "showButton")) {
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
				onClick: () => this.toggleLockSelectedHexGroup()
			});
		}
	}

	static async shuffleTiles() {
		const scene = canvas.scene;
		if (!scene) return;

		const baseTiles = [];
		const baseLocations = [];
		const overheadTiles = [];
		const changes = [];
		const allTiles = scene.tiles;

		// Store all unlocked tiles and their locations
		const tileMap = new Map(); // For quick tile lookups
		allTiles.forEach((tile) => {
			if (tile.locked) return;
			if (tile.elevation > 0) {
				let underTile = tileMap.get(this.getClosestTileId(tile, allTiles));
				if (underTile) {
					let offset = [tile.x - underTile.x, tile.y - underTile.y];
					overheadTiles.push({ tile, offset });
				}
				return;
			}
			baseLocations.push([tile.x, tile.y]);
			baseTiles.push(tile);
			tileMap.set(tile.id, tile);
		});

		// Fisher-Yates shuffle for base locations
		for (let i = baseLocations.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[baseLocations[i], baseLocations[j]] = [baseLocations[j], baseLocations[i]];
		}

		// First update base tiles
		const baseUpdates = baseTiles.map((tile, index) => ({
			_id: tile.id,
			x: baseLocations[index][0],
			y: baseLocations[index][1]
		}));

		// Randomly assign overhead tiles to new base positions
		const overheadUpdates = overheadTiles.map(({ tile, offset }) => {
			const randomBaseIndex = Math.floor(Math.random() * baseUpdates.length);
			const newBase = baseUpdates[randomBaseIndex];
			return {
				_id: tile.id,
				x: newBase.x + offset[0],
				y: newBase.y + offset[1]
			};
		});

		// Combine all updates
		changes.push(...baseUpdates, ...overheadUpdates);

		await scene.updateEmbeddedDocuments("Tile", changes);
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

		allTiles.forEach((otherTile) => {
			if (tile === otherTile) return;
			const distance = Math.hypot(tile.x - otherTile.x, tile.y - otherTile.y);
			if (distance < shortestDistance) {
				shortestDistance = distance;
				closestTile = otherTile;
			}
		});
		return closestTile;
	}

	static async toggleLockSelectedHexGroup() {
		const controlled = canvas.tiles.controlled;
		if (controlled.length !== 1) {
			ui.notifications.warn("Please select exactly one tile to lock as a hex group.");
			return;
		}

		// Create dialog content
		const content = `
			<form>
				<div class="form-group">
					<label>Include overhead tiles?</label>
					<div class="form-fields">
						<input type="checkbox" name="includeOverhead" checked/>
					</div>
				</div>
			</form>
		`;

		// Show dialog
		const dialog = new Dialog({
			title: "Lock Hex Group Options",
			content: content,
			buttons: {
				confirm: {
					icon: '<i class="fas fa-check"></i>',
					label: "Confirm",
					callback: (html) => this.executeLockToggle(controlled[0], html.find('[name="includeOverhead"]').is(":checked"))
				},
				cancel: {
					icon: '<i class="fas fa-times"></i>',
					label: "Cancel"
				}
			},
			default: "confirm"
		});
		
		dialog.render(true);
	}

	static async executeLockToggle(centerTile, includeOverhead) {
		const size = centerTile.document.width;
		const elevation = centerTile.document.elevation;
		const isLocked = centerTile.document.locked;

		// Get all tiles at same elevation
		const tilesAtElevation = canvas.scene.tiles.filter((t) => t.elevation === elevation);

		// Calculate circle distance of size*√3/2 (hex grid spacing)
		const hexSpacing = (size * Math.sqrt(3)) / 2;

		// Find tiles to lock/unlock
		const tilesToUpdate = new Set([centerTile.document]);

		const nearbyTiles = tilesAtElevation.filter((t) => {
			const distance = Math.hypot(centerTile.x - t.x, centerTile.y - t.y);
			return distance < hexSpacing;
		});

		// Add base level tiles
		nearbyTiles.forEach(tile => tilesToUpdate.add(tile));

		// Find and add overlapping tiles at higher elevations if requested
		if (includeOverhead) {
			const allTiles = canvas.scene.tiles;
			const baseTiles = [...tilesToUpdate];

			baseTiles.forEach(baseTile => {
				const overlappingTiles = allTiles.filter(t => {
					if (t.elevation <= baseTile.elevation) return false;
					
					// Check if tiles overlap
					const overlap = Math.hypot(t.x - baseTile.x, t.y - baseTile.y) < hexSpacing / 2;
					
					return overlap;
				});
				
				overlappingTiles.forEach(tile => tilesToUpdate.add(tile));
			});
		}

		// Update all found tiles to locked/unlocked state
		const updates = [...tilesToUpdate].map((tile) => ({
			_id: tile.id,
			locked: !isLocked
		}));

		await canvas.scene.updateEmbeddedDocuments("Tile", updates);
		ui.notifications.info(`${isLocked ? 'Unlocked' : 'Locked'} ${updates.length} tiles in hex group.`);
	}
}

Hooks.once("init", () => {
	TileShuffler.init();
});

Hooks.once("ready", () => {
	TileShuffler.ready();
});

Hooks.on("getSceneControlButtons", (controls) => {
	if (!game.user.isGM) return;
	const tileControls = controls.find((c) => c.name === "tiles");
	if (tileControls) TileShuffler.addSceneControls(tileControls);
});
