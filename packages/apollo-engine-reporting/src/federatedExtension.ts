import { GraphQLResolveInfo, GraphQLError } from 'graphql';
import { GraphQLExtension } from 'graphql-extensions';
import { Trace } from 'apollo-engine-reporting-protobuf';

import { EngineReportingTreeBuilder } from './treeBuilder';

interface FederatedTraceV1 {
  d: number;
  t: string; // base64 encoding of protobuf of Trace.Node
}

export class EngineFederatedTracingExtension<TContext = any>
  implements GraphQLExtension<TContext> {
  public trace = new Trace();
  private treeBuilder: EngineReportingTreeBuilder;
  private result?: { durationNs: number; rootNode: Trace.Node };

  public constructor(options: {
    rewriteError?: (err: GraphQLError) => GraphQLError | null;
  }) {
    this.treeBuilder = new EngineReportingTreeBuilder({
      rewriteError: options.rewriteError,
    });
  }

  public requestDidStart(_options: any) {
    // XXX only do things if we get the header
    this.treeBuilder.startTiming();
  }

  public willResolveField(
    _source: any,
    _args: { [argName: string]: any },
    _context: TContext,
    info: GraphQLResolveInfo,
  ): ((error: Error | null, result: any) => void) | void {
    return this.treeBuilder.willResolveField(info);
  }

  public didEncounterErrors(errors: GraphQLError[]) {
    this.treeBuilder.didEncounterErrors(errors);
  }

  public executionDidStart() {
    // It's a little odd that we record the end time after execution rather than
    // at the end of the whole request, but because we need to include our
    // formatted trace in the request itself, we have to record it before the
    // request is over!  It's also odd that we don't do traces for parse or
    // validation errors, but runQuery doesn't currently support that, as
    // format() is only invoked after execution.
    return () => {
      this.result = this.treeBuilder.stopTiming();
    };
  }

  public format(): [string, FederatedTraceV1] {
    if (!this.result) {
      throw Error('format called before end of execution?');
    }
    const encodedUint8Array = Trace.Node.encode(this.result.rootNode).finish();
    const encodedBuffer = Buffer.from(
      encodedUint8Array,
      encodedUint8Array.byteOffset,
      encodedUint8Array.byteLength,
    );
    return [
      'ftv1',
      {
        d: this.result.durationNs,
        t: encodedBuffer.toString('base64'),
      },
    ];
  }
}
