import 'dotenv/config';
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { setupAllIpcHandlers } from './main/ipc';
import { floatingWindow, settingsWindow } from './main/windows';
import { menuBarService, pushToTalkService, networkAudioSource, audioDiscovery } from './main/services';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// Setup IPC handlers before app is ready
setupAllIpcHandlers();

const createWindow = async () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Create the floating window (hidden initially)
  floatingWindow.create();
  settingsWindow.create();
  menuBarService.create();

  // Preload the floating renderer before enabling the hotkey path.
  await floatingWindow.waitUntilReady();

  // Initialize push-to-talk service after windows are created
  pushToTalkService.initialize();

  // Start network audio source and device discovery
  networkAudioSource.start();
  audioDiscovery.start();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
  // Enable auto-start on login (macOS: adds to Login Items)
  if (!app.isPackaged) {
    // Dev mode: skip login item (would register electron binary)
  } else {
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: true,
    });
  }

  void createWindow();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Cleanup function for graceful shutdown
function cleanup(): void {
  audioDiscovery.stop();
  networkAudioSource.stop();
  pushToTalkService.dispose();
  floatingWindow.destroy();
  settingsWindow.destroy();
  menuBarService.destroy();
}

// Clean up before quitting
app.on('before-quit', cleanup);

// Handle SIGINT (Ctrl+C) and SIGTERM for graceful shutdown
process.on('SIGINT', () => {
  cleanup();
  app.quit();
});

process.on('SIGTERM', () => {
  cleanup();
  app.quit();
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
