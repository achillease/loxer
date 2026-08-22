import { ErrorLox } from '../../loxes/ErrorLox.js';
import { OutputLox } from '../../loxes/OutputLox.js';
import type { LoxerOutputStream } from '../../types.js';
import { LoxHistory } from '../runtime/LoxHistory.js';
import { ColoredErrorLoxRenderer, ColoredOutputLoxRenderer } from './OutputRenderer.js';

interface OutputStreamsProps {
  output?: LoxerOutputStream;
}

const TIMESTAMP_INDENTATION = 8 + 1;

/** @internal */
export class OutputStreams {
  private readonly _output: LoxerOutputStream | undefined;

  constructor(props?: OutputStreamsProps) {
    this._output = props?.output;
  }

  /** the pad that aligns a row the console draws no icon for with the rows it does.
   *
   * `console.warn` and `console.error` are the two methods a devtools console prefixes with an icon,
   * which shifts their rows right on its own. Every other level pays for that shift here. The
   * predicate is one place on purpose: the pad is part of what the line prints before the module
   * text, so {@link getLevelIndentation} and {@link getPropsIndentation} have to agree or the
   * rendered props of exactly the padded rows drift two columns left of the message they branch
   * from. */
  private getLevelIndentation(lox: OutputLox): string {
    return lox.level === 'warn' || lox.level === 'error' ? '' : '  ';
  }

  private getPropsIndentation(lox: OutputLox, levelIndentation: string = ''): number {
    return levelIndentation.length + TIMESTAMP_INDENTATION + lox.module.slicedName.length;
  }

  private getErrorEvent(environment: 'dev' | 'prod', lox: ErrorLox, history: LoxHistory) {
    return { environment, kind: 'error' as const, lox, history: [...history.stack] };
  }

  /** @internal **/
  devErrorOut(errorLox: ErrorLox, history: LoxHistory): void {
    if (this._output) {
      this._output(this.getErrorEvent('dev', errorLox, history));
    } else {
      const levelIndentation = this.getLevelIndentation(errorLox);
      const lox = ColoredErrorLoxRenderer(
        errorLox,
        this.getPropsIndentation(errorLox, levelIndentation)
      );
      console.error(
        `${levelIndentation}${lox.time} ${lox.module}${lox.box}${lox.message}\t${lox.timeConsumption}${lox.props}${lox.stack}${lox.openLogs}`
      );
    }
  }

  /** @internal **/
  prodErrorOut(errorLox: ErrorLox, history: LoxHistory): void {
    this._output?.(this.getErrorEvent('prod', errorLox, history));
  }

  /** @internal **/
  devLogOut(outputLox: OutputLox): void {
    if (this._output) {
      this._output({ environment: 'dev', kind: 'log', lox: outputLox });
    } else {
      const levelIndentation = this.getLevelIndentation(outputLox);
      const lox = ColoredOutputLoxRenderer(
        outputLox,
        this.getPropsIndentation(outputLox, levelIndentation)
      );
      console[outputLox.level](
        `${levelIndentation}${lox.time} ${lox.module}${lox.box}${lox.message}  ${lox.timeConsumption}${lox.props}`
      );
    }
  }

  /** @internal **/
  prodLogOut(outputLox: OutputLox): void {
    this._output?.({ environment: 'prod', kind: 'log', lox: outputLox });
  }
}
