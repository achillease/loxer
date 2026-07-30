import type { NodePath } from '@babel/core';
import type * as BabelTypes from '@babel/types';
import { assertOneMarkerPerFunction, collectMarkers } from './marker-collection.js';
import { innermostFirst, transformMarker } from './marker-transform.js';
import type { BabelPluginApi, RuntimeIds } from './marker-types.js';
import { needsFunctionLength } from './trace-binding.js';
import type { LoxerTracePluginOptions } from './types.js';

/**
 * Babel plugin that replaces imported trace() marker calls with trace-aware function bodies.
 *
 * The marker's binding is detected from the configured trace import, so unrelated local functions
 * named trace are not transformed.
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
      Program(programPath: NodePath<any>): void {
        const imports = collectImports(programPath, traceImport, loxerImport, t);
        if (imports.markerBindings.size === 0 || !imports.runtimeImportPath) {
          return;
        }

        const markers = collectMarkers(programPath, imports.markerBindings, t);
        if (markers.length === 0) {
          return;
        }
        assertOneMarkerPerFunction(markers);

        const runtime = addRuntimeImports(
          programPath,
          imports.runtimeImportPath,
          markers,
          imports.loxerBinding,
          t
        );
        for (const marker of innermostFirst(markers)) {
          transformMarker(marker, programPath, runtime, t);
        }
        for (const binding of imports.markerBindings) {
          if (!binding.path.removed) {
            binding.path.remove();
          }
        }
      },
    },
  };
}

function collectImports(
  programPath: NodePath<any>,
  traceImport: string,
  loxerImport: string,
  t: typeof BabelTypes
): { loxerBinding: any; markerBindings: Set<any>; runtimeImportPath?: NodePath<any> } {
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

  return { loxerBinding, markerBindings, runtimeImportPath };
}

function addRuntimeImports(
  programPath: NodePath<any>,
  runtimeImportPath: NodePath<any>,
  markers: Parameters<typeof innermostFirst>[0],
  loxerBinding: any,
  t: typeof BabelTypes
): RuntimeIds {
  const runtimeId = programPath.scope.generateUidIdentifier('startTrace');
  const observeResultId = programPath.scope.generateUidIdentifier('observeTraceResult');
  const setFunctionLengthId = programPath.scope.generateUidIdentifier('setTraceFunctionLength');
  runtimeImportPath.node.specifiers.push(
    t.importSpecifier(runtimeId, t.identifier('__startTrace')),
    t.importSpecifier(observeResultId, t.identifier('__observeTraceResult')),
    t.importSpecifier(setFunctionLengthId, t.identifier('__setTraceFunctionLength'))
  );

  let withFunctionLengthId: any;
  if (
    markers.some(
      (marker) =>
        marker.kind === 'inline' &&
        marker.isArrow &&
        needsFunctionLength(marker.literalPath.node, t)
    )
  ) {
    withFunctionLengthId = programPath.scope.generateUidIdentifier('withTraceFunctionLength');
    runtimeImportPath.node.specifiers.push(
      t.importSpecifier(withFunctionLengthId, t.identifier('__withTraceFunctionLength'))
    );
  }

  return { loxerBinding, observeResultId, runtimeId, setFunctionLengthId, withFunctionLengthId };
}
