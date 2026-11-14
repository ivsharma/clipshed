const { app, BrowserWindow, Menu, Notification, dialog, session, shell } = require("electron");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const APP_ID = "com.clipshed.app";
const isDev = !app.isPackaged;
const localAppData =
  process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || app.getPath("home"), "AppData", "Local");
const appHome = path.join(localAppData, isDev ? "Clipshed Dev" : "Clipshed");
const dataDir = path.join(appHome, "data");
const binDir = path.join(appHome, "bin");
const resourcesDir = isDev ? path.join(__dirname, "..") : process.resourcesPath;
const bundledBinDir = path.join(resourcesDir, "bin");
const serverBundle = isDev
  ? path.join(__dirname, "build", "server.cjs")
  : path.join(process.resourcesPath, "server", "server.cjs");
const webDist = isDev
  ? path.join(__dirname, "..", "web", "dist")
  : path.join(process.resourcesPath, "web", "dist");
const iconPath = isDev
  ? path.join(__dirname, "resources", "icon.ico")
  : path.join(process.resourcesPath, "icon.ico");

const userDataDir = path.join(appHome, "electron");
fs.mkdirSync(userDataDir, { recursive: true });

app.setName("Clipshed");
app.setPath("userData", userDataDir);
app.setAppUserModelId(APP_ID);

let mainWindow = null;
let localServer = null;
let quitting = false;

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.on("window-all-closed", () => {
    app.quit();
  });

  app.on("activate", () => {
    if (!mainWindow && localServer) {
      createWindow(`http://${localServer.host}:${localServer.port}`);
    }
  });

  app.on("before-quit", (event) => {
    if (quitting || !localServer) return;
    event.preventDefault();
    quitting = true;

    const forceExit = setTimeout(() => app.exit(0), 5000);
    forceExit.unref();

    Promise.resolve(localServer.close())
      .catch((error) => console.error("Server shutdown failed.", error))
      .finally(() => {
        clearTimeout(forceExit);
        app.quit();
      });
  });

  app
    .whenReady()
    .then(bootstrap)
    .catch((error) => {
      console.error("Clipshed failed to start.", error);
      dialog.showErrorBox(
        "Clipshed could not start",
        error instanceof Error ? (error.stack ?? error.message) : String(error),
      );
      app.quit();
    });
}

async function bootstrap() {
  await fsp.mkdir(appHome, { recursive: true });
  await stageManagedBinaries();

  localServer = await startServer();
  Menu.setApplicationMenu(null);
  registerDownloads();
  createWindow(`http://${localServer.host}:${localServer.port}`);
}

async function stageManagedBinaries() {
  await fsp.mkdir(binDir, { recursive: true });

  const ytdlpSource = path.join(bundledBinDir, "yt-dlp.exe");
  const ytdlpDestination = path.join(binDir, "yt-dlp.exe");
  if (!fs.existsSync(ytdlpDestination) && fs.existsSync(ytdlpSource)) {
    await fsp.copyFile(ytdlpSource, ytdlpDestination);
  }

  // Older builds staged every binary here. ffmpeg, ffprobe, and QuickJS are
  // read-only resources now; only yt-dlp needs a managed, writable copy.
  for (const name of ["ffmpeg.exe", "ffprobe.exe", "qjs.exe"]) {
    await fsp.rm(path.join(binDir, name), { force: true }).catch(() => undefined);
  }
}

async function startServer() {
  process.env.CLIPSHED_ROOT = appHome;
  process.env.DATA_DIR = dataDir;
  process.env.BIN_DIR = binDir;
  process.env.FFMPEG_DIR = bundledBinDir;
  process.env.QJS_PATH = path.join(bundledBinDir, "qjs.exe");
  process.env.WEB_DIST = webDist;
  process.env.CLIPSHED_VERSION = app.getVersion();
  process.env.NODE_ENV = "production";

  const { startLocalServer } = require(serverBundle);
  if (typeof startLocalServer !== "function") {
    throw new Error("The local server bundle is missing its startLocalServer export.");
  }

  return startLocalServer({ host: "127.0.0.1", port: 0 });
}

function createWindow(origin) {
  const allowedOrigin = new URL(origin).origin;
  const window = new BrowserWindow({
    width: 1320,
    height: 920,
    minWidth: 900,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#f1eee6",
    title: "Clipshed",
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow = window;

  window.once("ready-to-show", () => window.show());
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    try {
      if (new URL(url).origin === allowedOrigin) return;
    } catch {
      // Treat malformed URLs as external.
    }
    event.preventDefault();
    if (/^https?:/i.test(url)) void shell.openExternal(url);
  });

  if (isDev) {
    window.webContents.on("before-input-event", (event, input) => {
      if (input.type === "keyDown" && input.key === "F12") {
        event.preventDefault();
        window.webContents.toggleDevTools();
      }
    });
  }

  void window.loadURL(origin);
}

function registerDownloads() {
  session.defaultSession.on("will-download", (_event, item) => {
    const filename = path.basename(item.getFilename());
    const savePath = uniqueDownloadPath(filename);
    item.setSavePath(savePath);

    item.once("done", (_doneEvent, state) => {
      if (state !== "completed") return;

      if (Notification.isSupported()) {
        const notification = new Notification({
          title: "Clipshed",
          body: `${filename} saved to Downloads`,
          icon: fs.existsSync(iconPath) ? iconPath : undefined,
        });
        notification.on("click", () => shell.showItemInFolder(savePath));
        notification.show();
      }
    });
  });
}

function uniqueDownloadPath(filename) {
  const downloads = app.getPath("downloads");
  const parsed = path.parse(filename);
  let candidate = path.join(downloads, filename);
  let index = 1;

  while (fs.existsSync(candidate)) {
    candidate = path.join(downloads, `${parsed.name} (${index})${parsed.ext}`);
    index += 1;
  }

  return candidate;
}
