import type { NodePath } from '@babel/core';
import type { BabelTypes } from './types.js';

const SUPPORTED_MODIFIERS = new Set(['highlight', 'h', 'level', 'l', 'module', 'm']);

const LINKED_METHODS = new Map([
  ['log', 'add'],
  ['error', 'error'],
  ['namedError', 'namedError'],
]);

/**
 * Rewrites one supported function binding so it opens, completes, or fails a Loxer trace.
 *
 * The generated wrapper keeps observable function behavior intact while directing eligible
 * direct `Loxer` calls to the trace's box identifier.
 */
export function traceBinding(
  bindingPath: NodePath<any>,
  functionName: string,
  runtimeId: any,
  observeResultId: any,
  setFunctionLengthId: any,
  optionsId: any,
  loxerBinding: any,
  t: BabelTypes
): void {
  if (bindingPath.isFunctionDeclaration()) {
    if (bindingPath.node.generator) {
      throw bindingPath.buildCodeFrameError('trace() does not support generator functions.');
    }

    const stateId = bindingPath.scope.generateUidIdentifier('traceState');
    rewriteDirectLoxerCalls(bindingPath.get('body'), loxerBinding, stateId, t);
    const originalBody = bindingPath.node.body;
    const invokeId = bindingPath.scope.generateUidIdentifier('invokeTrace');
    const argsExpression = t.arrayExpression([t.spreadElement(t.identifier('arguments'))]);
    bindingPath.node.body = buildWrapperBody(
      originalBody,
      bindingPath.node.async,
      functionName,
      runtimeId,
      observeResultId,
      optionsId,
      stateId,
      invokeId,
      argsExpression,
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
    const wrapperBody = buildWrapperBody(
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
    );
    initPath.replaceWith(
      t.arrowFunctionExpression([t.restElement(argsId)], wrapperBody, initPath.node.async)
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

  const originalBody = initPath.node.body;
  const argsExpression = getBindingArgsExpression(initPath, t);

  initPath.node.body = buildWrapperBody(
    originalBody,
    initPath.node.async,
    functionName,
    runtimeId,
    observeResultId,
    optionsId,
    stateId,
    invokeId,
    argsExpression,
    undefined,
    t
  );
}

/** Builds an array of a non-arrow function's actual arguments for the runtime open record. */
function getBindingArgsExpression(_initPath: NodePath<any>, t: BabelTypes): any {
  return t.arrayExpression([t.spreadElement(t.identifier('arguments'))]);
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

/** Calculates JavaScript's observable `Function.length` from a parameter list. */
function getFunctionLength(params: any[], t: BabelTypes): number {
  let length = 0;
  for (const parameter of params) {
    if (t.isAssignmentPattern(parameter) || t.isRestElement(parameter)) {
      break;
    }
    length += 1;
  }

  return length;
}

/**
 * Creates the traced function body around either an existing block or a preserved arrow clone.
 *
 * Synchronous native Promises are observed without replacement so callers retain their original
 * identity; async functions await their result before completing the trace.
 */
function buildWrapperBody(
  originalBody: any,
  isAsync: boolean,
  functionName: string,
  runtimeId: any,
  observeResultId: any,
  optionsId: any,
  stateId: any,
  invokeId: any,
  argsExpression: any,
  originalFunction: any,
  t: BabelTypes
): any {
  const resultId = t.identifier(stateId.name.replace('traceState', 'traceResult'));
  const errorId = t.identifier(stateId.name.replace('traceState', 'traceError'));
  const declarations = [
    t.variableDeclaration('const', [
      t.variableDeclarator(
        stateId,
        t.callExpression(runtimeId, [
          t.stringLiteral(functionName),
          t.cloneNode(argsExpression),
          t.cloneNode(optionsId),
        ])
      ),
    ]),
  ];

  let invokeExpression: any;
  if (originalFunction) {
    declarations.push(
      t.variableDeclaration('const', [t.variableDeclarator(invokeId, originalFunction)])
    );
    invokeExpression = t.callExpression(t.memberExpression(invokeId, t.identifier('apply')), [
      t.thisExpression(),
      t.cloneNode(argsExpression),
    ]);
  } else {
    declarations.push(
      t.variableDeclaration('const', [
        t.variableDeclarator(invokeId, t.arrowFunctionExpression([], originalBody, isAsync)),
      ])
    );
    invokeExpression = t.callExpression(invokeId, []);
  }

  /** Produces the runtime call that records a successful result. */
  const successCall = (value: any) =>
    t.expressionStatement(
      t.callExpression(t.memberExpression(stateId, t.identifier('success')), [t.cloneNode(value)])
    );
  /** Produces the runtime call that records a thrown value before it is rethrown unchanged. */
  const failureCall = (value: any) =>
    t.expressionStatement(
      t.callExpression(t.memberExpression(stateId, t.identifier('failure')), [t.cloneNode(value)])
    );

  const tryStatements: any[] = [
    t.variableDeclaration('const', [
      t.variableDeclarator(
        resultId,
        isAsync ? t.awaitExpression(invokeExpression) : invokeExpression
      ),
    ]),
  ];

  if (!isAsync) {
    tryStatements.push(
      t.ifStatement(
        t.callExpression(observeResultId, [t.cloneNode(stateId), t.cloneNode(resultId)]),
        t.returnStatement(t.cloneNode(resultId))
      )
    );
  }

  tryStatements.push(successCall(resultId), t.returnStatement(t.cloneNode(resultId)));

  return t.blockStatement([
    ...declarations,
    t.tryStatement(
      t.blockStatement(tryStatements),
      t.catchClause(
        errorId,
        t.blockStatement([failureCall(errorId), t.throwStatement(t.cloneNode(errorId))])
      )
    ),
  ]);
}

/** Rewrites eligible direct `Loxer` chains in a transformed body to attach them to its trace box. */
function rewriteDirectLoxerCalls(
  bodyPath: NodePath<any>,
  loxerBinding: any,
  stateId: any,
  t: BabelTypes
): void {
  if (!loxerBinding) {
    return;
  }

  bodyPath.traverse({
    /** Leave nested functions alone: they need their own explicit marker and trace state. */
    Function(functionPath: NodePath<any>): void {
      functionPath.skip();
    },
    /** Link a supported direct `Loxer` logging call to the generated trace identifier. */
    CallExpression(callPath: NodePath<any>): void {
      const callee = callPath.node.callee;
      if (!t.isMemberExpression(callee) || callee.computed || !t.isIdentifier(callee.property)) {
        return;
      }

      const linkedMethod = LINKED_METHODS.get(callee.property.name);
      if (!linkedMethod || !isDirectLoxerChain(callee.object, callPath, loxerBinding, t)) {
        return;
      }

      callee.object = t.callExpression(t.memberExpression(callee.object, t.identifier('of')), [
        t.memberExpression(t.cloneNode(stateId), t.identifier('id')),
        t.booleanLiteral(true),
      ]);
      callee.property = t.identifier(linkedMethod);
    },
  });
}

/** Returns whether an expression is a direct, unshadowed `Loxer` modifier chain. */
function isDirectLoxerChain(
  expression: any,
  callPath: NodePath<any>,
  loxerBinding: any,
  t: BabelTypes
): boolean {
  if (t.isIdentifier(expression)) {
    return (
      expression.name === 'Loxer' && callPath.scope.getBinding(expression.name) === loxerBinding
    );
  }

  if (
    !t.isCallExpression(expression) ||
    !t.isMemberExpression(expression.callee) ||
    expression.callee.computed ||
    !t.isIdentifier(expression.callee.property) ||
    !SUPPORTED_MODIFIERS.has(expression.callee.property.name)
  ) {
    return false;
  }

  return isDirectLoxerChain(expression.callee.object, callPath, loxerBinding, t);
}
