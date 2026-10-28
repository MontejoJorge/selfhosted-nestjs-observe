import { CodeBlock } from '@/components/data/code-block';
import { RecordList } from '@/components/data/key-value';
import type { WireErrorDto } from '@/lib/api/generated/api';

/** Class, message, stack and tags of a captured error. */
export function ErrorPanel({ error }: { error: WireErrorDto }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-status-error/30 bg-status-error/5 p-3">
      <div className="text-sm">
        {error.cls ? (
          <span className="font-mono font-semibold text-status-error">
            {error.cls}:{' '}
          </span>
        ) : null}
        <span className="break-words">{error.message}</span>
      </div>
      {error.stack ? <CodeBlock>{error.stack}</CodeBlock> : null}
      {error.tags && Object.keys(error.tags).length > 0 ? (
        <RecordList record={error.tags} />
      ) : null}
    </div>
  );
}
