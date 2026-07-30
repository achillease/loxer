import type { NodePath } from '@babel/core';
import type * as BabelTypes from '@babel/types';

/** Builds recorded call arguments from an arrow's own parameters. */
export function getParameterArgsExpression(
  functionPath: NodePath<any>,
  prelude: any[],
  t: typeof BabelTypes
): any {
  const params = functionPath.node.params as any[];
  const elements: any[] = [];

  params.forEach((parameter, index) => {
    if (t.isRestElement(parameter)) {
      const restId = readableParameter(parameter.argument, functionPath, prelude, t);
      parameter.argument = restId;
      elements.push(t.spreadElement(t.cloneNode(restId)));

      return;
    }
    if (t.isAssignmentPattern(parameter)) {
      parameter.left = readableParameter(parameter.left, functionPath, prelude, t);
      elements.push(t.cloneNode(parameter.left));

      return;
    }

    params[index] = readableParameter(parameter, functionPath, prelude, t);
    elements.push(t.cloneNode(params[index]));
  });

  return t.arrayExpression(elements);
}

/** Returns a parameter the traced body can read as a whole, aliasing destructuring patterns. */
function readableParameter(
  target: any,
  functionPath: NodePath<any>,
  prelude: any[],
  t: typeof BabelTypes
): any {
  if (t.isIdentifier(target)) {
    return target;
  }

  const aliasId = functionPath.scope.generateUidIdentifier('traceArg');
  aliasId.typeAnnotation = target.typeAnnotation;
  target.typeAnnotation = null;
  prelude.push(t.variableDeclaration('let', [t.variableDeclarator(target, t.cloneNode(aliasId))]));

  return aliasId;
}

/** Returns the statement that owns a binding, preserving an enclosing named export. */
export function getBindingStatement(bindingPath: NodePath<any>): NodePath<any> {
  const statementPath = bindingPath.getStatementParent();
  if (!statementPath) {
    throw bindingPath.buildCodeFrameError('trace() target must be declared in a statement.');
  }

  return statementPath.parentPath?.isExportNamedDeclaration()
    ? statementPath.parentPath
    : statementPath;
}

/** Returns whether an arrow wrapper needs its observable Function.length restored. */
export function needsFunctionLength(literalNode: any, t: typeof BabelTypes): boolean {
  return getFunctionLength(literalNode.params, t) > 0;
}

/** Calculates JavaScript's observable Function.length from a parameter list. */
export function getFunctionLength(params: any[], t: typeof BabelTypes): number {
  let length = 0;
  for (const parameter of params) {
    if (t.isAssignmentPattern(parameter) || t.isRestElement(parameter)) {
      break;
    }
    length += 1;
  }

  return length;
}
