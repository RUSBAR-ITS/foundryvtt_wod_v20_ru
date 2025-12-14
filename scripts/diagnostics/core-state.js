import { info, safe, classString, MOD_ID, isDebugEnabled } from "../logger/core.js";

export function dumpCoreState(phase) {
  info(`Core state (${phase})`, {
    foundry: {
      version: safe(() => game.version),
      release: safe(() => game.release)
    },
    system: {
      id: safe(() => game.system?.id),
      version: safe(() => game.system?.version),
      title: safe(() => game.system?.title)
    },
    world: {
      id: safe(() => game.world?.id),
      title: safe(() => game.world?.title)
    },
    user: {
      id: safe(() => game.user?.id),
      name: safe(() => game.user?.name),
      isGM: safe(() => game.user?.isGM)
    },
    i18n: {
      gameLang: safe(() => game.i18n?.lang),
      htmlLang: safe(() => document.documentElement?.lang),
      htmlClasses: safe(() => classString(document.documentElement))
    },
    module: {
      id: MOD_ID,
      active: safe(() => game.modules?.get(MOD_ID)?.active),
      version: safe(() => game.modules?.get(MOD_ID)?.version),
      styles: safe(() => game.modules?.get(MOD_ID)?.styles),
      esmodules: safe(() => game.modules?.get(MOD_ID)?.esmodules)
    },
    debugLogging: isDebugEnabled()
  });
}
