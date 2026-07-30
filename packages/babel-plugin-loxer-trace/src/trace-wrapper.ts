import type * as BabelTypes from '@babel/types';

/** Creates the traced body around an existing block or preserved arrow clone. */
export function buildWrapperBody(
  originalBody: any,
  isAsync: boolean,
  functionName: string,
  runtimeId: any,
  observeResultId: any,
  optionsNode: any,
  stateId: any,
  invokeId: any,
  argsExpression: any,
  originalFunction: any,
  t: typeof BabelTypes
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
          t.cloneNode(optionsNode),
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

  const successCall = (value: any) =>
    t.expressionStatement(
      t.callExpression(t.memberExpression(stateId, t.identifier('success')), [t.cloneNode(value)])
    );
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
