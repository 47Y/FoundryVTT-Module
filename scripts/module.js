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
});

Hooks.on("updateActor", (actor, change, options, userId) => {
	console.log(actor, change)
	if (change?.data?.attributes?.hp) {
		const newHP = actor.data.data.attributes.hp.value + actor.data.data.attributes.hp.temp;
		socket.emit('hp_update', change._id, newHP, actor.data.data.attributes.hp.max);
	}
	if (change?.data?.attributes?.ac) {
		const newAC = actor.data.data.attributes.ac.value;
		socket.emit('ac_update', change._id, newAC);
	}
	if (change?.data?.abilities) {
		socket.emit('ability_update', change._id, change.data.abilities);
	}
});

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
	socket.emit('class_update', id, actor.classes);
});