const express = require("express");
const dotenv = require("dotenv");
const log = require("./utils/utils").log;
const sanitize = require("./utils/utils").sanitize;
const slack = require("./utils/utils").slack;
const setSlackStatus = require("./utils/utils").setSlackStatus;

dotenv.config();
const app = express();
app.use(express.json({ limit: "64kb" }));
app.use(
	express.text({
		type: ["text/*", "application/x-www-form-urlencoded"],
		limit: "64kb",
	}),
);
// logger
app.use((req, res, next) => {
	const start = Date.now();
	res.on("finish", () => {
		const ms = Date.now() - start;
		console.log(`[HTTP] ${req.method} ${req.url} ${res.statusCode} ${ms}ms`);
	});
	next();
});

// userscript cors
app.use((req, res, next) => {
	const origin = req.headers.origin || "*";
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
	res.setHeader(
		"Access-Control-Allow-Headers",
		"Origin,X-Requested-With,Content-Type,Accept,Authorization",
	);
	res.setHeader("Access-Control-Allow-Credentials", "true");
	// chrome
	res.setHeader("Access-Control-Allow-Private-Network", "true");
	if (req.method === "OPTIONS") {
		return res.sendStatus(200);
	}
	next();
});

const SLACK_USER_TOKEN = process.env.SLACK_USER_TOKEN || "";
const PORT = Number(process.env.PORT || 8788);
const EMOJI = process.env.EMOJI || ":musical_note:";
const TEMPLATE = process.env.TEMPLATE || "${title} — ${artist}";
const MIN_UPDATE_MS = Number(process.env.MIN_UPDATE_SECONDS || 4) * 1000;
// -> debug
// const BOOT_STATUS_TEXT =
// 	process.env.BOOT_STATUS_TEXT || "Using YTM Slack extension";
// const BOOT_STATUS_EXPIRE_SECONDS = Number(
// 	process.env.BOOT_STATUS_EXPIRE_SECONDS || 180,
// );

let lastKey = "";
let lastSentAt = 0;
let currentlySetByUs = false;
let authInfo = null;

app.get("/", (_req, res) => res.status(404).send("ok"));
app.get("/health", (_req, res) => {
	res.json({
		ok: true,
		port: PORT,
		template: TEMPLATE,
		minUpdateMs: MIN_UPDATE_MS,
		lastKey,
		lastSentAt,
		currentlySetByUs,
		authInfo,
	});
});

// Manual setters
app.post("/test", async (req, res) => {
	const text = sanitize(req.body?.text || "Test Track — Debugger");
	log("TEST set status:", text);
	const ok = await setSlackStatus({
		text,
		expiration: Math.floor(Date.now() / 1000) + 60,
	});
	res.status(ok ? 200 : 500).json({ ok, text });
});
app.post("/set", async (req, res) => {
	let body = req.body;
	if (typeof body === "string") {
		try {
			body = JSON.parse(body);
		} catch {
			body = { text: body };
		}
	}
	const text = sanitize(body?.text || "");
	const ok = await setSlackStatus({ text });
	res.status(ok ? 200 : 500).json({ ok, text });
});

app.post("/now-playing", async (req, res) => {
	try {
		let payload = req.body;
		if (typeof payload === "string") {
			try {
				payload = JSON.parse(payload);
			} catch {
				payload = {};
			}
		}
		log("now-playing payload:", payload, "ip:", req.ip);

		const { title, artist, state } = payload || {};
		const now = Date.now();

		if (!title || state !== "playing") {
			if (currentlySetByUs && now - lastSentAt > MIN_UPDATE_MS) {
				log("Clearing Slack status because not playing");
				await setSlackStatus({ text: "" });
				currentlySetByUs = false;
				lastKey = "";
				lastSentAt = now;
			} else {
				log("Not playing → nothing to clear (throttled or not ours).");
			}
			return res.json({ ok: true, cleared: true });
		}
		const t = sanitize(title);
		const a = sanitize(artist);
		const text = sanitize(
			TEMPLATE.replace("${title}", t || "Unknown Track").replace(
				"${artist}",
				a || "Unknown Artist",
			),
		);
		const key = `playing|${text}`;

		if (key === lastKey && now - lastSentAt < MIN_UPDATE_MS) {
			log("Skip update (dedupe/throttle). key:", key);
			return res.json({ ok: true, skipped: "dedupe/throttle", text });
		}
		log("Updating Slack status →", text);
		const ok = await setSlackStatus({ text });
		if (ok) {
			currentlySetByUs = true;
			lastKey = key;
			lastSentAt = now;
			return res.json({ ok: true, status: text });
		}
		return res.status(500).json({ ok: false, error: "Slack set failed" });
	} catch (e) {
		console.error("[LOG] exception:", e);
		res.status(500).json({ ok: false, error: String(e) });
	}
});
app.get("/now-playing", (_req, res) => {
	if (lastKey && currentlySetByUs) {
		const text = lastKey.replace(/^playing\|/, "");
		res.json({
			ok: true,
			status: text,
			lastSentAt,
			currentlySetByUs,
		});
	} else {
		res.json({
			ok: true,
			status: null,
			lastSentAt,
			currentlySetByUs,
		});
	}
});
async function start() {
	if (!SLACK_USER_TOKEN) {
		console.error("[LOG] Missing SLACK_USER_TOKEN in .env");
		process.exit(1);
	}
	log("Token type:", SLACK_USER_TOKEN.slice(0, 4), "expected xoxp");

	try {
		const data = await slack("auth.test", {});
		authInfo = data.ok
			? { user: data.user, team: data.team }
			: { error: data.error };
	} catch (e) {
		authInfo = { error: String(e) };
	}

	app.listen(PORT, async () => {
		log(`Server on http://localhost:${PORT}`);
		log("Auth info:", authInfo);
	});
}
start();
