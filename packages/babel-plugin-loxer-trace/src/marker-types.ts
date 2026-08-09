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
  configurationNode: any;
  targets: MarkerTarget[];
}

export interface InlineMarker {
  kind: 'inline';
  callPath: NodePath<any>;
  className?: string;
  configurationNode: any;
  literalPath: NodePath<any>;
  name: string;
  isArrow: boolean;
}

export interface EnclosingMarker {
  kind: 'enclosing';
  callPath: NodePath<any>;
  className?: string;
  configurationNode: any;
  functionPath: NodePath<any>;
  name: string;
}

export interface PointMarker {
  kind: 'point';
  callPath: NodePath<any>;
  className?: string;
  configurationNode: any;
  functionName: string;
}

export type Marker = EnclosingMarker | InlineMarker | PointMarker | StatementMarker;

export interface RuntimeIds {
  loxerBinding: any;
  observeResultId: any;
  runtimeId: any;
  setFunctionLengthId: any;
  tracePointId: any;
  withFunctionLengthId: any;
}
