import { CodeBlock } from '@/components/data/code-block';
import { RecordList } from '@/components/data/key-value';
import { Panel, PanelBody, PanelHeader } from '@/components/panel';
import type { WireErrorDto } from '@/lib/api/generated/api';
import { CircleAlertIcon } from 'lucide-react';

/** Class, message and stack of a captured error, without a frame. */
export function ErrorDetails({ error }: { error: WireErrorDto }) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <p className="font-mono text-sm leading-relaxed break-words">
        {error.cls ? (
          <span className="font-semibold text-primary">{error.cls} </span>
        ) : null}
        {error.message}
      </p>
      {error.stack ? <CodeBlock>{error.stack}</CodeBlock> : null}
      {error.tags && Object.keys(error.tags).length > 0 ? (
        <RecordList record={error.tags} />
      ) : null}
    </div>
  );
}

/** The "Error" panel of a request or job detail. */
export function ErrorPanel({ error }: { error: WireErrorDto }) {
  return (
    <Panel>
      <PanelHeader
        title={
          <span className="inline-flex items-center gap-2">
            <CircleAlertIcon className="size-4 fill-primary text-card" />
            Error
          </span>
        }
      />
      <PanelBody>
        <ErrorDetails error={error} />
      </PanelBody>
    </Panel>
  );
}
