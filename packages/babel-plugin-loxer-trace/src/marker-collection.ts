import type { NodePath } from '@babel/core';
import type * as BabelTypes from '@babel/types';
import type { EnclosingMarker, Marker, MarkerTarget } from './marker-types.js';

/** Rejects a function selected by more than one marker. */
export function assertOneMarkerPerFunction(markers: Marker[]): void {
  const seenFunctions = new Set<any>();

  for (const marker of markers) {
    for (const marked of markedFunctions(marker)) {
      if (seenFunctions.has(marked.node)) {
        throw marker.callPath.buildCodeFrameError(
          `Function "${marked.name}" has more than one trace() marker.`
        );
      }
      seenFunctions.add(marked.node);
    }
  }
}

function markedFunctions(marker: Marker): { name: string; node: any }[] {
  if (marker.kind === 'inline') {
    return [{ name: marker.name, node: marker.literalPath.node }];
  }
  if (marker.kind === 'enclosing') {
    return [{ name: marker.name, node: marker.functionPath.node }];
  }

  return marker.targets.map((target) => ({
    name: target.name,
    node: target.binding.path.node.init ?? target.binding.path.node,
  }));
}

export function collectMarkers(
  programPath: NodePath<any>,
  markerBindings: Set<any>,
  t: typeof BabelTypes
): Marker[] {
  const markers: Marker[] = [];

  programPath.traverse({
    /** Validate the marker's shape and resolve the function it traces. */
    CallExpression(callPath: NodePath<any>): void {
      const callee = callPath.node.callee;
      if (!t.isIdentifier(callee)) {
        return;
      }

      const binding = callPath.scope.getBinding(callee.name);
      if (!binding || !markerBindings.has(binding)) {
        return;
      }

      const isStandaloneStatement = callPath.parentPath.isExpressionStatement();
      const targetPath = (callPath.get('arguments') as NodePath<any>[])[0];

      // The three forms are told apart by the kind of the first argument: options — or nothing at
      // all — mark the function the marker sits in, a function literal marks itself, and an
      // identifier or a list of them marks the bindings they name.
      if (!targetPath || targetPath.isObjectExpression()) {
        markers.push(collectEnclosingMarker(callPath, isStandaloneStatement, targetPath, t));

        return;
      }

      if (callPath.node.arguments.length > 2) {
        throw callPath.buildCodeFrameError('trace() expects a target and optional options.');
      }

      const isLiteral = targetPath.isFunctionExpression() || targetPath.isArrowFunctionExpression();
      if (!isStandaloneStatement && !isLiteral) {
        throw callPath.buildCodeFrameError(
          'trace() must be a standalone statement beside its named function binding.'
        );
      }

      // A literal marked by a standalone statement is left to the statement form, whose diagnostic —
      // asking for a named binding — describes that mistake: the traced function would be discarded.
      const options = markerOptions(callPath, t);
      markers.push(
        isLiteral && !isStandaloneStatement
          ? {
              callPath,
              className: enclosingClassName(targetPath, t),
              isArrow: targetPath.isArrowFunctionExpression(),
              kind: 'inline',
              literalPath: targetPath,
              name: resolveFunctionName(callPath, targetPath, options, t),
              optionsNode: options,
            }
          : {
              callPath,
              kind: 'statement',
              optionsNode: options,
              targets: collectTargets(callPath, t),
            }
      );
    },
  });

  return markers;
}

/** Reads the marker's options argument, which every form shares in the second position. */
function markerOptions(callPath: NodePath<any>, t: typeof BabelTypes): any {
  const optionsNode = callPath.node.arguments[1];
  if (t.isSpreadElement(optionsNode) || t.isJSXNamespacedName(optionsNode)) {
    throw callPath.buildCodeFrameError('trace() options cannot be a spread argument.');
  }

  return optionsNode ?? t.objectExpression([]);
}

/** Resolves a `trace(options?)` marker against the function it stands at the top of. */
function collectEnclosingMarker(
  callPath: NodePath<any>,
  isStandaloneStatement: boolean,
  optionsPath: NodePath<any> | undefined,
  t: typeof BabelTypes
): EnclosingMarker {
  if (callPath.node.arguments.length > 1) {
    throw callPath.buildCodeFrameError('trace() expects a target and optional options.');
  }

  const functionPath = markedEnclosingFunction(callPath, isStandaloneStatement);
  if (functionPath.node.generator) {
    throw callPath.buildCodeFrameError('trace() does not support generator functions.');
  }
  if (optionsPath) {
    assertOptionsPrecedeBody(optionsPath, functionPath);
  }

  const optionsNode = optionsPath?.node ?? t.objectExpression([]);

  return {
    callPath,
    className: enclosingClassName(functionPath, t),
    functionPath,
    kind: 'enclosing',
    name: resolveFunctionName(callPath, functionPath, optionsNode, t),
    optionsNode,
  };
}

/**
 * Returns the function a `trace(options?)` marker marks, which is the one it stands at the top of.
 *
 * The marker has to be the first statement of a function's block body. Tracing starts before the
 * body runs, so a marker further down would read as if it started there, and an expression-bodied
 * arrow — which has no statement position at all — is not a host for this form.
 */
function markedEnclosingFunction(
  callPath: NodePath<any>,
  isStandaloneStatement: boolean
): NodePath<any> {
  const statementPath = callPath.parentPath;
  const bodyPath = statementPath.parentPath;
  const functionPath = bodyPath?.parentPath;

  if (
    !isStandaloneStatement ||
    !bodyPath?.isBlockStatement() ||
    !functionPath?.isFunction() ||
    bodyPath.node.body[0] !== statementPath.node
  ) {
    throw callPath.buildCodeFrameError(
      'trace(options) marks the function it sits in, so it has to be the first statement of that ' +
        "function's block body."
    );
  }

  return functionPath;
}

/**
 * Rejects options that read a name the marked function declares in its body.
 *
 * These options are evaluated where the marker stands: at the top of the traced body, before the
 * statements below it run. Parameters are already bound there and stay readable; anything the body
 * declares holds nothing yet, so reading it is a mistake worth naming rather than a value to pass on.
 */
function assertOptionsPrecedeBody(optionsPath: NodePath<any>, functionPath: NodePath<any>): void {
  optionsPath.traverse({
    /** Reject a reference that resolves to a body declaration of the function being marked. */
    ReferencedIdentifier(identifierPath: NodePath<any>): void {
      const name = identifierPath.node.name;
      const binding = identifierPath.scope.getBinding(name);
      if (binding && binding.scope === functionPath.scope && binding.kind !== 'param') {
        throw identifierPath.buildCodeFrameError(
          `trace() options cannot read "${name}", which the marked function declares in its body. ` +
            'The options are evaluated where the marker stands, before that body runs.'
        );
      }
    },
  });
}

/**
 * Resolves the name a traced function reports, or rejects the marker with both ways to supply one.
 *
 * A name read from the code — the function's own, or that of the binding, assignment target, or
 * property it belongs to — is stable as long as that code is. Nothing else is: a name invented from
 * the function's position would change the moment the call site moved, so a function no name reaches
 * is a build error instead.
 */
function resolveFunctionName(
  callPath: NodePath<any>,
  functionPath: NodePath<any>,
  optionsNode: any,
  t: typeof BabelTypes
): string {
  const declared = declaredName(callPath, optionsNode, t);
  if (declared !== undefined) {
    return declared;
  }

  const own = ownName(functionPath.node, t);
  if (own !== undefined) {
    return own;
  }

  const surrounding = surroundingName(functionPath, t);
  if (surrounding !== undefined) {
    return surrounding;
  }

  throw callPath.buildCodeFrameError(
    'Cannot name the trace() target. Assign the function to a named binding, or name it with the ' +
      'name option.'
  );
}

/** Returns the name a function carries itself, as a declaration id or as the key of a method. */
function ownName(functionNode: any, t: typeof BabelTypes): string | undefined {
  if (t.isIdentifier(functionNode.id)) {
    return functionNode.id.name;
  }

  return t.isObjectMethod(functionNode) ||
    t.isClassMethod(functionNode) ||
    t.isClassPrivateMethod(functionNode)
    ? nonComputedName(functionNode, t)
    : undefined;
}

/** Reads the `name` option, which the transform needs as a literal because it reads it now. */
function declaredName(
  callPath: NodePath<any>,
  optionsNode: any,
  t: typeof BabelTypes
): string | undefined {
  if (!t.isObjectExpression(optionsNode)) {
    return undefined;
  }

  for (const property of optionsNode.properties) {
    if (!t.isObjectProperty(property) || property.computed || !isNameKey(property.key, t)) {
      continue;
    }
    if (!t.isStringLiteral(property.value)) {
      throw callPath.buildCodeFrameError('trace() name must be a string literal.');
    }

    return property.value.value;
  }

  return undefined;
}

/** Returns whether an options property names the `name` option. */
function isNameKey(key: any, t: typeof BabelTypes): boolean {
  return t.isIdentifier(key, { name: 'name' }) || t.isStringLiteral(key, { value: 'name' });
}

/**
 * Walks out of an unnamed function to the binding, assignment target, or property that names it.
 *
 * The walk stops at the first boundary it reaches, so a shape the chain does not cover leaves the
 * marker without a name — and therefore raises the error that asks for one — rather than borrowing a
 * name that describes something else.
 */
function surroundingName(functionPath: NodePath<any>, t: typeof BabelTypes): string | undefined {
  for (let path = functionPath.parentPath; path; path = path.parentPath) {
    const node = path.node;
    if (t.isVariableDeclarator(node)) {
      return t.isIdentifier(node.id) ? node.id.name : undefined;
    }
    if (t.isAssignmentExpression(node)) {
      return assignedName(node.left, t);
    }
    if (
      t.isObjectProperty(node) ||
      t.isClassProperty(node) ||
      t.isClassPrivateProperty(node) ||
      t.isClassAccessorProperty(node)
    ) {
      return nonComputedName(node, t);
    }
    if (isNameBoundary(path, t)) {
      return undefined;
    }
  }

  return undefined;
}

/**
 * Returns whether a name found beyond this node would describe something other than the function.
 *
 * A statement, function, or program ends the walk because a name past one belongs to the surrounding
 * code. So does every shape that stands between a function and a name the function does not
 * unconditionally carry: an element of an array or a spread into an object, a branch of a conditional
 * or a logical operator, a sequence operand, a default value, an interpolated template value, a
 * yielded operand, a property read off the function, or a JSX prop. Past each of those, the reachable
 * name belongs to the collection, to whatever the whole expression produced, to the binding only the
 * missing case reaches, to the driver that resumed the generator, or to the element the prop is
 * written on.
 *
 * A call is deliberately not a boundary.
 * `const load = useCallback(trace(() => {}, options), [])` names its box `load` — passing a traced
 * literal to a call on the way to a binding is the shape the inline form exists for, so the walk
 * reads through it.
 *
 * Adding a kind here is a reason to re-read the rest of the list — and to check it against
 * `enclosingClassName`, which ends its walk on the same boundaries.
 */
function isNameBoundary(path: NodePath<any>, t: typeof BabelTypes): boolean {
  return (
    path.isFunction() ||
    path.isStatement() ||
    path.isProgram() ||
    path.isJSX() ||
    t.isArrayExpression(path.node) ||
    t.isObjectExpression(path.node) ||
    t.isConditionalExpression(path.node) ||
    t.isLogicalExpression(path.node) ||
    t.isSequenceExpression(path.node) ||
    t.isAssignmentPattern(path.node) ||
    t.isTemplateLiteral(path.node) ||
    t.isYieldExpression(path.node) ||
    t.isMemberExpression(path.node) ||
    t.isOptionalMemberExpression(path.node)
  );
}

/**
 * Returns the name of the class a traced function is a member of, which the `parent.` message
 * templates render against ahead of the file the function is written in.
 *
 * The walk that reads a function's name is the walk that reads its class, because a function reaches
 * a class through the member that holds it: a method, a getter or setter, an ordinary, private, or
 * accessor field. A function the walk reaches by any other route — one declared inside a method's
 * body, one an object literal holds — is a member of nothing and reports its file instead. A call
 * stays transparent here as well, so `load = useCallback(trace(() => { ... }, options), [])` is read
 * as the field of its class it is.
 */
function enclosingClassName(functionPath: NodePath<any>, t: typeof BabelTypes): string | undefined {
  for (let path: NodePath<any> | null = functionPath; path; path = path.parentPath) {
    if (isClassMember(path.node, t)) {
      return declaringClassName(path.parentPath?.parentPath, t);
    }
    // the marked function is a boundary to everything above it, never to itself
    if (path !== functionPath && isNameBoundary(path, t)) {
      return undefined;
    }
  }

  return undefined;
}

/** Returns whether a node is a class body member that can hold a function. */
function isClassMember(node: any, t: typeof BabelTypes): boolean {
  return (
    t.isClassMethod(node) ||
    t.isClassPrivateMethod(node) ||
    t.isClassProperty(node) ||
    t.isClassPrivateProperty(node) ||
    t.isClassAccessorProperty(node)
  );
}

/** Reads a class's name, from its own id or from the binding an unnamed class expression reaches. */
function declaringClassName(
  classPath: NodePath<any> | null | undefined,
  t: typeof BabelTypes
): string | undefined {
  const node = classPath?.node;
  if (!t.isClassDeclaration(node) && !t.isClassExpression(node)) {
    return undefined;
  }
  if (t.isIdentifier(node.id)) {
    return classParentName(node.id.name);
  }

  const holder = classPath?.parentPath?.node;
  if (t.isVariableDeclarator(holder) && t.isIdentifier(holder.id)) {
    return classParentName(holder.id.name);
  }

  const assigned = t.isAssignmentExpression(holder) ? assignedName(holder.left, t) : undefined;

  return assigned === undefined ? undefined : classParentName(assigned);
}

/**
 * Renders a class as the parent of its methods, dropping a trailing `Class`. A class named exactly
 * `Class` keeps its name, because stripping the suffix would leave no parent at all.
 *
 * The `@trace` decorator reads its class at run time and applies the same rule from
 * `src/core/TraceNames.ts`, which this plugin cannot import: the two are separate packages, and the
 * emitted call carries a finished string. `test/plain-function-trace-enclosing.test.ts` and
 * `test/decorators.test.ts` pin them against each other.
 */
function classParentName(className: string): string {
  return className !== 'Class' && className.endsWith('Class') ? className.slice(0, -5) : className;
}

/**
 * Renders a file as the parent of the functions written in it, as its name without directories or
 * extension.
 *
 * A build that hands Babel no filename leaves a function outside a class with no parent to report,
 * which the runtime renders as the bare function name.
 */
export function fileParentName(filename: unknown): string | undefined {
  if (typeof filename !== 'string') {
    return undefined;
  }

  const base = filename.slice(Math.max(filename.lastIndexOf('/'), filename.lastIndexOf('\\')) + 1);
  const extension = base.lastIndexOf('.');
  // a leading dot names the file rather than starting an extension, so only a later one is dropped
  const name = extension > 0 ? base.slice(0, extension) : base;

  return name.length > 0 ? name : undefined;
}

/** Returns a keyed member's source-level name, which a computed key does not have. */
function nonComputedName(node: any, t: typeof BabelTypes): string | undefined {
  return node.computed ? undefined : propertyName(node.key, t);
}

/** Returns the name an assignment writes to, for a plain or single-member target. */
function assignedName(target: any, t: typeof BabelTypes): string | undefined {
  if (t.isIdentifier(target)) {
    return target.name;
  }

  return t.isMemberExpression(target) && !target.computed
    ? propertyName(target.property, t)
    : undefined;
}

/** Returns a property's source-level name, for the keys a name can be read from. */
function propertyName(key: any, t: typeof BabelTypes): string | undefined {
  if (t.isIdentifier(key)) {
    return key.name;
  }
  if (t.isPrivateName(key)) {
    return `#${key.id.name}`;
  }

  return t.isStringLiteral(key) ? key.value : undefined;
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
