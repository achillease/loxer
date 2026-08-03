import type { NodePath } from '@babel/core';

export interface BabelPluginApi {
  assertVersion(range: string): void;
  types: typeof import('@babel/types');
}

export interface MarkerTarget {
  binding: any;
  name: string;
}

export interface StatementMarker {
  kind: 'statement';
  callPath: NodePath<any>;
  optionsNode: any;
  targets: MarkerTarget[];
}

export interface InlineMarker {
  kind: 'inline';
  callPath: NodePath<any>;
  className?: string;
  optionsNode: any;
  literalPath: NodePath<any>;
  name: string;
  isArrow: boolean;
}

export interface EnclosingMarker {
  kind: 'enclosing';
  callPath: NodePath<any>;
  className?: string;
  optionsNode: any;
  functionPath: NodePath<any>;
  name: string;
}

export type Marker = EnclosingMarker | InlineMarker | StatementMarker;

export interface RuntimeIds {
  loxerBinding: any;
  observeResultId: any;
  runtimeId: any;
  setFunctionLengthId: any;
  withFunctionLengthId: any;
}
