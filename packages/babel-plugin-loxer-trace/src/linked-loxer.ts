import type { NodePath } from '@babel/core';
import type * as BabelTypes from '@babel/types';

const SUPPORTED_MODIFIERS = new Set(['highlight', 'h', 'module', 'm']);
const LINKED_METHODS = new Map([
  ['log', 'add'],
  ['warn', 'warn'],
  ['info', 'info'],
  ['debug', 'debug'],
  ['error', 'error'],
  ['namedError', 'namedError'],
]);

/** Rewrites eligible direct Loxer chains in a traced body to use its box identifier. */
export function rewriteDirectLoxerCalls(
  bodyPath: NodePath<any>,
  loxerBinding: any,
  stateId: any,
  tracePointId: any,
  t: typeof BabelTypes
): void {
  if (!loxerBinding && !tracePointId) {
    return;
  }

  const rewriteCall = (callPath: NodePath<any>): void => {
    if (
      tracePointId &&
      t.isIdentifier(callPath.node.callee) &&
      callPath.node.callee.name === tracePointId.name &&
      callPath.node.arguments.length >= 4
    ) {
      callPath.node.arguments[3] = t.memberExpression(t.cloneNode(stateId), t.identifier('id'));

      return;
    }
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
  };

  if (bodyPath.isCallExpression()) {
    rewriteCall(bodyPath);
  }

  bodyPath.traverse({
    Function(functionPath: NodePath<any>): void {
      functionPath.skip();
    },
    CallExpression: rewriteCall,
  });
}

/** Returns whether an expression is a direct, unshadowed Loxer modifier chain. */
function isDirectLoxerChain(
  expression: any,
  callPath: NodePath<any>,
  loxerBinding: any,
  t: typeof BabelTypes
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
