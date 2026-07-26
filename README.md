# proton-drive-sync

Syncs a local folder to Proton Drive using the `proton-drive` CLI. The folder is
mirrored to a folder of the same name in the root of your Proton Drive
(`/my-files/<folder-name>`).

## Setup

1. Make sure the `proton-drive` CLI is installed and you're logged in:
   ```
   proton-drive auth login
   ```
2. Install dependencies and build:
   ```
   npm install
   npm run build
   ```
3. Copy the example config and edit it:
   ```
   cp config.example.json config.json
   ```

### config.json

| Field                | Type    | Default | Description                                                                 |
|----------------------|---------|---------|------------------------------------------------------------------------------|
| `localFolder`         | string  | —       | Path to the folder to sync (`~` is expanded).                               |
| `watch`               | boolean | `true`  | If `true`, keeps running and watches for changes. If `false`, syncs once.    |
| `pollIntervalSeconds`  | number  | `300`   | Interval for a full re-check in watch mode (safety net alongside the watcher). |
| `mirrorDeletes`        | boolean | `false` | If `true`, deleting a local file moves the remote copy to Proton Drive's trash. |

## Running

One-time sync:
```
npm start -- --once
```

Continuous sync (watches for local changes, plus a periodic full re-check):
```
npm start
```

## How it works

- Files are matched by size + modified time against a local state cache
  (`.sync-state/`) so unchanged files aren't re-uploaded.
- New local files/folders are uploaded/created remotely.
- Changed files are re-uploaded with the `replace` conflict strategy.
- If `mirrorDeletes` is enabled, files removed locally are moved to Proton
  Drive's trash (not permanently deleted).
- This is a one-way sync: local → Proton Drive. Changes made directly in
  Proton Drive are not pulled back down.
