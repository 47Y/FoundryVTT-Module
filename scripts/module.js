import { io } from "https://cdn.socket.io/4.4.1/socket.io.esm.min.js";
let socket;

Hooks.once('init', async function() {
    game.settings.register("sloth-overlay", "socket-link", {
        name: "Socket Link",
        hint: "Link to socket location",
        scope: "world",
        config: true,
        type: String,
        default: '',
    });
});

Hooks.once('ready', async function() {
	socket = io(game.settings.get('sloth-overlay', 'socket-link'));
	socket.connect(() => {})
	socket.on("connect_error", (err) => {
		console.log(`connect_error due to ${err.message}`);
	});
	
	socket.on('get_data', id => {
		let actor = game.actors.get(id);
		if (!actor) return;
		let data = actor.data.data;

		socket.emit('name_update', id, actor.data.name.startsWith('?') ? '???' : actor.data.name);
		socket.emit('race_update', id, data.details.race);
		socket.emit('image_update', id, actor.img.split('/')[3]);

		socket.emit('ac_update', id, data.attributes.ac.value);
		socket.emit('ability_update', id, data.abilities);
		actor.effects.forEach(effect => {
			if (effect.data.label == 'Mage Armor') socket.emit('ac_color', id, 3);
			if (effect.data.label == 'Shield of Faith') socket.emit('ac_color', id, 2);
			if (effect.data.label == 'Shield') socket.emit('ac_color', id, 1);
		})
		socket.emit('class_update', id, actor.getFlag('sloth-overlay', 'classes') || {}, actor.getFlag('sloth-overlay', 'subclasses') || {});
		socket.emit('mia_update', id, actor.getFlag('sloth-overlay', 'mia') || false);
		
	});
});

Hooks.on("updateActor", (actor, change, options, userId) => {
	if (change?.data?.attributes?.ac || change?.data?.spells) {
		const newAC = actor.data.data.attributes.ac.value;
		socket.emit('ac_update', actor.id, newAC);
	}
	if (change?.data?.abilities) {
		socket.emit('ability_update', actor.id, change.data.abilities);
	}
	if (change?.img) socket.emit('image_update', actor.id, actor.img.split('/')[3]);
	if (change?.data?.details?.race) socket.emit('race_update', actor.id, change.data.details.race);
	if (change?.name) socket.emit('name_update', actor.id, change.name);
});

Hooks.on("deleteActiveEffect", (effect, change) => {
	let actor = effect.parent;
	effect?.data?.changes.forEach(c => {
		if (c.key.startsWith('data.attributes.ac')) {
			socket.emit('ac_update', actor.id, actor.data.data.attributes.ac.value);
			if (effect.data.label == 'Mage Armor') socket.emit('ac_color_remove', actor.id, 3);
			if (effect.data.label == 'Shield of Faith') socket.emit('ac_color_remove', actor.id, 2);
			if (effect.data.label == 'Shield') socket.emit('ac_color_remove', actor.id, 1);
		}
	});
});

Hooks.on("createActiveEffect", (effect, change) => {
	let actor = effect.parent;
	effect?.data?.changes.forEach(c => {
		if (c.key.startsWith('data.attributes.ac')) {
			socket.emit('ac_update', actor.id, actor.data.data.attributes.ac.value);
			if (effect.data.label == 'Mage Armor') socket.emit('ac_color', actor.id, 3);
			if (effect.data.label == 'Shield of Faith') socket.emit('ac_color', actor.id, 2);
			if (effect.data.label == 'Shield') socket.emit('ac_color', actor.id, 1);
		}
	});
});

Hooks.on("updateActiveEffect", (effect, change) => {
	let actor = effect.parent;
	effect?.data?.changes.forEach(c => {
		if (c.key.startsWith('data.attributes.ac')) {
			socket.emit('ac_update', actor.id, actor.data.data.attributes.ac.value);
		}
	});
});

Hooks.on("updateMIA", (actor, change) => {
	socket.emit('mia_update', actor.id, change);
});



Hooks.on('updateClasses', (actor, classes, subclasses) => {
	socket.emit('class_update', actor.id, classes, subclasses);
});