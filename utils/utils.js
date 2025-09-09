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
	log("→ Slack", method, JSON.stringify(body));
	const resp = await fetch(url, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${SLACK_USER_TOKEN}`,
			"Content-Type": "application/json; charset=utf-8",
		},
		body: JSON.stringify(body),
	});
	const data = await resp.json();
	log("← Slack", method, "ok:", data.ok, data.error || "");
	return data;
}
export async function setSlackStatus({
	text,
	emoji = process.env.EMOJI,
	expiration = 0,
}) {
	const profile = {
		status_text: text || "",
		status_emoji: text ? emoji : "",
		status_expiration: expiration || 0,
	};
	const data = await slack("users.profile.set", { profile });
	return data.ok;
}
