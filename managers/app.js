const {
        ipcMain,
        app,
        Menu,
        Notification,
        Tray,
        BrowserWindow,
        nativeTheme,
    } = require("electron"),
    Store = require("electron-store"),
    config = new Store({}),
    appData = new Store({ name: "data" }),
    path = require("path"),
    { autoUpdater } = require("electron-updater"),
    AutoLaunch = require("auto-launch"),
    fetch = require("fetch").fetchUrl,
    fs = require("fs"),
    log = require("electron-log"),
    { connect } = require("../managers/discord.js");

let langString = require(`../language/${config.get("language")}.json`);

app.dev = app.isPackaged ? false : true;
app.addLog = log.log;
console.log = app.addLog;

if (!config.get("hardwareAcceleration")) app.disableHardwareAcceleration();

app.on("ready", () => {
    console.log("[APP] Starting...");

    let tray = new Tray(path.join(app.getAppPath(), "assets/logo.png")),
        autoLaunch = new AutoLaunch({
            name: app.dev ? "AMRPC - DEV" : "AMRPC",
            path: app.getPath("exe"),
        }),
        cmenu = Menu.buildFromTemplate([
            {
                label: `${
                    app.dev ? "AMRPC - DEV" : "AMRPC"
                } V.${app.getVersion()}`,
                icon: path.join(app.getAppPath(), "assets/tray/logo@18.png"),
                enabled: false,
            },
            {
                label:
                    config.get("service") === "ame"
                        ? "Apple Music Electron"
                        : "iTunes",
                enabled: false,
            },
            { type: "separator" },
            {
                label: langString.tray.restart,
                click() {
                    app.restart();
                },
            },
            {
                label: langString.tray.checkForUpdates,
                click() {
                    app.checkForUpdates();
                },
            },
            { type: "separator" },
            {
                label: langString.tray.openSettings,
                click() {
                    app.mainWindow.show();
                },
            },
            { type: "separator" },
            {
                label: langString.tray.quit,
                click() {
                    (app.isQuiting = true), app.quit();
                },
            },
        ]);

    app.on("quit", () => tray.destroy());
    app.on("before-quit", function () {
        app.isQuiting = true;
    });

    tray.setToolTip(app.dev ? "AMRPC - DEV" : "AMRPC");
    tray.setContextMenu(cmenu);
    tray.on("right-click", () => tray.update());
    tray.on("click", () => app.mainWindow.show());

    if (config.get("autolaunch")) autoLaunch.enable();
    else autoLaunch.disable();

    app.mainWindow = new BrowserWindow({
        webPreferences: {
            preload: path.join(app.getAppPath(), "browser/preload.js"),
        },
        icon: path.join(app.getAppPath(), "assets/logo.png"),
        frame: false,
        resizable: false,
        devTools: app.dev,
    });

    app.mainWindow.loadFile(path.join(app.getAppPath(), "browser/index.html"));

    app.mainWindow.on("close", function (event) {
        if (!app.isQuiting) {
            event.preventDefault();
            app.mainWindow.hide();

            return false;
        }
    });

    autoUpdater.on("update-available", (info) => {
        console.log(`[UPDATER] Update available (${info.version})`);

        app.mainWindow.show();

        app.sendToMainWindow("new-update-available", {
            version: info.version,
        });
    });

    autoUpdater.on("update-not-available", (info) => {
        console.log("[UPDATER] No updates available");
    });

    autoUpdater.on("error", (err) => {
        console.log(`[UPDATER] Error in auto-updater. ${err}`);
    });

    autoUpdater.on("download-progress", (progressObj) => {
        if (
            progressObj.percent === 25 ||
            progressObj.percent === 50 ||
            progressObj.percent === 75 ||
            progressObj.percent === 100
        )
            console.log(
                `[UPDATER] Downloading update... (${progressObj.percent}%)`
            );

        app.sendToMainWindow("update-download-progress-update", {
            percent: progressObj.percent,
            transferred: progressObj.transferred,
            total: progressObj.total,
            speed: progressObj.bytesPerSecond,
        });
    });

    autoUpdater.on("update-downloaded", (info) => {
        console.log(`[UPDATER] Update downloaded (${info.version})`);

        app.mainWindow.show();
        app.sendToMainWindow("update-downloaded", {});
    
        if (appData.get("installUpdate")) autoUpdater.quitAndInstall();
    });

    ipcMain.handle("update-download", (e, install) => {
        if (install) appData.set("installUpdate", true);

        autoUpdater.downloadUpdate();
    });

    ipcMain.handle("update-install", (e) => {
        appData.delete("installUpdate");

        autoUpdater.quitAndInstall();
    });

    ipcMain.handle("autolaunch-change", (e, d) => {
        if (config.get("autolaunch")) autoLaunch.enable();
        else autoLaunch.disable();

        console.log(
            `[SETTINGS] Autolaunch is now ${
                config.get("autolaunch") ? "enabled" : "disabled"
            }`
        );
    });

    ipcMain.handle("appVersion", () => {
        return app.getVersion();
    });

    ipcMain.handle("isDeveloper", () => {
        return app.dev;
    });

    ipcMain.handle("getSystemTheme", () => {
        return nativeTheme.shouldUseDarkColors ? "dark" : "light";
    });

    ipcMain.handle("getConfig", (e, k) => {
        return config.get(k);
    });

    ipcMain.handle("getAppData", (e, k) => {
        return appData.get(k);
    });

    ipcMain.handle("updateLanguage", (e, language) => {
        console.log(`[Backend] Changed language to ${language}`);

        app.langString = require(`../language/${language}.json`);
    });

    ipcMain.handle("updateConfig", (e, k, v) => config.set(k, v));

    ipcMain.handle("updateAppData", (e, k, v) => appData.set(k, v));

    ipcMain.handle("windowControl", (e, action) => {
        if (action === "show") app.mainWindow.show();
        else if (action === "hide") app.mainWindow.hide();
        else if (action === "close") app.mainWindow.close();
        else if (action === "minimize") app.mainWindow.minimize();
        else if (action === "maximize") app.mainWindow.maximize();
        else if (action === "reload") app.mainWindow.reload();
    });

    ipcMain.handle("appControl", (e, action) => {
        if (action === "restart") app?.restart();
    });

    nativeTheme.on("updated", () => {
        console.log(
            `[Backend] Theme changed to ${
                nativeTheme.shouldUseDarkColors ? "dark" : "light"
            }`
        );

        if (config.get("colorTheme") === "os") {
            app.mainWindow.webContents.send("update-system-theme", {
                theme: nativeTheme.shouldUseDarkColors ? "dark" : "light",
            });
        }
    });

    app.mainWindow.hide();
    app.checkForUpdates();
    connect();

    setInterval(() => {
        app.checkForUpdates();
    }, 600e3);

    console.log("[APP] Ready");
});

app.checkForUpdates = () => {
    console.log("[UPDATER] Checking for Updates...");
    autoUpdater.checkForUpdatesAndNotify();
};

app.sendToMainWindow = (t, v) => {
    app.mainWindow.webContents.send(t, v);
};

app.showNotification = (title, body) => {
    new Notification({
        title: title,
        body: body,
        icon: path.join(app.getAppPath(), "assets/logo.png"),
    }).show();
};

app.restart = () => {
    app.relaunch();
    app.exit();
};

function isEqual(obj1, obj2) {
    const obj1Keys = Object.keys(obj1),
        obj2Keys = Object.keys(obj2);

    if (obj1Keys.length !== obj2Keys.length) return false;

    for (let objKey of obj1Keys) {
        if (obj1[objKey] !== obj2[objKey]) {
            if (
                typeof obj1[objKey] == "object" &&
                typeof obj2[objKey] == "object"
            ) {
                if (!isEqual(obj1[objKey], obj2[objKey])) return false;
            } else return false;
        }
    }

    return true;
}