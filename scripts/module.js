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

		// Pre-sort tiles into elevation groups and filter locked tiles in one pass
		const tilesByElevation = scene.tiles.reduce((acc, tile) => {
			if (tile.locked) return acc;
			const elev = tile.elevation;
			if (!acc.has(elev)) acc.set(elev, []);
			acc.get(elev).push(tile);
			return acc;
		}, new Map());

		const changes = [];
		
		// Get and handle base tiles (elevation 0)
		const baseTiles = tilesByElevation.get(0) || [];
		if (!baseTiles.length) return; // Exit early if no base tiles

		// Create base locations array and spatial index in one pass
		const baseLocations = baseTiles.map(tile => [tile.x, tile.y]);
		const baseTileGrid = new Map(baseTiles.map(tile => [`${tile.x},${tile.y}`, tile]));

		// Fisher-Yates shuffle
		for (let i = baseLocations.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[baseLocations[i], baseLocations[j]] = [baseLocations[j], baseLocations[i]];
		}

		// Update base tiles
		changes.push(...baseTiles.map((tile, index) => ({
			_id: tile.id,
			x: baseLocations[index][0],
			y: baseLocations[index][1]
		})));

		// Handle overhead tiles by elevation level
		for (const [elev, tilesAtElev] of tilesByElevation) {
			if (elev === 0) continue;

			// Process all tiles at this elevation in one map operation
			changes.push(...tilesAtElev.map(tile => {
				// Find closest base tile using grid coordinates
				const [closestBasePos, offset] = this.findClosestBaseAndOffset(tile, baseTileGrid);
				
				// Pick random new base location
				const [baseX, baseY] = baseLocations[Math.floor(Math.random() * baseLocations.length)];
				
				return {
					_id: tile.id,
					x: baseX + offset[0],
					y: baseY + offset[1]
				};
			}));
		}

		await scene.updateEmbeddedDocuments("Tile", changes);
	}

	// Helper function to find closest base tile and offset
	static findClosestBaseAndOffset(tile, baseTileGrid) {
		let shortestDistance = Infinity;
		let closestBasePos = null;

		for (const pos of baseTileGrid.keys()) {
			const [baseX, baseY] = pos.split(',').map(Number);
			const distance = Math.hypot(tile.x - baseX, tile.y - baseY);
			if (distance < shortestDistance) {
				shortestDistance = distance;
				closestBasePos = [baseX, baseY];
			}
		}

		const offset = closestBasePos ? [
			tile.x - closestBasePos[0],
			tile.y - closestBasePos[1]
		] : [0, 0];

		return [closestBasePos, offset];
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
		const hexSpacing = (size * Math.sqrt(3)) / 1.9;

		// Pre-filter tiles by elevation for better performance
		const tilesByElevation = canvas.scene.tiles.reduce((acc, t) => {
			const elev = t.elevation;
			if (!acc.has(elev)) acc.set(elev, []);
			acc.get(elev).push(t);
			return acc;
		}, new Map());

		// Find tiles to lock/unlock
		const tilesToUpdate = new Set([centerTile.document]);
		
		// Get tiles at same elevation
		const baseTiles = tilesByElevation.get(elevation) || [];
		baseTiles.forEach(tile => {
			if (Math.hypot(centerTile.x - tile.x, centerTile.y - tile.y) < hexSpacing) {
				tilesToUpdate.add(tile);
			}
		});

		// Handle overhead tiles if requested
		if (includeOverhead) {
			const baseTileArray = [...tilesToUpdate];
			const basePositions = new Map(
				baseTileArray.map(tile => [`${tile.x},${tile.y}`, tile])
			);

			// Process each elevation level above the base
			for (const [elev, tiles] of tilesByElevation) {
				if (elev <= elevation) continue;
				
				tiles.forEach(tile => {
					// Check against all base positions at once
					for (const [pos] of basePositions) {
						const [baseX, baseY] = pos.split(',').map(Number);
						if (Math.hypot(tile.x - baseX, tile.y - baseY) < hexSpacing / 2) {
							tilesToUpdate.add(tile);
							break; // Exit once we find a match
						}
					}
				});
			}
		}

		// Create and apply updates
		const updates = [...tilesToUpdate].map(tile => ({
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
