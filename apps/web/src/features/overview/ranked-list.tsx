import { stretchedLink } from '@/components/data/data-table';
import { Panel, PanelBody, PanelHeader } from '@/components/panel';
import { ScopedLink } from '@/components/scoped-link';
import type { SearchPatch } from '@/lib/search';
import { cn } from '@/lib/utils';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';

export interface RankedItem {
  key: string;
  to: string;
  search?: SearchPatch;
  /** Small chip above the label (e.g. the HTTP method). */
  badge?: ReactNode;
  label: ReactNode;
  value: ReactNode;
  caption?: ReactNode;
}

const PAGE = 4;

/**
 * A panel listing the top items of a ranking ("Performance outliers", "High
 * throughput"): label ..... value, a caption under the value, paged by four.
 */
export function RankedList({
  title,
  measure,
  items,
  empty,
}: {
  title: string;
  /** Right side of the header, e.g. "P95" or "COUNT". */
  measure: string;
  items: readonly RankedItem[];
  empty: ReactNode;
}) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(items.length / PAGE));
  const current = Math.min(page, pages - 1);
  const visible = items.slice(current * PAGE, current * PAGE + PAGE);

  return (
    <Panel>
      <PanelHeader
        title={title}
        aside={<span className="text-[13px] font-medium">{measure}</span>}
      />
      <PanelBody className="flex flex-1 flex-col py-2">
        {visible.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {empty}
          </p>
        ) : (
          <ul className="flex flex-col divide-y">
            {visible.map((item) => (
              <li
                key={item.key}
                className="relative flex min-h-[104px] items-center gap-3 py-4 hover:bg-foreground/[0.02]"
              >
                <div className="flex min-w-0 flex-col items-start gap-1.5">
                  {item.badge}
                  <ScopedLink
                    to={item.to}
                    search={item.search}
                    className={cn(stretchedLink, 'min-w-0 max-w-full')}
                  >
                    {item.label}
                  </ScopedLink>
                </div>
                <span
                  aria-hidden
                  className="min-w-4 flex-1 self-center border-b border-dotted border-foreground/20"
                />
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="font-mono text-sm font-semibold tabular-nums">
                    {item.value}
                  </span>
                  {item.caption ? (
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {item.caption}
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        {pages > 1 ? (
          <nav
            aria-label={`${title} pages`}
            className="mt-auto flex items-center justify-end gap-1 border-t pt-3"
          >
            <PagerButton
              label="Previous page"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              <ChevronLeftIcon className="size-4" />
            </PagerButton>
            {Array.from({ length: pages }, (_, i) => (
              <PagerButton
                key={i}
                label={`Page ${i + 1}`}
                active={i === current}
                onClick={() => setPage(i)}
              >
                {i + 1}
              </PagerButton>
            ))}
            <PagerButton
              label="Next page"
              disabled={current === pages - 1}
              onClick={() => setPage(current + 1)}
            >
              <ChevronRightIcon className="size-4" />
            </PagerButton>
          </nav>
        ) : null}
      </PanelBody>
    </Panel>
  );
}

function PagerButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'grid size-7 place-items-center rounded-md font-mono text-xs text-muted-foreground hover:text-foreground disabled:opacity-40',
        active && 'bg-secondary text-foreground',
      )}
    >
      {children}
    </button>
  );
}
