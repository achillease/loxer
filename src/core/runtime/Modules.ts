import { isHidden, LogLevel, resolveThreshold } from './Levels.js';
import { is } from '../../Helpers.js';
import { Lox } from '../../loxes/Lox.js';
import { LoxerModules, LoxerOptions, Module } from '../../types.js';

interface ModulesProps {
  isDev: boolean;
  modules?: LoxerModules;
  moduleTextSlice?: number;
  defaultLevels?: LoxerOptions['defaultLevels'];
}

export type ExtendedModule = Module & { slicedName: string };

export class Modules {
  private readonly _isDev: boolean = false;
  private readonly _modules: LoxerModules = DEFAULT_MODULES;
  private readonly _moduleTextSlice: number = 8;

  constructor(props?: ModulesProps) {
    this._isDev = props?.isDev ?? true;
    // clone the built-ins, never write into them: DEFAULT_MODULES is module-scoped, so mutating it
    // would leak one init's `defaultLevels` into every later Loxer instance of the process
    const defaults: LoxerModules = {
      NONE: { ...DEFAULT_MODULES.NONE },
      DEFAULT: { ...DEFAULT_MODULES.DEFAULT },
      INVALID: { ...DEFAULT_MODULES.INVALID },
    };
    if (props?.defaultLevels) {
      defaults.NONE.devLevel = props.defaultLevels.devLevel;
      defaults.DEFAULT.devLevel = props.defaultLevels.devLevel;
      defaults.NONE.prodLevel = props.defaultLevels.prodLevel;
      defaults.DEFAULT.prodLevel = props.defaultLevels.prodLevel;
    }
    // merge modules
    this._modules = {
      ...defaults,
      ...props?.modules,
    };
    this._moduleTextSlice = props?.moduleTextSlice ?? 8;
  }

  ensureModule(moduleId: string): string {
    return this._modules[moduleId] === undefined ? 'INVALID' : moduleId;
  }

  /**
   * @internal the level of a specific module || undefined
   */
  getLevel(moduleId: string): LogLevel | undefined {
    const mod = this._modules[moduleId];
    const level = this._isDev ? mod?.devLevel : mod?.prodLevel;

    // a module that declares no threshold reports none, but one that names an unusable level
    // reports the level the gate falls back to - never a value outside `LogLevel`
    return level === undefined ? undefined : resolveThreshold(level, 'info');
  }

  /** @internal whether a log of `level` in `moduleId` sits past what that module logs up to.
   *
   * The one derivation of that answer, which {@link Modules.getModule} reads too: a caller that has
   * to know before it builds a log — to skip work the log would only discard — must get the same
   * answer the output gate later gives, not a second encoding of it.
   */
  isHiddenAt(level: LogLevel, moduleId: string): boolean {
    const mod = this._modules[moduleId] ?? this._modules.INVALID;
    // the `'info'` fallback keeps a JS consumer's malformed module logging instead of silently
    // muting it — a missing threshold, and an unusable one, both land there rather than at no gate
    const threshold = resolveThreshold(this._isDev ? mod.devLevel : mod.prodLevel, 'info');

    return isHidden(level, threshold);
  }

  getModule(lox: Lox): { loxModule: ExtendedModule; hidden: boolean } {
    let mod = this._modules[lox.moduleId];
    if (!is(mod)) {
      lox.moduleId = 'INVALID';
      mod = this._modules.INVALID;
    }
    let slicedName =
      mod.fullName.length > 0 ? `${mod.fullName.slice(0, this._moduleTextSlice)}: ` : '';
    const moduleTextLength = lox.moduleId === 'NONE' ? 0 : this._moduleTextSlice + 2;
    for (let i = slicedName.length; i < moduleTextLength; i++) {
      slicedName += ' ';
    }
    const hidden = this.isHiddenAt(lox.level, lox.moduleId);

    return {
      loxModule: {
        ...mod,
        slicedName,
      },
      hidden,
    };
  }

  /**
   * @deprecated
   * @internal the texts of a specific module ||INVALID module
   */
  getText(lox: Lox): string {
    let module = this._modules[lox.moduleId];
    if (!is(module)) {
      lox.moduleId = 'INVALID';
      module = this._modules.INVALID;
    }
    let moduleText =
      module.fullName.length > 0 ? `${module.fullName.slice(0, this._moduleTextSlice)}: ` : '';
    const moduleTextLength = lox.moduleId === 'NONE' ? 0 : this._moduleTextSlice + 2;
    for (let i = moduleText.length; i < moduleTextLength; i++) {
      moduleText += ' ';
    }

    return moduleText;
  }

  /**
   * @deprecated
   * @internal the color of a specific module || ''
   */
  getColor(moduleId: string): string {
    const module = this._modules[moduleId];

    return is(module) && is(module.color) ? module.color : '';
  }
}

/** @internal */
export const DEFAULT_MODULES: LoxerModules = {
  NONE: {
    fullName: '',
    color: '#fff',
    devLevel: 'info',
    prodLevel: 'error',
  },
  DEFAULT: {
    fullName: '',
    color: '#fff',
    devLevel: 'info',
    prodLevel: 'error',
  },
  INVALID: {
    fullName: 'INVALIDMODULE',
    color: '#f00',
    devLevel: 'info',
    prodLevel: 'error',
  },
};

export const DEFAULT_EXTENDED_MODULE: ExtendedModule = {
  fullName: 'INVALIDMODULE',
  color: '#f00',
  devLevel: 'info',
  prodLevel: 'error',
  slicedName: '',
};
