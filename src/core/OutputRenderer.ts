import { ErrorLox } from '../loxes/ErrorLox.js';
import { OutputLox } from '../loxes/OutputLox.js';
import { ANSIFormat } from './ANSIFormat.js';
import { BoxFactory } from './BoxFactory.js';
import { PropsPrinter } from './PropsPrinter.js';
import type {
  ErrorLoxTemplate,
  LoxerOutputRendererOptions,
  OutputLoxTemplate,
  OutputLoxTemplateFields,
} from '../types.js';

function renderProps(lox: OutputLox, colored: boolean = false, boxIndentation: number = 0): string {
  if (!lox.printProps) {
    return '';
  }

  return PropsPrinter.of(lox).print(colored, {
    depth: boxIndentation + BoxFactory.getMarkerDepth(lox.box),
    color: lox.module.color,
  });
}

function renderErrorContext(lox: ErrorLox) {
  const stack = lox.highlighted && lox.error.stack ? lox.error.stack : '';
  const openLogs =
    lox.highlighted && lox.openLoxes.length > 0
      ? `\nOPEN_LOGS: [${lox.openLoxes.map((openLox) => openLox.message).join(' <> ')}]`
      : '';

  return { stack, openLogs };
}

/**
 * Builds destination-independent plain and ANSI-colored fields for an `OutputLox`.
 * @param lox The visible ordinary log to format.
 * @param propsIndentation The number of columns before rendered props in the destination layout.
 * @param options Presentation settings for the destination, including colors and fallback box layout.
 * @returns A template with plain fields and a `colored` field set. Rendering does not change `lox`.
 */
export function OutputLoxRenderer(
  lox: OutputLox,
  propsIndentation: number = 0,
  options: LoxerOutputRendererOptions = {}
): OutputLoxTemplate {
  const timeStamp = lox.timestamp.toISOString().replace('T', ' ').slice(0, 19);
  const colored = ColoredOutputLoxRenderer(lox, propsIndentation, options);

  return {
    module: lox.module.slicedName,
    message: lox.message,
    timeConsumption: lox.timeText,
    box: BoxFactory.getBoxString(lox.box, {
      colored: false,
      boxLayoutStyle: options.boxLayoutStyle,
    }),
    props: renderProps(lox, false, propsIndentation),
    timeStamp,
    colored,
  };
}

/** @internal */
export function ColoredOutputLoxRenderer(
  lox: OutputLox,
  propsIndentation: number = 0,
  options: LoxerOutputRendererOptions = {}
): OutputLoxTemplateFields {
  const colored = ANSIFormat.colorLox(lox, {
    moduleOpacity: lox.type === 'close' ? (options.endTitleOpacity ?? 0) : 1,
    colors: options.colors,
  });

  return {
    module: colored.moduleText,
    message: colored.message,
    timeConsumption: colored.timeText,
    box: BoxFactory.getBoxString(lox.box, {
      colored: true,
      boxLayoutStyle: options.boxLayoutStyle,
    }),
    props: renderProps(lox, true, propsIndentation),
    timeStamp: colored.timestamp,
  };
}

/**
 * Builds destination-independent plain and ANSI-colored fields for an `ErrorLox`.
 * @param lox The visible error log to format.
 * @param propsIndentation The number of columns before rendered props in the destination layout.
 * @param options Presentation settings for the destination, including colors and fallback box layout.
 * @returns A template with ordinary fields plus error stack/open-log context and a `colored` field set.
 * Rendering does not change `lox`.
 */
export function ErrorLoxRenderer(
  lox: ErrorLox,
  propsIndentation: number = 0,
  options: LoxerOutputRendererOptions = {}
): ErrorLoxTemplate {
  const outputLox = OutputLoxRenderer(lox, propsIndentation, options);
  const errorContext = renderErrorContext(lox);

  return {
    ...outputLox,
    ...errorContext,
    colored: {
      ...outputLox.colored,
      ...errorContext,
    },
  };
}

/** @internal */
export function ColoredErrorLoxRenderer(
  lox: ErrorLox,
  propsIndentation: number = 0,
  options: LoxerOutputRendererOptions = {}
): ErrorLoxTemplate['colored'] {
  const outputLox = ColoredOutputLoxRenderer(lox, propsIndentation, options);

  return { ...outputLox, ...renderErrorContext(lox) };
}
