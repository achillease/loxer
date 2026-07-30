import type { NodePath } from '@babel/core';
import type * as BabelTypes from '@babel/types';
import { rewriteDirectLoxerCalls } from './linked-loxer.js';
import {
  getBindingStatement,
  getFunctionLength,
  getParameterArgsExpression,
  needsFunctionLength,
} from './trace-function.js';
import { buildWrapperBody } from './trace-wrapper.js';

/** Rewrites one supported function binding so it opens, completes, or fails a Loxer trace. */
/** @internal */
export function traceBinding(
  bindingPath: NodePath<any>,
  functionName: string,
  runtimeId: any,
  observeResultId: any,
  setFunctionLengthId: any,
  optionsId: any,
  loxerBinding: any,
  t: typeof BabelTypes
): void {
  if (bindingPath.isFunctionDeclaration()) {
    if (bindingPath.node.generator) {
      throw bindingPath.buildCodeFrameError('trace() does not support generator functions.');
    }

    const stateId = bindingPath.scope.generateUidIdentifier('traceState');
    rewriteDirectLoxerCalls(bindingPath.get('body'), loxerBinding, stateId, t);
    const originalBody = bindingPath.node.body;
    const invokeId = bindingPath.scope.generateUidIdentifier('invokeTrace');
    bindingPath.node.body = buildWrapperBody(
      originalBody,
      bindingPath.node.async,
      functionName,
      runtimeId,
      observeResultId,
      optionsId,
      stateId,
      invokeId,
      t.arrayExpression([t.spreadElement(t.identifier('arguments'))]),
      undefined,
      t
    );

    return;
  }

  if (!bindingPath.isVariableDeclarator()) {
    throw bindingPath.buildCodeFrameError(
      'trace() supports function declarations and named variable bindings only.'
    );
  }

  const initPath = bindingPath.get('init');
  if (!initPath.isFunctionExpression() && !initPath.isArrowFunctionExpression()) {
    throw bindingPath.buildCodeFrameError(
      `trace() target "${functionName}" is not initialized with a function.`
    );
  }
  if (initPath.node.generator) {
    throw initPath.buildCodeFrameError('trace() does not support generator functions.');
  }
  if (!t.isBlockStatement(initPath.node.body)) {
    initPath.node.body = t.blockStatement([t.returnStatement(initPath.node.body)]);
  }

  const stateId = initPath.scope.generateUidIdentifier('traceState');
  rewriteDirectLoxerCalls(initPath.get('body'), loxerBinding, stateId, t);
  const invokeId = initPath.scope.generateUidIdentifier('invokeTrace');

  if (initPath.isArrowFunctionExpression()) {
    const original = t.cloneNode(initPath.node, true);
    const argsId = initPath.scope.generateUidIdentifier('traceArgs');
    initPath.replaceWith(
      t.arrowFunctionExpression(
        [t.restElement(argsId)],
        buildWrapperBody(
          undefined,
          initPath.node.async,
          functionName,
          runtimeId,
          observeResultId,
          optionsId,
          stateId,
          invokeId,
          argsId,
          original,
          t
        ),
        initPath.node.async
      )
    );
    getBindingStatement(bindingPath).insertAfter(
      t.expressionStatement(
        t.callExpression(setFunctionLengthId, [
          t.identifier(functionName),
          t.numericLiteral(getFunctionLength(original.params, t)),
        ])
      )
    );

    return;
  }

  initPath.node.body = buildWrapperBody(
    initPath.node.body,
    initPath.node.async,
    functionName,
    runtimeId,
    observeResultId,
    optionsId,
    stateId,
    invokeId,
    t.arrayExpression([t.spreadElement(t.identifier('arguments'))]),
    undefined,
    t
  );
}

/** Rewrites a function literal in place and returns the expression that evaluates to it traced. */
/** @internal */
export function traceLiteral(
  literalPath: NodePath<any>,
  functionName: string,
  runtimeId: any,
  observeResultId: any,
  withFunctionLengthId: any,
  optionsId: any,
  loxerBinding: any,
  t: typeof BabelTypes
): any {
  if (literalPath.node.generator) {
    throw literalPath.buildCodeFrameError('trace() does not support generator functions.');
  }
  if (!t.isBlockStatement(literalPath.node.body)) {
    literalPath.node.body = t.blockStatement([t.returnStatement(literalPath.node.body)]);
  }

  const stateId = literalPath.scope.generateUidIdentifier('traceState');
  rewriteDirectLoxerCalls(literalPath.get('body') as NodePath<any>, loxerBinding, stateId, t);
  const invokeId = literalPath.scope.generateUidIdentifier('invokeTrace');
  const isAsync = literalPath.node.async;

  if (literalPath.isArrowFunctionExpression()) {
    const original = literalPath.node;
    const argsId = literalPath.scope.generateUidIdentifier('traceArgs');
    const wrapper = t.arrowFunctionExpression(
      [t.restElement(argsId)],
      buildWrapperBody(
        undefined,
        isAsync,
        functionName,
        runtimeId,
        observeResultId,
        optionsId,
        stateId,
        invokeId,
        argsId,
        original,
        t
      ),
      isAsync
    );

    return needsFunctionLength(original, t)
      ? t.callExpression(t.cloneNode(withFunctionLengthId), [
          wrapper,
          t.numericLiteral(getFunctionLength(original.params, t)),
        ])
      : wrapper;
  }

  literalPath.node.body = buildWrapperBody(
    literalPath.node.body,
    isAsync,
    functionName,
    runtimeId,
    observeResultId,
    optionsId,
    stateId,
    invokeId,
    t.arrayExpression([t.spreadElement(t.identifier('arguments'))]),
    undefined,
    t
  );

  return literalPath.node;
}

/** Rewrites the function a first-statement marker marks through its own body. */
/** @internal */
export function traceEnclosingFunction(
  functionPath: NodePath<any>,
  functionName: string,
  runtimeId: any,
  observeResultId: any,
  optionsNode: any,
  loxerBinding: any,
  t: typeof BabelTypes
): void {
  const stateId = functionPath.scope.generateUidIdentifier('traceState');
  rewriteDirectLoxerCalls(functionPath.get('body') as NodePath<any>, loxerBinding, stateId, t);

  const prelude: any[] = [];
  const argsExpression = functionPath.isArrowFunctionExpression()
    ? getParameterArgsExpression(functionPath, prelude, t)
    : t.arrayExpression([t.spreadElement(t.identifier('arguments'))]);
  const wrapperBody = buildWrapperBody(
    functionPath.node.body,
    functionPath.node.async,
    functionName,
    runtimeId,
    observeResultId,
    optionsNode,
    stateId,
    functionPath.scope.generateUidIdentifier('invokeTrace'),
    argsExpression,
    undefined,
    t
  );
  wrapperBody.body.unshift(...prelude);
  functionPath.node.body = wrapperBody;
}

export { needsFunctionLength } from './trace-function.js';
