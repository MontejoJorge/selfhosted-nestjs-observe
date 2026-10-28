import { useScopedHref } from '@/lib/scope-hooks';
import type { SearchPatch } from '@/lib/search';
import { Link, NavLink, type LinkProps, type NavLinkProps } from 'react-router';

type ScopedProps = {
  /** A pathname, usually from `paths` in `@/lib/paths`. */
  to: string;
  /** Extra search params for the target page. */
  search?: SearchPatch;
};

/** A <Link> that keeps the global service and time range in the URL. */
export function ScopedLink({
  to,
  search,
  ...props
}: Omit<LinkProps, 'to'> & ScopedProps) {
  const href = useScopedHref();
  return <Link to={href(to, search)} {...props} />;
}

/** A <NavLink> that keeps the global service and time range in the URL. */
export function ScopedNavLink({
  to,
  search,
  ...props
}: Omit<NavLinkProps, 'to'> & ScopedProps) {
  const href = useScopedHref();
  return <NavLink to={href(to, search)} {...props} />;
}
