import { ErrorLox } from '../loxes/ErrorLox.js';
import { OutputLox } from '../loxes/OutputLox.js';
import type { LoxerOutputStream } from '../types.js';
import { LoxHistory } from './LoxHistory.js';
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

  private getPropsIndentation(lox: OutputLox): number {
    return TIMESTAMP_INDENTATION + lox.module.slicedName.length;
  }

  private getErrorEvent(environment: 'dev' | 'prod', lox: ErrorLox, history: LoxHistory) {
    return { environment, kind: 'error' as const, lox, history: [...history.stack] };
  }

  /** @internal **/
  devErrorOut(errorLox: ErrorLox, history: LoxHistory): void {
    if (this._output) {
      this._output(this.getErrorEvent('dev', errorLox, history));
    } else {
      const lox = ColoredErrorLoxRenderer(errorLox, this.getPropsIndentation(errorLox));
      console.log(
        `${lox.time} ${lox.module}${lox.box}${lox.message}\t${lox.timeConsumption}${lox.props}${lox.stack}${lox.openLogs}`
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
      const lox = ColoredOutputLoxRenderer(outputLox, this.getPropsIndentation(outputLox));
      console.log(
        `${lox.time} ${lox.module}${lox.box}${lox.message}\t${lox.timeConsumption}${lox.props}`
      );
    }
  }

  /** @internal **/
  prodLogOut(outputLox: OutputLox): void {
    this._output?.({ environment: 'prod', kind: 'log', lox: outputLox });
  }
}
