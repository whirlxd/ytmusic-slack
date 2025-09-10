// ==UserScript==
// @name         Music Slack Status
// @namespace    whirl.music.slack
// @version      1.0
// @description  Updates Slack status with currently playing track from YouTube Music, Spotify, SoundCloud
// @match        https://music.youtube.com/*
// @match        https://open.spotify.com/*
// @match        https://soundcloud.com/*
// @grant        none
// @run-at       document-idle
// @connect      localhost
// ==/UserScript==

(() => {
	const BASE = "http://localhost:8787";
	const ENDPOINT = `${BASE}/now-playing`;
	const HEALTH = `${BASE}/health`;
	const SET = `${BASE}/set`;
	const INTERVAL_MS = 2000;
	const PRIVATE_KEY = "devkey";
	const DEV_MODE = true; // ctrl shift z to toggle

	let prevKey = "";
	let statusCleared = false;
	// const log = (...a) => console.log("[music→slack]", ...a);
	function stripZeroWidth(s) {
		// biome-ignore lint/suspicious/noMisleadingCharacterClass: <explanation>
		return s.replace(/[\u200B-\u200D\u2060\uFEFF]/g, "");
	}
	function stripSCLabels(s) {
		return s.replace(/^\s*(current\s*track|now\s*playing)\s*:\s*/i, "");
	}
	function collapseExactDouble(s) {
		const t = s.trim();
		const n = t.length;
		if (n >= 6 && n % 2 === 0) {
			const half = n / 2;
			const a = t.slice(0, half);
			const b = t.slice(half);
			if (a === b) return a.trim();
		}
		return s;
	}
	function cleanText(text) {
		if (!text) return "";
		let result = stripZeroWidth(String(text));
		result = stripSCLabels(result);

		result = result.replace(/\s+/g, " ").trim();
		result = result
			.replace(/\s+•\s+.*$/, "")
			.replace(/\s+\d+[KM]?\s+views?$/i, "")
			.replace(/\s+-\s+YouTube Music$/i, "")
			.replace(/^YouTube Music\s+/i, "")
			.replace(/By:\s*.*$/i, "")
			.replace(/\s+on SoundCloud$/i, "");

		result = collapseExactDouble(result);

		if (result.length > 80) result = `${result.slice(0, 77)}...`;
		return result;
	}
	function getPlatform() {
		const host = location.hostname;
		if (host.includes("music.youtube.com")) return "youtube";
		if (host.includes("spotify.com")) return "spotify";
		if (host.includes("soundcloud.com")) return "soundcloud";
		return "unknown";
	}

	function readMediaSession() {
		const md = navigator.mediaSession?.metadata;
		if (!md) return null;
		return {
			title: cleanText(md.title || ""),
			artist: cleanText(md.artist || ""),
			state: navigator.mediaSession?.playbackState || "unknown",
		};
	}
	function readYouTubeMusic() {
		const bar = document.querySelector("ytmusic-player-bar");
		if (!bar) return null;
		const title = bar.querySelector(".title")?.textContent;
		const artist = bar.querySelector(".byline")?.textContent;
		if (!title || !artist) return null;
		const media = document.querySelector("video,audio");
		return {
			title: cleanText(title),
			artist: cleanText(artist),
			state: media && !media.paused ? "playing" : "paused",
		};
	}
	function readSpotify() {
		const titleEl = document.querySelector(
			'[data-testid="now-playing-widget"] [data-testid="context-item-link"]',
		);
		const artistEl = document.querySelector(
			'[data-testid="now-playing-widget"] span[data-testid="context-item-info-subtitles"]',
		);
		if (!titleEl || !artistEl) return null;
		const playBtn = document.querySelector(
			'[data-testid="control-button-playpause"]',
		);
		const playing = playBtn
			?.getAttribute("aria-label")
			?.toLowerCase()
			.includes("pause");
		return {
			title: cleanText(titleEl.textContent),
			artist: cleanText(artistEl.textContent),
			state: playing ? "playing" : "paused",
		};
	}
	function readSoundCloud() {
		const titleEl = document.querySelector(".playbackSoundBadge__titleLink");
		const artistEl = document.querySelector(".playbackSoundBadge__lightLink");
		if (!titleEl || !artistEl) return null;

		const rawTitle =
			titleEl.getAttribute("title") ||
			titleEl.getAttribute("aria-label") ||
			titleEl.textContent ||
			"";
		const rawArtist =
			artistEl.getAttribute("title") ||
			artistEl.getAttribute("aria-label") ||
			artistEl.textContent ||
			"";

		const playing = document
			.querySelector(".playControl")
			?.classList.contains("playing");

		return {
			title: cleanText(rawTitle),
			artist: cleanText(rawArtist),
			state: playing ? "playing" : "paused",
		};
	}
	function getCurrentTrack() {
		const platform = getPlatform();
		let track =
			platform === "youtube"
				? readYouTubeMusic()
				: platform === "spotify"
					? readSpotify()
					: platform === "soundcloud"
						? readSoundCloud()
						: null;

		if ((!track || !track.title || !track.artist) && platform !== "unknown") {
			const ms = readMediaSession();
			if (ms?.title && ms.artist) {
				track = {
					...ms,
					state: platform === "spotify" ? "playing" : ms.state || "unknown",
				};
			}
		}
		if (track) track.platform = platform;
		return track;
	}

	async function postJSON(url, obj) {
		try {
			const res = await fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ ...obj, token: PRIVATE_KEY }),
			});
			return { status: res.status, text: await res.text() };
		} catch (e) {
			return { error: String(e) };
		}
	}
	async function clearStatus() {
		if (statusCleared) return;
		statusCleared = true;
		await postJSON(SET, { text: "" });
	}

	// dev mode
	function initOverlay() {
		if (!DEV_MODE) return;
		if (document.getElementById("music-slack-debug")) return;

		const box = document.createElement("div");
		box.id = "music-slack-debug";
		box.style.cssText = `
      position: fixed; top: 10px; right: 10px; z-index: 99999;
      background: rgba(0,0,0,0.9); color: #fff; padding: 10px 10px 8px;
      border-radius: 8px; font: 12px monospace; width: 290px; line-height: 1.35;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    `;

		const header = document.createElement("div");
		header.style.cssText =
			"display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;";
		const title = document.createElement("div");
		title.textContent = "Music -> Slack Dev";
		title.style.cssText = "font-weight:700;";
		const dot = document.createElement("span");
		dot.style.cssText =
			"display:inline-block;width:8px;height:8px;border-radius:50%;background:#666;margin-left:8px;";
		const headLeft = document.createElement("div");
		headLeft.style.cssText = "display:flex;align-items:center;gap:6px;";
		headLeft.appendChild(title);
		headLeft.appendChild(dot);

		const hint = document.createElement("button");
		hint.textContent = "toggle";
		hint.title = "Ctrl+Shift+M";
		hint.style.cssText =
			"background:#1f6feb;color:#fff;border:none;padding:2px 6px;border-radius:4px;cursor:pointer;font-size:11px;";
		header.appendChild(headLeft);
		header.appendChild(hint);

		const status = document.createElement("div");
		status.id = "status-display";
		status.textContent = "Starting...";

		const btns = document.createElement("div");
		btns.style.cssText = "margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;";

		function button(label, fn) {
			const b = document.createElement("button");
			b.textContent = label;
			b.style.cssText =
				"background:#30363d;color:#fff;border:1px solid #3d444d;padding:3px 8px;border-radius:4px;cursor:pointer;font-size:11px;";
			b.onclick = fn;
			return b;
		}

		btns.appendChild(button("Test", () => postJSON(SET, { text: "🎧 Test" })));
		btns.appendChild(button("Clear", () => postJSON(SET, { text: "" })));
		btns.appendChild(
			button("Debug", () => {
				const t = getCurrentTrack();
				status.textContent = t
					? `platform: ${t.platform}\n${JSON.stringify(t, null, 2)}`
					: "no track";
			}),
		);
		btns.appendChild(
			button("Force Send", () => {
				const t = getCurrentTrack();
				if (t) {
					prevKey = "";
					postJSON(ENDPOINT, t);
				}
			}),
		);

		box.appendChild(header);
		box.appendChild(status);
		box.appendChild(btns);
		document.body.appendChild(box);

		(async () => {
			try {
				const r = await fetch(
					`${HEALTH}?token=${encodeURIComponent(PRIVATE_KEY)}`,
				);
				dot.style.background = r.ok ? "#2ea043" : "#f85149";
			} catch {
				dot.style.background = "#f85149";
			}
		})();

		// live status
		setInterval(() => {
			const t = getCurrentTrack();
			status.textContent =
				t && t.state === "playing"
					? `♪ ${t.title} - ${t.artist} [${t.platform}]`
					: `No music playing [${getPlatform()}]`;
		}, 1000);

		function toggleBox() {
			box.style.display = box.style.display === "none" ? "block" : "none";
		}
		hint.onclick = toggleBox;
		window.addEventListener("keydown", (e) => {
			if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "z") toggleBox();
		});
	}
	async function tick() {
		const track = getCurrentTrack();
		if (!track || track.state !== "playing") return;

		statusCleared = false;
		const key = `${track.state}|${track.title}|${track.artist}|${track.platform}`;
		if (key === prevKey) return;
		prevKey = key;

		await postJSON(ENDPOINT, track);
	}

	function setupCleanup() {
		window.addEventListener("beforeunload", clearStatus);
		window.addEventListener("unload", clearStatus);
	}

	async function boot() {
		try {
			await fetch(`${HEALTH}?token=${encodeURIComponent(PRIVATE_KEY)}`);
		} catch {}
		setupCleanup();
		initOverlay();
		await postJSON(SET, { text: "Music extension activated" });
		setInterval(tick, INTERVAL_MS);
	}

	if (["complete", "interactive"].includes(document.readyState)) boot();
	else window.addEventListener("DOMContentLoaded", boot, { once: true });
})();
