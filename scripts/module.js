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
		socket.emit('hp_update', id, data.attributes.hp.value + data.attributes.hp.temp, data.attributes.hp.max);
		socket.emit('ac_update', id, data.attributes.ac.value);
		socket.emit('ability_update', id, data.abilities);
		socket.emit('race_update', id, data.details.race);
		actor.effects.forEach(effect => {
			if (effect.data.label == 'Mage Armor') socket.emit('ac_color', id, 3);
			if (effect.data.label == 'Shield of Faith') socket.emit('ac_color', id, 2);
			if (effect.data.label == 'Shield') socket.emit('ac_color', id, 1);
		})
		let classes = actor.classes;
		Object.keys(classes).forEach(c => {
			classes[c].data.subclass = actor.classes[c].data.subclass;
		})
		socket.emit('class_update', id, classes);
	});
});

Hooks.on("updateActor", (actor, change, options, userId) => {
	if (change?.data?.attributes?.hp) {
		const newHP = actor.data.data.attributes.hp.value + actor.data.data.attributes.hp.temp;
		socket.emit('hp_update', change._id, newHP, actor.data.data.attributes.hp.max);
	}
	if (change?.data?.attributes?.ac || change?.data?.spells) {
		const newAC = actor.data.data.attributes.ac.value;
		socket.emit('ac_update', change._id, newAC);
	}
	if (change?.data?.abilities) {
		socket.emit('ability_update', change._id, change.data.abilities);
	}
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
	socket.emit('update_mia', actor, change);
});