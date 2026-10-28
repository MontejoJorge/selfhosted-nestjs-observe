import { CodeBlock } from '@/components/data/code-block';
import { CopyButton } from '@/components/data/copy';
import { API_URL } from '@/lib/api/client';
import { TriangleAlertIcon } from 'lucide-react';

function Secret({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
      <div className="flex items-center gap-2 rounded-md border bg-background/60 py-1.5 pr-1.5 pl-3">
        <code className="min-w-0 flex-1 font-mono text-sm break-all">
          {value}
        </code>
        <CopyButton value={value} label={`Copy ${label.toLowerCase()}`} />
      </div>
    </div>
  );
}

/**
 * The one-time view of a new API key: the "won't be shown again" warning, the
 * key id and secret with copy buttons, and the agent's `.env` snippet. The
 * caller frames it (dialog header and footer).
 */
export function ApiKeyCredentials({
  keyId,
  secret,
}: {
  keyId: string;
  secret: string;
}) {
  const env = [
    `OBSERVE_APP_KEY=${keyId}`,
    `OBSERVE_APP_SECRET=${secret}`,
    `OBSERVE_ENDPOINT=${API_URL}`,
  ].join('\n');

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <p
        role="alert"
        className="flex items-start gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm"
      >
        <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-primary" />
        <span>
          Copy the secret now. <strong>It won't be shown again</strong>; if you
          lose it, create a new key and revoke this one.
        </span>
      </p>
      <Secret label="Key ID" value={keyId} />
      <Secret label="Secret" value={secret} />
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
            .env
          </span>
          <CopyButton value={env} label="Copy .env snippet" />
        </div>
        <CodeBlock className="whitespace-pre-wrap break-all">{env}</CodeBlock>
      </div>
    </div>
  );
}
