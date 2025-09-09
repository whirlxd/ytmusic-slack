# YTM Slack Status API Documentation (AI GENERATED ENTIRELY - may contain errors)

## Overview

This API server bridges YouTube Music playback status with Slack user status. It provides endpoints for monitoring music playback, updating Slack status, and managing server configuration.

## Authentication

All endpoints (except `/`) require authentication via a private key that must match the `PRIVATE_KEY` environment variable.

### Authentication Methods:
- **GET requests**: Include token as URL parameter: `?token=your-private-key`
- **POST requests**: Include token in request body: `{"token": "your-private-key"}`

## Environment Variables

- `SLACK_USER_TOKEN` - Slack user token (required, format: xoxp-...)
- `PRIVATE_KEY` - Authentication token for API access (required)
- `PORT` - Server port (default: 8788)
- `TEMPLATE` - Status text template (default: "${title} :: ${artist}")
- `MIN_UPDATE_SECONDS` - Minimum seconds between updates (default: 4)

## Endpoints

### `GET /`
**Description**: Basic health check endpoint (no auth required)
**Response**: `404 "ok"`

---

### `GET /health?token=<private_key>`
**Description**: Server health and configuration status
**Authentication**: Required via URL parameter
**Response**:
```json
{
  "ok": true,
  "port": 8788,
  "template": "${title} :: ${artist}",
  "minUpdateMs": 4000,
  "lastKey": "playing|Song Title :: Artist Name",
  "lastSentAt": 1640995200000,
  "currentlySetByUs": true,
  "authInfo": {
    "user": "U1234567890",
    "team": "T1234567890"
  }
}
```

---

### `POST /test`
**Description**: Send a test status to Slack (expires in 60 seconds)
**Authentication**: Required in request body
**Request Body**:
```json
{
  "token": "your-private-key",
  "text": "Test Track — Debugger"
}
```
**Response**:
```json
{
  "ok": true,
  "text": "Test Track — Debugger"
}
```

---

### `POST /set`
**Description**: Manually set Slack status text
**Authentication**: Required in request body
**Request Body**:
```json
{
  "token": "your-private-key",
  "text": "Custom status message"
}
```
**Clear Status**:
```json
{
  "token": "your-private-key",
  "text": ""
}
```
**Response**:
```json
{
  "ok": true,
  "text": "Custom status message"
}
```

---

### `GET /analytics?token=<private_key>`
**Description**: Server metrics and usage statistics
**Authentication**: Required via URL parameter
**Response**:
```json
{
  "updates": 42,
  "clears": 5,
  "errors": 1,
  "lastUpdate": "2023-12-01T10:30:00.000Z",
  "apiActiveTime": 1640995200000,
  "startTime": 1640995000000,
  "uptime": 200000,
  "uptimeFormatted": "200s"
}
```

**Metrics Explanation**:
- `updates`: Number of successful status updates
- `clears`: Number of times status was cleared
- `errors`: Number of failed operations
- `lastUpdate`: ISO timestamp of last successful update
- `apiActiveTime`: Timestamp when server became active
- `startTime`: Server start timestamp
- `uptime`: Server uptime in milliseconds
- `uptimeFormatted`: Human-readable uptime

---

### `POST /config`
**Description**: Update server configuration at runtime
**Authentication**: Required in request body
**Request Body**:
```json
{
  "token": "your-private-key",
  "privateKey": "new-private-key",
  "template": "${title} by ${artist}",
  "minUpdateSeconds": 5
}
```
**Partial Updates** (any field is optional):
```json
{
  "token": "your-private-key",
  "template": "🎵 ${title}"
}
```
**Response**:
```json
{
  "ok": true,
  "config": {
    "privateKey": "***set***",
    "template": "🎵 ${title}",
    "minUpdateMs": 5000
  }
}
```

**Configuration Fields**:
- `privateKey`: New authentication token
- `template`: Status text template with `${title}` and `${artist}` placeholders
- `minUpdateSeconds`: Minimum delay between status updates

---

### `POST /now-playing`
**Description**: Update status based on current music playback (primary endpoint for userscript)
**Authentication**: Required in request body
**Request Body**:
```json
{
  "token": "your-private-key",
  "title": "Song Title",
  "artist": "Artist Name",
  "state": "playing"
}
```
**Response (Playing)**:
```json
{
  "ok": true,
  "status": "Song Title :: Artist Name"
}
```
**Response (Not Playing)**:
```json
{
  "ok": true,
  "cleared": true
}
```
**Response (Throttled)**:
```json
{
  "ok": true,
  "skipped": "dedupe/throttle",
  "text": "Song Title :: Artist Name"
}
```

**State Values**:
- `playing`: Currently playing music
- `paused`: Music is paused
- `unknown`: Playback state unknown

**Behavior**:
- Only updates Slack when `state` is "playing" and `title` is provided
- Automatically clears status when music stops playing
- Implements throttling to prevent excessive API calls
- Deduplicates identical status updates

---

### `GET /now-playing?token=<private_key>`
**Description**: Get current playing status
**Authentication**: Required via URL parameter
**Response (Currently Set)**:
```json
{
  "ok": true,
  "status": "Song Title :: Artist Name",
  "lastSentAt": 1640995200000,
  "currentlySetByUs": true
}
```
**Response (Not Set)**:
```json
{
  "ok": true,
  "status": null,
  "lastSentAt": 1640995200000,
  "currentlySetByUs": false
}
```

## Error Responses

### Authentication Errors
```json
{
  "ok": false,
  "error": "Invalid or missing key"
}
```

### Server Configuration Errors
```json
{
  "ok": false,
  "error": "Make sure to set a private key"
}
```

### Slack API Errors
```json
{
  "ok": false,
  "error": "Slack set failed"
}
```

## Usage Examples

### Using curl

**Health Check**:
```bash
curl "http://localhost:8788/health?token=your-private-key"
```

**Set Custom Status**:
```bash
curl -X POST http://localhost:8788/set \
  -H "Content-Type: application/json" \
  -d '{"token": "your-private-key", "text": "🎧 Listening to music"}'
```

**Update Configuration**:
```bash
curl -X POST http://localhost:8788/config \
  -H "Content-Type: application/json" \
  -d '{"token": "your-private-key", "template": "🎵 ${title} by ${artist}"}'
```

**View Analytics**:
```bash
curl "http://localhost:8788/analytics?token=your-private-key"
```

### Using JavaScript/Fetch

```javascript
// Update status
const response = await fetch('http://localhost:8788/now-playing', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    token: 'your-private-key',
    title: 'Song Title',
    artist: 'Artist Name',
    state: 'playing'
  })
});

const result = await response.json();
console.log(result);
```

## Rate Limiting & Throttling

- Minimum update interval is configurable via `MIN_UPDATE_SECONDS` (default: 4 seconds)
- Duplicate status updates are automatically deduplicated
- Status clears are throttled to prevent excessive API calls
- All operations track metrics for monitoring

## Security 

- Keep your `PRIVATE_KEY` secure and never expose it in client-side code
- The API is designed for localhost usage - ensure proper network security if exposed
- Slack user tokens have broad permissions - use dedicated tokens when possible