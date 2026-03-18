# Electron Packaging for macOS

> Best practices and known pitfalls for packaging open-typeless as a macOS `.app`.

---

## Build Command

```bash
pnpm make
```

Output: `out/open-typeless-darwin-arm64/open-typeless.app`

Install: `cp -R out/open-typeless-darwin-arm64/open-typeless.app /Applications/`

---

## Known Pitfalls

### 1. EPIPE on stdout/stderr

**Problem**: Packaged app has no terminal. `electron-log` and `console.log` write to closed stdout, causing uncaught `Error: write EPIPE` that crashes the app.

**Fix**: Suppress at the very top of `main.ts`, before any imports that might log:

```typescript
process.stdout?.on?.('error', () => {});
process.stderr?.on?.('error', () => {});
```

### 2. Native Module Packaging

**Problem**: Vite bundles JS but native `.node` modules need special handling. They must be:
1. Listed in `vite.main.config.ts` `external` (so Vite doesn't try to bundle them)
2. Listed in `forge.config.ts` `nativeModules` (so they get copied into the package)

**Current native modules** (in `forge.config.ts`):

```typescript
const nativeModules = [
  'uiohook-napi',
  '@xitanggg/node-insert-text',
  '@xitanggg/node-insert-text-darwin-arm64',  // platform-specific binary
  'node-gyp-build',
];
```

**Rule**: When adding a new native dependency, add both the package AND its platform-specific binary to both lists.

### 3. Pure JS Modules Must NOT Be External

**Problem**: `ws` was in `vite.main.config.ts` `external` list. Vite skipped bundling it. At runtime, the packaged app couldn't find it because it's not a native module and wasn't copied.

**Fix**: Only truly native modules (containing `.node` files) should be in `external`. Pure JS modules like `ws`, `bonjour-service`, `dotenv` etc. should be bundled by Vite.

**Current external list** (in `vite.main.config.ts`):

```typescript
external: [
  'uiohook-napi',
  '@xitanggg/node-insert-text',
  'bufferutil',      // optional native accelerator for ws
  'utf-8-validate',  // optional native accelerator for ws
],
```

### 4. Login Item Requires Code Signing

**Problem**: `app.setLoginItemSettings({ openAtLogin: true })` fails with "Operation not permitted" on unsigned apps.

**Fix**: Wrap in try-catch:

```typescript
if (app.isPackaged) {
  try {
    app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });
  } catch {
    // Unsigned app — not permitted
  }
}
```

For production release, the app must be code-signed and notarized for Login Items to work.

### 5. macOS Permissions Are Per-App Identity

**Problem**: Accessibility and Input Monitoring permissions are granted to a specific app path. Permissions granted to the dev `Electron.app` do NOT carry over to the packaged `/Applications/open-typeless.app`.

**User impact**: After installing the packaged app, user must go to **System Settings → Privacy & Security → Accessibility** and **Input Monitoring** to grant permissions again.

**Future**: Build a first-launch onboarding window that guides the user through permission grants.

---

## Process Management Safety

**CRITICAL**: Never use broad `pkill` patterns that match directory names:

```bash
# WRONG — kills terminal sessions working in the project directory
pkill -f "open-typeless"

# CORRECT — only kills the packaged app
pkill -f "open-typeless.app/Contents/MacOS"

# CORRECT — only kills dev Electron
pkill -f "Electron.app/Contents/MacOS/Electron"
```

---

## Dev Mode vs Packaged Mode

| Aspect | Dev (`pnpm start`) | Packaged (`.app`) |
|--------|-------------------|-------------------|
| Launch | `node -e "api.start({ interactive: false })"` | Double-click or `open /Applications/open-typeless.app` |
| stdout | Terminal (visible) | Closed (EPIPE if not suppressed) |
| Logging | Terminal + electron-log file | electron-log file only |
| Native modules | From `node_modules/` | Copied to `app.asar/node_modules/` |
| Permissions | Inherited from Electron.app | Must be granted independently |
| Login Item | Skipped (`!app.isPackaged`) | Attempted (needs signing) |
| Vite HMR | Active | N/A (pre-built) |

---

## Testing Checklist After Packaging

- [ ] App launches without error dialogs
- [ ] Menu bar icon appears
- [ ] Right Option hotkey responds (may need permission grant)
- [ ] Network audio source receives UDP data
- [ ] mDNS discovery finds the board
- [ ] ASR transcription works (both standard and streaming)
- [ ] Text insertion works
- [ ] App quits cleanly via menu "退出"

---

## Files

| File | Role |
|------|------|
| `forge.config.ts` | Electron Forge config: native module copying, makers, plugins |
| `vite.main.config.ts` | Vite config for main process: external modules list |
| `src/main.ts` | EPIPE suppression, login item settings |
