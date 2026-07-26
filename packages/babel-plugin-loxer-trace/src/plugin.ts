import type { NodePath } from '@babel/core';
import type * as BabelTypes from '@babel/types';
import { traceBinding } from './trace-binding.js';
import type { LoxerTracePluginOptions } from './types.js';

interface BabelPluginApi {
  assertVersion(range: string): void;
  types: typeof BabelTypes;
}

/** One function binding selected by a marker. */
interface MarkerTarget {
  /** Babel binding for the selected function. */
  binding: any;
  /** Source-level function name used in trace messages and diagnostics. */
  name: string;
}

/**
 * A resolved standalone `trace(target, options?)` or `trace([targets], options?)` marker in the
 * current program.
 */
interface Marker {
  /** Path to the marker call, used for replacement and code-frame errors. */
  callPath: NodePath<any>;
  /** Options expression passed to the generated runtime helper, shared by every target. */
  optionsNode: any;
  /** Function bindings the marker selected, in source order. */
  targets: MarkerTarget[];
}

/**
 * Babel plugin that replaces `trace()` marker statements with trace-aware function bodies.
 *
 * The marker itself is imported from `loxer/trace`; this plugin detects its binding rather than
 * matching a spelling, so unrelated local functions named `trace` are left alone.
 */
export default function loxerTracePlugin(
  apiValue: unknown,
  options: LoxerTracePluginOptions = {}
): any {
  const api = apiValue as BabelPluginApi;
  api.assertVersion('^7.26.10 || ^8.0.0');
  const t = api.types;
  const traceImport = options.traceImport ?? 'loxer/trace';
  const loxerImport = options.loxerImport ?? 'loxer';

  return {
    name: 'babel-plugin-loxer-trace',
    visitor: {
      /** Collect markers once per file, add collision-safe runtime imports, then transform targets. */
      Program(programPath: NodePath<any>): void {
        const markerBindings = new Set<any>();
        let runtimeImportPath: NodePath<any> | undefined;
        let loxerBinding: any;

        for (const bodyPath of programPath.get('body') as NodePath<any>[]) {
          if (!bodyPath.isImportDeclaration()) {
            continue;
          }

          if (bodyPath.node.source.value === traceImport) {
            runtimeImportPath ??= bodyPath;
            for (const specifierPath of bodyPath.get('specifiers') as NodePath<any>[]) {
              if (
                specifierPath.isImportSpecifier() &&
                t.isIdentifier(specifierPath.node.imported, { name: 'trace' })
              ) {
                const binding = programPath.scope.getBinding(specifierPath.node.local.name);
                if (binding) {
                  markerBindings.add(binding);
                }
              }
            }
          }

          if (bodyPath.node.source.value === loxerImport) {
            for (const specifierPath of bodyPath.get('specifiers') as NodePath<any>[]) {
              if (
                specifierPath.isImportSpecifier() &&
                t.isIdentifier(specifierPath.node.imported, { name: 'Loxer' }) &&
                specifierPath.node.local.name === 'Loxer'
              ) {
                loxerBinding = programPath.scope.getBinding('Loxer');
              }
            }
          }
        }

        if (markerBindings.size === 0 || !runtimeImportPath) {
          return;
        }

        const markers = collectMarkers(programPath, markerBindings, t);
        if (markers.length === 0) {
          return;
        }

        assertOneMarkerPerTarget(markers);

        const runtimeId = programPath.scope.generateUidIdentifier('startTrace');
        const observeResultId = programPath.scope.generateUidIdentifier('observeTraceResult');
        const setFunctionLengthId =
          programPath.scope.generateUidIdentifier('setTraceFunctionLength');
        runtimeImportPath.node.specifiers.push(
          t.importSpecifier(runtimeId, t.identifier('__startTrace')),
          t.importSpecifier(observeResultId, t.identifier('__observeTraceResult')),
          t.importSpecifier(setFunctionLengthId, t.identifier('__setTraceFunctionLength'))
        );

        for (const marker of markers) {
          const optionsId = programPath.scope.generateUidIdentifier(
            marker.targets.length > 1
              ? 'sharedTraceOptions'
              : `${marker.targets[0].name}TraceOptions`
          );
          declareTraceOptions(marker, optionsId);
          marker.callPath.parentPath.replaceWith(
            t.expressionStatement(
              t.assignmentExpression('=', t.cloneNode(optionsId), marker.optionsNode)
            )
          );

          for (const target of marker.targets) {
            traceBinding(
              target.binding.path,
              target.name,
              runtimeId,
              observeResultId,
              setFunctionLengthId,
              optionsId,
              loxerBinding,
              t
            );
          }
        }

        for (const binding of markerBindings) {
          const specifierPath = binding.path;
          if (!specifierPath.removed) {
            specifierPath.remove();
          }
        }
      },
    },
  };
}

/**
 * Declares uninitialized `var` storage for a marker's options in its targets' outermost scope.
 *
 * Every target binding sits on the marker's scope chain, so those scopes are linearly nested and the
 * outermost one is reachable from each target's generated body as well as from the assignment the
 * marker leaves behind. Declaring there rather than at module scope keeps a marker written inside a
 * function per-invocation: two calls of that function no longer share one options slot.
 *
 * The declaration deliberately has no initializer. `var` hoists, so nothing can overwrite the
 * marker's assignment no matter where the marker sits relative to its targets, and a call that runs
 * before the assignment reaches the runtime helper's own default options.
 */
function declareTraceOptions(marker: Marker, optionsId: any): void {
  outermostTargetScope(marker.targets).push({ id: optionsId, kind: 'var' });
}

/** Returns the outermost of the marker targets' declaring scopes. */
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

/** Counts a scope's ancestors, so nested scopes on one chain can be ordered. */
function scopeDepth(scope: any): number {
  let depth = 0;
  for (let current = scope.parent; current; current = current.parent) {
    depth += 1;
  }

  return depth;
}

/** Rejects a function selected by more than one marker, whose traces would nest into each other. */
function assertOneMarkerPerTarget(markers: Marker[]): void {
  const seenTargets = new Set<any>();

  for (const marker of markers) {
    for (const target of marker.targets) {
      if (seenTargets.has(target.binding)) {
        throw marker.callPath.buildCodeFrameError(
          `Function "${target.name}" has more than one trace() marker.`
        );
      }
      seenTargets.add(target.binding);
    }
  }
}

/** Finds valid marker calls whose callee resolves to one of the imported marker bindings. */
function collectMarkers(
  programPath: NodePath<any>,
  markerBindings: Set<any>,
  t: typeof BabelTypes
): Marker[] {
  const markers: Marker[] = [];

  programPath.traverse({
    /** Validate the marker's standalone shape and resolve the named functions it targets. */
    CallExpression(callPath: NodePath<any>): void {
      const callee = callPath.node.callee;
      if (!t.isIdentifier(callee)) {
        return;
      }

      const binding = callPath.scope.getBinding(callee.name);
      if (!binding || !markerBindings.has(binding)) {
        return;
      }

      if (!callPath.parentPath.isExpressionStatement()) {
        throw callPath.buildCodeFrameError(
          'trace() must be a standalone statement beside its named function binding.'
        );
      }
      if (callPath.node.arguments.length < 1 || callPath.node.arguments.length > 2) {
        throw callPath.buildCodeFrameError('trace() expects a target and optional options.');
      }

      const optionsNode = callPath.node.arguments[1];
      if (t.isSpreadElement(optionsNode) || t.isJSXNamespacedName(optionsNode)) {
        throw callPath.buildCodeFrameError('trace() options cannot be a spread argument.');
      }

      markers.push({
        callPath,
        optionsNode: optionsNode ?? t.objectExpression([]),
        targets: collectTargets(callPath, t),
      });
    },
  });

  return markers;
}

/**
 * Resolves a marker's first argument into the function bindings it selects.
 *
 * One identifier marks one function; an array literal marks every listed function with the same
 * options. The list has to be a literal because the transform resolves each binding at compile time.
 */
function collectTargets(callPath: NodePath<any>, t: typeof BabelTypes): MarkerTarget[] {
  const targetsNode = callPath.node.arguments[0];

  if (!t.isArrayExpression(targetsNode)) {
    return [resolveTarget(callPath, targetsNode, t)];
  }

  if (targetsNode.elements.length === 0) {
    throw callPath.buildCodeFrameError('trace() expects at least one target.');
  }

  return targetsNode.elements.map((element) => resolveTarget(callPath, element, t));
}

/** Resolves one marker target identifier to the function binding it names. */
function resolveTarget(
  callPath: NodePath<any>,
  targetNode: any,
  t: typeof BabelTypes
): MarkerTarget {
  if (!t.isIdentifier(targetNode)) {
    throw callPath.buildCodeFrameError(
      'trace() targets must be named function-binding identifiers.'
    );
  }

  const binding = callPath.scope.getBinding(targetNode.name);
  if (!binding) {
    throw callPath.buildCodeFrameError(`Cannot resolve trace() target "${targetNode.name}".`);
  }

  return { binding, name: targetNode.name };
}
