import { app, nativeTheme } from "electron";
import { TrayManager } from "./managers/tray";
import { ModalWatcher } from "./managers/modal";
import { Browser } from "./managers/browser";
import { getConfig } from "./managers/store";
import { checkAppDependency } from "./utils/checkAppDependency";

import { init as initSentry } from "./managers/sentry";
import { init as initAutoLaunch } from "./managers/launch";
import { init as initAutoUpdater } from "./managers/updater";
import { init as initITunes } from "./managers/bridge";
import { init as initTheme } from "./utils/theme";

import * as log from "electron-log";

export let trayManager: TrayManager;
export let modalWatcher: ModalWatcher;
export let appDependencies: AppDependencies;

Object.assign(console, log.functions);

if (!app.requestSingleInstanceLock()) app.quit();

initSentry();

app.on("ready", async () => {
    trayManager = new TrayManager();
    modalWatcher = new ModalWatcher();
    appDependencies = await checkAppDependency();

    initTheme();
    initAutoLaunch();
    initAutoUpdater();

    if (appDependencies.music && appDependencies.discord) initITunes();
    else Browser.windowAction("show");

    nativeTheme.on("updated", () => {
        log.info(
            `[Backend] Theme changed to ${
                nativeTheme.shouldUseDarkColors ? "dark" : "light"
            }`
        );

        if (getConfig("colorTheme") === "os") {
            Browser.send("update-system-theme", false, {
                theme: nativeTheme.shouldUseDarkColors ? "dark" : "light"
            });
        }
    });
});
