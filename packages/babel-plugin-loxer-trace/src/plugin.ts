import type { NodePath } from '@babel/core';
import type * as BabelTypes from '@babel/types';
import { traceBinding } from './trace-binding.js';
import type { LoxerTracePluginOptions } from './types.js';

interface BabelPluginApi {
  assertVersion(range: string): void;
  types: typeof BabelTypes;
}

/** A resolved standalone `trace(target, options?)` marker in the current program. */
interface Marker {
  /** Path to the marker call, used for replacement and code-frame errors. */
  callPath: NodePath<any>;
  /** Options expression passed to the generated runtime helper. */
  optionsNode: any;
  /** Babel binding for the function selected by the marker. */
  targetBinding: any;
  /** Source-level function name used in trace messages and diagnostics. */
  targetName: string;
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

        const seenTargets = new Set<any>();
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
          if (seenTargets.has(marker.targetBinding)) {
            throw marker.callPath.buildCodeFrameError(
              `Function "${marker.targetName}" has more than one trace() marker.`
            );
          }
          seenTargets.add(marker.targetBinding);

          const optionsId = marker.callPath.scope.generateUidIdentifier(
            `${marker.targetName}TraceOptions`
          );
          getBindingStatement(marker.targetBinding.path).insertBefore(
            t.variableDeclaration('var', [t.variableDeclarator(optionsId, t.objectExpression([]))])
          );
          marker.callPath.parentPath.replaceWith(
            t.expressionStatement(
              t.assignmentExpression('=', t.cloneNode(optionsId), marker.optionsNode)
            )
          );

          traceBinding(
            marker.targetBinding.path,
            marker.targetName,
            runtimeId,
            observeResultId,
            setFunctionLengthId,
            optionsId,
            loxerBinding,
            t
          );
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

/** Returns the declaration statement that owns a binding, preserving an enclosing named export. */
function getBindingStatement(bindingPath: NodePath<any>): NodePath<any> {
  const statementPath = bindingPath.getStatementParent();
  if (!statementPath) {
    throw bindingPath.buildCodeFrameError('trace() target must be declared in a statement.');
  }

  return statementPath.parentPath?.isExportNamedDeclaration()
    ? statementPath.parentPath
    : statementPath;
}

/** Finds valid marker calls whose callee resolves to one of the imported marker bindings. */
function collectMarkers(
  programPath: NodePath<any>,
  markerBindings: Set<any>,
  t: typeof BabelTypes
): Marker[] {
  const markers: Marker[] = [];

  programPath.traverse({
    /** Validate the marker's standalone shape and resolve the named function it targets. */
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

      const target = callPath.node.arguments[0];
      if (!t.isIdentifier(target)) {
        throw callPath.buildCodeFrameError(
          'trace() targets must be named function-binding identifiers.'
        );
      }

      const targetBinding = callPath.scope.getBinding(target.name);
      if (!targetBinding) {
        throw callPath.buildCodeFrameError(`Cannot resolve trace() target "${target.name}".`);
      }

      const optionsNode = callPath.node.arguments[1];
      if (t.isSpreadElement(optionsNode) || t.isJSXNamespacedName(optionsNode)) {
        throw callPath.buildCodeFrameError('trace() options cannot be a spread argument.');
      }

      markers.push({
        callPath,
        optionsNode: optionsNode ?? t.objectExpression([]),
        targetBinding,
        targetName: target.name,
      });
    },
  });

  return markers;
}
