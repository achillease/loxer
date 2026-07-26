/** Options accepted by the Babel plugin when registered in a Babel configuration. */
export interface LoxerTracePluginOptions {
  /** Module specifier from which the plugin should find the `Loxer` binding. */
  loxerImport?: string;
  /** Module specifier from which the plugin should find the `trace` marker and runtime helpers. */
  traceImport?: string;
}

/** Options for the configuration-free single-module transform helper. */
export interface TransformLoxerTraceOptions extends LoxerTracePluginOptions {
  /** Optional source name used in Babel diagnostics and source maps. */
  filename?: string;
  /** Babel parser plugins required by the source syntax, such as `typescript` or `jsx`. */
  parserPlugins?: string[];
  /** Whether Babel should produce source maps for the transformed module. */
  sourceMaps?: boolean | 'inline' | 'both';
}

/** Structural result returned by the configuration-free transform helper. */
export interface LoxerTraceResult {
  metadata: Record<string, any>;
  options: Record<string, any>;
  ast: any;
  code: string | null;
  map: any;
  sourceType: 'module' | 'commonjs' | 'script';
  externalDependencies: Set<string>;
}
