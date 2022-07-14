Hooks.on('renderChatMessage', (message, html, data) => {
	if (!game.user?.isGM && game.users.get(message.data.user).isGM) {
		const d20AttackRoll = getProperty(message.data.flags, "midi-qol.d20AttackRoll");
		if (d20AttackRoll) {
			const hitFlag = getProperty(message.data.flags, "midi-qol.isHit");
			const hitString = hitFlag === undefined ? "" : hitFlag ? 'hits' : "misses";
			html.find(".midi-qol-attack-roll .dice-total").text(`${hitString}`);
			html.find(".midi-qol-damage-roll").find(".dice-roll").replaceWith(`<span>Dice Rolled</span>`);
			html.find(".midi-qol-other-roll").find(".dice-roll").replaceWith(`<span>Dice Rolled</span>`);
			html.find(".midi-qol-bonus-roll").find(".dice-roll").replaceWith(`<span>Dice Rolled</span>`);  
		}
	}
});