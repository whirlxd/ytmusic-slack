const express = require("express");
const dotenv = require("dotenv");
const log = require("./utils/utils").log;
const sanitize = require("./utils/utils").sanitize;
const slack = require("./utils/utils").slack;
const setSlackStatus = require("./utils/utils").setSlackStatus;

dotenv.config();
const metrics = {
	updates: 0,
	clears: 0,
	errors: 0,
	lastUpdate: null,
	apiActiveTime: Date.now(),
	startTime: Date.now(),
};
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
let PRIVATE_KEY = process.env.PRIVATE_KEY;
const PORT = Number(process.env.PORT || 8788);
let TEMPLATE = process.env.TEMPLATE || "${title} :: ${artist}";
let MIN_UPDATE_MS = Number(process.env.MIN_UPDATE_SECONDS || 4) * 1000;
// the emojiname in :emojiname: format
// should be uploaded to your workspace
const PLATFORM_EMOJIS = {
	youtube: process.env.EMOJI_YOUTUBE,
	spotify: process.env.EMOJI_SPOTIFY,
	soundcloud: process.env.EMOJI_SOUNDCLOUD,
	default: ":musical_note:",
};
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

function requireAuth(req, res, next) {
	if (!PRIVATE_KEY) {
		return res
			.status(500)
			.json({ ok: false, error: "Make sure to set a private key" });
	}

	const token = req.query.token || req.body?.token;
	if (token !== PRIVATE_KEY) {
		return res.status(401).json({ ok: false, error: "Invalid or missing key" });
	}

	next();
}

app.get("/", (_req, res) => res.status(404).send("ok"));
app.get("/health", requireAuth, (_req, res) => {
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
app.post("/test", requireAuth, async (req, res) => {
	const text = sanitize(req.body?.text || "Test Track — Debugger");
	log("TEST set status:", text);
	const ok = await setSlackStatus({
		text,
		expiration: Math.floor(Date.now() / 1000) + 60,
	});
	if (ok) {
		metrics.updates++;
		metrics.lastUpdate = new Date().toISOString();
	} else {
		metrics.errors++;
	}
	res.status(ok ? 200 : 500).json({ ok, text });
});
app.post("/set", requireAuth, async (req, res) => {
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
	if (ok) {
		if (text) {
			metrics.updates++;
		} else {
			metrics.clears++;
		}
		metrics.lastUpdate = new Date().toISOString();
	} else {
		metrics.errors++;
	}
	res.status(ok ? 200 : 500).json({ ok, text });
});
app.get("/analytics", requireAuth, async (_req, res) => {
	const uptime = Date.now() - metrics.startTime;
	res.json({
		...metrics,
		uptime,
		uptimeFormatted: `${Math.floor(uptime / 1000)}s`,
	});
});

app.post("/config", requireAuth, async (req, res) => {
	try {
		const { privateKey, template, minUpdateSeconds } = req.body;

		if (privateKey !== undefined) {
			PRIVATE_KEY = privateKey;
		}
		if (template !== undefined) {
			TEMPLATE = template;
		}
		if (minUpdateSeconds !== undefined) {
			MIN_UPDATE_MS = Number(minUpdateSeconds) * 1000;
		}

		res.json({
			ok: true,
			config: {
				privateKey: PRIVATE_KEY ? "***set***" : null,
				template: TEMPLATE,
				minUpdateMs: MIN_UPDATE_MS,
			},
		});
	} catch (e) {
		metrics.errors++;
		res.status(500).json({ ok: false, error: String(e) });
	}
});

app.post("/now-playing", requireAuth, async (req, res) => {
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

		const { title, artist, state, platform } = payload || {};
		const now = Date.now();

		if (!title || state !== "playing") {
			if (state === "paused" && currentlySetByUs) {
				log("paused -- status active");
				return res.json({ ok: true, paused: true });
			}

			if (currentlySetByUs && now - lastSentAt > MIN_UPDATE_MS) {
				log("clearing status -- not playing");
				const ok = await setSlackStatus({ text: "" });
				if (ok) {
					metrics.clears++;
					metrics.lastUpdate = new Date().toISOString();
				} else {
					metrics.errors++;
				}
				currentlySetByUs = false;
				lastKey = "";
				lastSentAt = now;
			} else {
				log("not playing -- not clearing");
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

		// log(
		// 	"Updating Slack status →",
		// 	text,
		// 	platform ? `(platform: ${platform})` : "",
		// );
		// log(`Using platform emoji for: ${platform || "default"}`);
		const emoji = platform
			? PLATFORM_EMOJIS[platform]
			: PLATFORM_EMOJIS.default;

		const ok = await setSlackStatus({
			text,
			platform,
			emoji,
		});
		if (ok) {
			currentlySetByUs = true;
			lastKey = key;
			lastSentAt = now;
			metrics.updates++;
			metrics.lastUpdate = new Date().toISOString();
			return res.json({ ok: true, status: text, platform });
		}
		metrics.errors++;
		return res.status(500).json({ ok: false, error: "Slack set failed" });
	} catch (e) {
		console.error("[LOG] exception:", e);
		metrics.errors++;
		res.status(500).json({ ok: false, error: String(e) });
	}
});
app.get("/now-playing", requireAuth, (_req, res) => {
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
	if (!PRIVATE_KEY) {
		console.error("[LOG] Missing PRIVATE_KEY in .env");
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
		-log(`Server on http://localhost:${PORT}`);
		-log("Auth info:", authInfo);
		metrics.apiActiveTime = Date.now();
	});
}
start();
