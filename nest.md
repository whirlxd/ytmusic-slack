# Hosting on Nest
> I have personally hosted this on [Nest](https://hackclub.app) for my own use. If you are a teenager you can too! I'v written a simple guide here.

## Prerequisites

* A Nest account.
* A subdomain you control. Example: `slackytm.whirlxd.dev`. (or you can use the default domain `YOUR_NEST_USERNAME.hackclub.app` but it looks ugly)

> I am going to use slackytm.whirlxd.dev as an example everywhere.

## 1) DNS: verify the domain

Pick one:

* Add **CNAME** `slackytm.whirlxd.dev` → `YOUR_NEST_USERNAME.hackclub.app`
* Or add a **TXT** record on `slackytm.whirlxd.dev` with value `domain-verification=whirlxd`

Wait a few minutes for DNS to propagate.

---

## 2) Copy app to Nest

```bash
ssh YOUR_NEST_USERNAME@hackclub.app
git clone https://github.com/whirlxd/ytmusic-slack.git
cd ytmusic-slack
npm i
```

Create `.env`:
```env
SLACK_USER_TOKEN=xoxp- your token here
PORT=8787
EMOJI=:youtube-music:
TEMPLATE=${title} :: ${artist}
MIN_UPDATE_SECONDS=4
PRIVATE_KEY= this acts as a password between userscript and server, 
```

---

## 3) Run as a user service

```bash
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/ytmslack.service <<'EOF'
[Unit]
Description=YT Music -> Slack Status

[Service]
WorkingDirectory=%h/ytmslack
ExecStart=/usr/bin/node server.js
Environment=NODE_ENV=production
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now ytmslack.service
journalctl --user -u ytmslack.service -f
```

---

## 4) Wire the domain with Caddy


```bash
nest caddy add slackytm.whirlxd.dev --proxy localhost:8787
systemctl --user restart caddy
```

Then:

```bash
caddy validate --config ~/Caddyfile
systemctl --user restart caddy
```

---

## 5) Test

```bash
curl -s https://slackytm.whirlxd.dev/health
curl -s -X POST https://slackytm.whirlxd.dev/test \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer make-a-long-random-string" \
  -d '{"text":"debug via nest"}'
```

You should see your Slack status change.

---

## 6) Point the userscript to prod + add auth

In your Tampermonkey script update the endpoints and the private key:

```javascript
	const ENDPOINT = "https://slackytm.whirlxd.dev/now-playing";
	const HEALTH = "https://slackytm.whirlxd.dev/health";
	const TEST = "https://slackytm.whirlxd.dev/test";
	const SET = "https://slackytm.whirlxd.dev/set";
    const PRIVATE_KEY = "ILIKEFEMBOYS (no this is not my real key)"; // must match server's PRIVATE_KEY env var
```
<p>That’s it! Play some music on YouTube Music and watch your Slack status update.</p>
---

## Notes

* Incase something goes wrong, check the logs: `journalctl --user -u ytmslack.service -f`
* If you change `.env`, restart the service: `systemctl --user restart ytmslack.service`
* If you use Cloudflare, set DNS-only for the love of god.


