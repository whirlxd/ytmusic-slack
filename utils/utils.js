export function log(...args) {
	console.log("[LOG]", ...args);
}
export function sanitize(str, max = 150) {
	if (!str) return "";
	const s = String(str).replace(/\s+/g, " ").trim();
	return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
export async function slack(
	method,
	body,
	SLACK_USER_TOKEN = process.env.SLACK_USER_TOKEN,
) {
	const url = `https://slack.com/api/${method}`;
	// log("→ Slack", method, JSON.stringify(body));
	const resp = await fetch(url, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${SLACK_USER_TOKEN}`,
			"Content-Type": "application/json; charset=utf-8",
		},
		body: JSON.stringify(body),
	});
	const data = await resp.json();
	// log("← Slack", method, "ok:", data.ok, data.error || "");
	return data;
}
export async function setSlackStatus({
	text,
	emoji = process.env.EMOJI,
	platform = null,
	expiration = 0,
}) {
	let statusEmoji = emoji;

	// log("setSlackStatus - platform:", platform);
	// log("Available emojis:", {
	// 	default: process.env.EMOJI,
	// 	youtube: process.env.EMOJI_YOUTUBE,
	// 	spotify: process.env.EMOJI_SPOTIFY,
	// 	soundcloud: process.env.EMOJI_SOUNDCLOUD,
	// });

	if (platform) {
		if (platform === "youtube") {
			statusEmoji = process.env.EMOJI_YOUTUBE || "▶️";
		} else if (platform === "spotify") {
			statusEmoji = process.env.EMOJI_SPOTIFY || "🎧";
		} else if (platform === "soundcloud") {
			statusEmoji = process.env.EMOJI_SOUNDCLOUD || "☁️";
		} else {
			statusEmoji = process.env.EMOJI || "🎵";
		}
		// log("Selected emoji for", platform, ":", statusEmoji);
	}

	const profile = {
		status_text: text || "",
		status_emoji: text ? statusEmoji : "",
		status_expiration: expiration || 0,
	};

	// log("Sending to Slack - profile:", {
	// 	status_text: profile.status_text,
	// 	status_emoji: profile.status_emoji,
	// 	status_expiration: profile.status_expiration,
	// });

	const data = await slack("users.profile.set", { profile });
	return data.ok;
}
