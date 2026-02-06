# @openclaw/redbooknote

OpenClaw plugin for Xiaohongshu (RedBook) automation via Playwright.

## Features

- **Automated Posting**: Post image/text notes with title, body, and images.
- **Interaction**: Like notes and comment on notes.
- **Login Handling**: Supports QR code login and persistent session management.
- **Headless Mode**: Configurable headless browser execution.
- **Anti-Detection**: Built-in measures to bypass bot detection.

## Install (local checkout)

```bash
openclaw plugins install ./extensions/redbooknote
```

## Install (npm)

```bash
openclaw plugins install @openclaw/redbooknote
```

## Config

Configure the plugin in your `openclaw.json` or via the Control UI.

```json5
{
  channels: {
    redbooknote: {
      enabled: true,
      headless: true, // Set to false to see the browser in action
    },
  },
  plugins: {
    entries: {
      redbooknote: {
        enabled: true,
        config: {
          enabled: true,
          headless: true,
        },
      },
    },
  },
}
```

### Options

| Option     | Type    | Default | Description                                                          |
| ---------- | ------- | ------- | -------------------------------------------------------------------- |
| `enabled`  | boolean | `true`  | Enable or disable the extension.                                     |
| `headless` | boolean | `true`  | Run browser in headless mode (hidden). Set to `false` for debugging. |

## Usage

This plugin exposes the following tools to the Agent:

- **`redbook_post_note`**: Post a new note.
  - `title`: Note title.
  - `body`: Note content.
  - `images`: Array of image file paths.
- **`redbook_like_note`**: Like a specific note.
  - `noteId`: The ID of the note to like.

## Login

On first run, if not logged in:

1. The plugin will navigate to the login page.
2. It will save a QR code image to `redbook-login-qr.png` (in non-headless mode, scan directly).
3. Scan the QR code with your Xiaohongshu mobile app.
4. The session will be saved locally for future runs.

## Requirements

- Node.js 18+
- Playwright (automatically installed via postinstall)
