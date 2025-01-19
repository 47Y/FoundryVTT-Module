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

		console.time("Tile Shuffle");
		const startTime = performance.now();

		// Pre-sort tiles into elevation groups and filter locked tiles in one pass
		const tilesByElevation = scene.tiles.reduce((acc, tile) => {
			if (tile.locked) return acc;
			const elev = tile.elevation;
			if (!acc.has(elev)) acc.set(elev, []);
			acc.get(elev).push(tile);
			return acc;
		}, new Map());

		// Count total tiles being processed
		const totalTiles = Array.from(tilesByElevation.values()).reduce((sum, tiles) => sum + tiles.length, 0);
		if (totalTiles === 0) return;

		const changes = [];
		
		// Get and handle base tiles (elevation 0)
		const baseTiles = tilesByElevation.get(0) || [];
		if (!baseTiles.length) return;

		// Get base locations using grid centers
		const baseLocations = baseTiles.map(tile => {
			const center = canvas.grid.getCenterPoint(tile.x, tile.y);
			return [center.x, center.y];
		});

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

			changes.push(...tilesAtElev.map(tile => {
				// Find closest base location using grid distance
				let shortestDistance = Infinity;
				let closestBase = baseLocations[0];
				const tileCenter = canvas.grid.getCenterPoint(tile.x, tile.y);

				for (const basePos of baseLocations) {
					const distance = canvas.grid.measureDistance(
						{ x: basePos[0], y: basePos[1] },
						tileCenter
					);
					if (distance < shortestDistance) {
						shortestDistance = distance;
						closestBase = basePos;
					}
				}

				// Calculate offset from closest base
				const offset = [tile.x - closestBase[0], tile.y - closestBase[1]];

				// Pick random new base location
				const newBase = baseLocations[Math.floor(Math.random() * baseLocations.length)];

				return {
					_id: tile.id,
					x: newBase[0] + offset[0],
					y: newBase[1] + offset[1]
				};
			}));
		}

		await scene.updateEmbeddedDocuments("Tile", changes);

		const endTime = performance.now();
		const totalTime = endTime - startTime;
		const timePerTile = totalTime / totalTiles;

		console.timeEnd("Tile Shuffle");
		console.log(
			`Shuffled ${totalTiles} tiles in ${totalTime.toFixed(2)}ms ` +
			`(${timePerTile.toFixed(2)}ms per tile)`
		);
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
		const elevation = centerTile.document.elevation;
		const isLocked = centerTile.document.locked;

		// Pre-filter tiles by elevation for better performance
		const tilesByElevation = canvas.scene.tiles.reduce((acc, t) => {
			const elev = t.elevation;
			if (!acc.has(elev)) acc.set(elev, []);
			acc.get(elev).push(t);
			return acc;
		}, new Map());

		// Find tiles to lock/unlock
		const tilesToUpdate = new Set([centerTile.document]);

		// Get tiles at same elevation using grid's adjacency test
		const baseTiles = tilesByElevation.get(elevation) || [];
		baseTiles.forEach((tile) => {
			// Use built-in hex grid adjacency test
			if (canvas.grid.testAdjacency(centerTile.document, tile.document)) {
				tilesToUpdate.add(tile);
			}
		});

		// Handle overhead tiles if requested
		if (includeOverhead) {
			const baseTileArray = [...tilesToUpdate];
			
			// Process each elevation level above the base
			for (const [elev, tiles] of tilesByElevation) {
				if (elev <= elevation) continue;

				tiles.forEach((tile) => {
					// Check if tile is within one hex of any base tile
					for (const baseTile of baseTileArray) {
						// Use grid's built-in distance calculation
						const baseCenter = canvas.grid.getCenterPoint(baseTile.x, baseTile.y);
						const tileCenter = canvas.grid.getCenterPoint(tile.x, tile.y);
						const hexes = canvas.grid.measureDistance(baseCenter, tileCenter);
						
						if (hexes <= 0.5) {
							tilesToUpdate.add(tile);
							break;
						}
					}
				});
			}
		}

		// Create and apply updates
		const updates = [...tilesToUpdate].map((tile) => ({
			_id: tile.id,
			locked: !isLocked
		}));

		await canvas.scene.updateEmbeddedDocuments("Tile", updates);
		ui.notifications.info(`${isLocked ? "Unlocked" : "Locked"} ${updates.length} tiles in hex group.`);
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
