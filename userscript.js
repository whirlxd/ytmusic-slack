// ==UserScript==
// @name         YTM Slack Status
// @namespace    whirl.ytm.slack
// @version      0.1
// @description  Updates Slack status with currently playing YouTube Music track
// @match        https://music.youtube.com/*
// @grant        none
// @run-at       document-idle
// @connect      localhost
// ==/UserScript==
// use via Tampermonkey or sm

(() => {
	const ENDPOINT = "https://slackytm.whirlxd.dev/now-playing";
	const HEALTH = "https://slackytm.whirlxd.dev/health"; // istg im logging every req don't even think about spamming especially without the token.
	const TEST = "https://slackytm.whirlxd.dev/test";
	const SET = "https://slackytm.whirlxd.dev/set";
	const INTERVAL_MS = 2000;
	const DEV_MODE = true; // false to hide devUI
	const PRIVATE_KEY = "skibidi_toilet_0_808//"; // must match server's PRIVATE_KEY env var

	let prevKey = "";
	let firstPostDone = false;
	let tickCount = 0;
	const log = (...a) => console.log("[ytm→slack]", ...a);
	function overlayInit() {
		if (!DEV_MODE) return;
		if (document.getElementById("ytm-slack-debug")) return;
		const box = document.createElement("div");
		box.id = "ytm-slack-debug";
		box.style.cssText =
			"position:fixed;right:8px;bottom:8px;z-index:99999;font:12px/1.4 monospace;background:rgba(0,0,0,.85);color:#fff;padding:8px;border-radius:8px;max-width:420px;white-space:pre-wrap";
		const text = document.createElement("div");
		text.id = "ytm-slack-text";
		text.textContent = "ytm→slack booting…";
		const btns = document.createElement("div");
		btns.style.cssText = "margin-top:6px;display:flex;gap:6px;flex-wrap:wrap";
		const mk = (label, fn) => {
			const b = document.createElement("button");
			b.textContent = label;
			b.style.cssText =
				"background:#1f6feb;color:#fff;border:none;padding:4px 8px;border-radius:6px;cursor:pointer";
			b.onclick = (e) => {
				e.preventDefault();
				e.stopPropagation();
				fn();
			};
			return b;
		};
		btns.appendChild(
			mk("Ping /health", async () => {
				try {
					const r = await fetch(
						`${HEALTH}?token=${encodeURIComponent(PRIVATE_KEY)}`,
						{ cache: "no-store" },
					);
					overlay(`health ${r.status}: ${await r.text()}`);
				} catch (e) {
					overlay(`health ERR: ${String(e)}`);
				}
			}),
		);
		btns.appendChild(
			mk("Announce", () => postJSON(SET, { text: "extension activated" })),
		);
		btns.appendChild(
			mk("Test status", () => postJSON(TEST, { text: "🎧 YTM debug ping" })),
		);
		btns.appendChild(mk("Clear", () => postJSON(SET, { text: "" })));
		box.appendChild(text);
		box.appendChild(btns);
		document.body.appendChild(box);
	}
	function overlay(t) {
		if (!DEV_MODE) return;
		const el = document.getElementById("ytm-slack-text");
		if (el) el.textContent = String(t);
	}
	async function postJSON(url, obj) {
		const body = JSON.stringify({ ...obj, token: PRIVATE_KEY });
		try {
			const r = await fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body,
			});
			const txt = await r.text();
			log("POST", url, r.status, txt);
			overlay(
				`POST ${url} → ${r.status}\n${txt.slice(0, 220)}${txt.length > 220 ? "…" : ""}`,
			);
			return { status: r.status, text: txt };
		} catch (e) {
			log("POST ERR", url, e);
			overlay(`POST ERR ${url}\n${String(e)}`);
			try {
				const ok = navigator.sendBeacon(
					url,
					new Blob([body], { type: "application/json" }),
				);
				log("sendBeacon fallback", url, ok);
			} catch {}
			return { error: String(e) };
		}
	}
	const safe = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
	function readMedia() {
		try {
			const md = navigator.mediaSession?.metadata;
			const state = navigator.mediaSession?.playbackState || "unknown";
			if (!md) return null;
			const out = { title: md.title || "", artist: md.artist || "", state };
			log("mediaSession:", out);
			return out;
		} catch {
			return null;
		}
	}

	function readDOM() {
		const bar = document.querySelector("ytmusic-player-bar");
		if (!bar) return null;
		const titleEl =
			bar.querySelector("#song-title") || bar.querySelector(".title");
		const subtitleEl =
			bar.querySelector(".byline") || bar.querySelector(".subtitle");
		let state = "unknown";
		const media =
			document.querySelector("video") || document.querySelector("audio");
		state = media ? (media.paused ? "paused" : "playing") : state;
		return { title: safe(titleEl), artist: safe(subtitleEl), state };
	}

	async function tick() {
		tickCount++;
		const meta = readMedia() ||
			readDOM() || { title: "", artist: "", state: "unknown" };
		if (!meta.title) meta.state = "paused";
		const key = `${meta.state}|${meta.title}|${meta.artist}`;
		const force = !firstPostDone && meta.state === "playing" && !!meta.title;
		if (key === prevKey && !force) {
			overlay(`tick ${tickCount}\nno change\n${key}`);
			return;
		}
		prevKey = key;
		firstPostDone = true;

		overlay(`tick ${tickCount}\nposting\n${key}`);
		log("posting meta:", meta);
		await postJSON(ENDPOINT, meta);
	}

	async function announce() {
		log("announce: posting 'extension activated'");
		await postJSON(SET, { text: "extension activated" });
	}

	async function boot() {
		log("userscript boot");
		overlayInit();
		overlay("boot…");
		try {
			const r = await fetch(
				`${HEALTH}?token=${encodeURIComponent(PRIVATE_KEY)}`,
				{ cache: "no-store" },
			);
			overlay(`health ${r.status}`);
			log("health:", await r.text());
		} catch (e) {
			overlay(`health ERR: ${String(e)}`);
		}
		await announce();
		setInterval(tick, INTERVAL_MS);
	}

	if (
		document.readyState === "complete" ||
		document.readyState === "interactive"
	)
		boot();
	else window.addEventListener("DOMContentLoaded", boot, { once: true });
})();
