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

/**
 * Transforms a marker after runtime helper imports have been added.
 *
 * `fileName` is the parent of every marked function a class does not hold, so a marker resolves its
 * parent as the class it read out of the source, and the file otherwise. A marker beside a binding
 * marks a declaration or a variable, which no class body holds, so it always reports the file.
 *
 * A class name the shortening rule empties falls through to the file as well, so that a class this
 * walk *did* reach never renders as less than a function no class holds at all. No name reaches that
 * fallback today — `classParentName` returns its input untouched rather than emptying it, and every
 * other source of a class name here is a non-empty identifier or property key — so it holds the
 * invariant rather than a case, and a change that lets a class name empty again belongs here first.
 */
export function transformMarker(
  marker: Marker,
  programPath: NodePath<any>,
  runtime: RuntimeIds,
  fileName: string | undefined,
  t: typeof BabelTypes
): void {
  if (marker.kind === 'inline') {
    transformInlineMarker(marker, programPath, runtime, marker.className || fileName, t);
  } else if (marker.kind === 'enclosing') {
    transformEnclosingMarker(marker, runtime, marker.className || fileName, t);
  } else {
    transformStatementMarker(marker, programPath, runtime, fileName, t);
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
  parentName: string | undefined,
  t: typeof BabelTypes
): void {
  const optionsId = programPath.scope.generateUidIdentifier(`${marker.name}TraceOptions`);
  marker.callPath.scope.push({ id: optionsId, kind: 'var' });
  const traced = traceLiteral(
    marker.literalPath,
    marker.name,
    parentName,
    runtime.runtimeId,
    runtime.observeResultId,
    runtime.withFunctionLengthId,
    optionsId,
    runtime.loxerBinding,
    t
  );
  marker.callPath.replaceWith(
    t.sequenceExpression([
      t.assignmentExpression('=', t.cloneNode(optionsId), marker.configurationNode),
      traced,
    ])
  );
}

function transformEnclosingMarker(
  marker: EnclosingMarker,
  runtime: RuntimeIds,
  parentName: string | undefined,
  t: typeof BabelTypes
): void {
  marker.callPath.parentPath.remove();
  traceEnclosingFunction(
    marker.functionPath,
    marker.name,
    parentName,
    runtime.runtimeId,
    runtime.observeResultId,
    marker.configurationNode,
    runtime.loxerBinding,
    t
  );
}

function transformStatementMarker(
  marker: StatementMarker,
  programPath: NodePath<any>,
  runtime: RuntimeIds,
  parentName: string | undefined,
  t: typeof BabelTypes
): void {
  const optionsId = programPath.scope.generateUidIdentifier(
    marker.targets.length > 1 ? 'sharedTraceOptions' : `${marker.targets[0].name}TraceOptions`
  );
  outermostTargetScope(marker.targets).push({ id: optionsId, kind: 'var' });
  marker.callPath.parentPath.replaceWith(
    t.expressionStatement(
      t.assignmentExpression('=', t.cloneNode(optionsId), marker.configurationNode)
    )
  );

  for (const target of marker.targets) {
    traceBinding(
      target.binding.path,
      target.name,
      parentName,
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
