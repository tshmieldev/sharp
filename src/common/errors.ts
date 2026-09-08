import { Data, Effect } from 'effect';

export class OperationError extends Data.TaggedError('OperationError')<{
  message: string;
}> {}

const parseFailure = (error: unknown) =>
  typeof error === 'object' && error !== null && '_tag' in error && error._tag === 'ParseError';

// Schema failures carry the whole expected shape. That is a log, not a message.
export const errorMessage = (error: unknown): string =>
  parseFailure(error)
    ? 'Received data this extension could not read. The provider may have changed its API.'
    : error instanceof Error
      ? error.message
      : String(error);

export function attempt<A>(operation: () => Promise<A>) {
  return Effect.tryPromise({
    try: operation,
    catch: (error) => new OperationError({ message: errorMessage(error) }),
  });
}
