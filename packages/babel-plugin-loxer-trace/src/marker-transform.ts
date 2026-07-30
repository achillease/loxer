import type { NodePath } from '@babel/core';
import type * as BabelTypes from '@babel/types';
import { traceBinding, traceEnclosingFunction, traceLiteral } from './trace-binding.js';
import type {
  EnclosingMarker,
  InlineMarker,
  Marker,
  MarkerTarget,
  RuntimeIds,
  StatementMarker,
} from './marker-types.js';

/** Transforms a marker after runtime helper imports have been added. */
export function transformMarker(
  marker: Marker,
  programPath: NodePath<any>,
  runtime: RuntimeIds,
  t: typeof BabelTypes
): void {
  if (marker.kind === 'inline') {
    transformInlineMarker(marker, programPath, runtime, t);
  } else if (marker.kind === 'enclosing') {
    transformEnclosingMarker(marker, runtime, t);
  } else {
    transformStatementMarker(marker, programPath, runtime, t);
  }
}

/** Orders nested marker transforms from the innermost function outwards. */
export function innermostFirst(markers: Marker[]): Marker[] {
  return markers
    .map((marker, index) => ({ depth: transformDepth(marker), index, marker }))
    .sort((one, other) => other.depth - one.depth || one.index - other.index)
    .map((entry) => entry.marker);
}

function transformInlineMarker(
  marker: InlineMarker,
  programPath: NodePath<any>,
  runtime: RuntimeIds,
  t: typeof BabelTypes
): void {
  const optionsId = programPath.scope.generateUidIdentifier(`${marker.name}TraceOptions`);
  marker.callPath.scope.push({ id: optionsId, kind: 'var' });
  const traced = traceLiteral(
    marker.literalPath,
    marker.name,
    runtime.runtimeId,
    runtime.observeResultId,
    runtime.withFunctionLengthId,
    optionsId,
    runtime.loxerBinding,
    t
  );
  marker.callPath.replaceWith(
    t.sequenceExpression([
      t.assignmentExpression('=', t.cloneNode(optionsId), marker.optionsNode),
      traced,
    ])
  );
}

function transformEnclosingMarker(
  marker: EnclosingMarker,
  runtime: RuntimeIds,
  t: typeof BabelTypes
): void {
  marker.callPath.parentPath.remove();
  traceEnclosingFunction(
    marker.functionPath,
    marker.name,
    runtime.runtimeId,
    runtime.observeResultId,
    marker.optionsNode,
    runtime.loxerBinding,
    t
  );
}

function transformStatementMarker(
  marker: StatementMarker,
  programPath: NodePath<any>,
  runtime: RuntimeIds,
  t: typeof BabelTypes
): void {
  const optionsId = programPath.scope.generateUidIdentifier(
    marker.targets.length > 1 ? 'sharedTraceOptions' : `${marker.targets[0].name}TraceOptions`
  );
  outermostTargetScope(marker.targets).push({ id: optionsId, kind: 'var' });
  marker.callPath.parentPath.replaceWith(
    t.expressionStatement(t.assignmentExpression('=', t.cloneNode(optionsId), marker.optionsNode))
  );

  for (const target of marker.targets) {
    traceBinding(
      target.binding.path,
      target.name,
      runtime.runtimeId,
      runtime.observeResultId,
      runtime.setFunctionLengthId,
      optionsId,
      runtime.loxerBinding,
      t
    );
  }
}

function transformDepth(marker: Marker): number {
  if (marker.kind === 'inline') {
    return pathDepth(marker.literalPath);
  }
  if (marker.kind === 'enclosing') {
    return pathDepth(marker.functionPath);
  }

  return Math.min(...marker.targets.map((target) => pathDepth(target.binding.path)));
}

function pathDepth(path: NodePath<any>): number {
  let depth = 0;
  for (let current = path.parentPath; current; current = current.parentPath) {
    depth += 1;
  }

  return depth;
}

function outermostTargetScope(targets: MarkerTarget[]): any {
  let outermost = targets[0].binding.scope;
  let outermostDepth = scopeDepth(outermost);
  for (const target of targets) {
    const depth = scopeDepth(target.binding.scope);
    if (depth < outermostDepth) {
      outermost = target.binding.scope;
      outermostDepth = depth;
    }
  }

  return outermost;
}

function scopeDepth(scope: any): number {
  let depth = 0;
  for (let current = scope.parent; current; current = current.parent) {
    depth += 1;
  }

  return depth;
}
