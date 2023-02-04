import { io } from 'https://cdn.socket.io/4.4.1/socket.io.esm.min.js';
let socket;

Hooks.once('init', async function () {
	game.settings.register('sloth-overlay', 'socket-link', {
		name: 'Socket Link',
		hint: 'Link to socket location',
		scope: 'world',
		config: true,
		type: String,
		default: ''
	});
});

Hooks.once('ready', async function () {
	socket = io(game.settings.get('sloth-overlay', 'socket-link'));
	socket.connect(() => {});
	socket.on('connect_error', (err) => {
		console.log(`connect_error due to ${err.message}`);
	});

	socket.on('get_data', (id) => {
		let actor = game.actors.get(id);
		if (!actor) return;
		let data = actor.system;
		socket.emit('hp_update', id, data.attributes.hp.value + data.attributes.hp.temp, data.attributes.hp.max);
		socket.emit('ac_update', id, data.attributes.ac.value);
		socket.emit('ability_update', id, data.abilities);
		socket.emit('mia_update', id, actor.getFlag('sloth-overlay', 'mia') || false);
		let chatLog = new ChatLog().collection.contents;
		for (let i = chatLog.length - 20; i < chatLog.length; i++) {
			socket.emit('chat_message', chatLog[i], {});
		}
	});
});

Hooks.on('updateActor', (actor, change, options, userId) => {
	if (change?.data?.attributes?.hp) {
		const newHP = actor.system.attributes.hp.value + actor.system.attributes.hp.temp;
		socket.emit('hp_update', change._id, newHP, actor.system.attributes.hp.max);
	}
	if (change?.data?.attributes?.ac || change?.data?.spells) {
		const newAC = actor.system.attributes.ac.value;
		socket.emit('ac_update', change._id, newAC);
	}
	if (change?.data?.abilities) {
		socket.emit('ability_update', change._id, change.data.abilities);
	}
});

Hooks.on('updateMIA', (actor, change) => {
	socket.emit('mia_update', actor.id, change);
});

Hooks.on('createChatMessage', (message, data, user) => {
	if (game.user?.isGM) return;
	if (socket) socket.emit('chat_message', message, data);
});

Hooks.on('updateChatMessage', (message, data, diff, user) => {
	if (game.user?.isGM) return;
	if (socket) socket.emit('update_chat_message', message, data);
});

Hooks.on('deleteChatMessage', (message, data, user) => {
	if (game.user?.isGM) return;
	if (socket) socket.emit('delete_chat_message', message.id);
});
