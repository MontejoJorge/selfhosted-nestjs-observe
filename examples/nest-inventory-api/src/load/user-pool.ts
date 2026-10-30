/**
 * Who the generated requests act as, sent in the `x-user-id` header. A few
 * heavy users make most of the calls and the rest show up now and then.
 */
export const USER_POOL = [
  { id: 'usr_ada.lovelace', weight: 30 },
  { id: 'usr_grace.hopper', weight: 20 },
  { id: 'usr_alan.turing', weight: 14 },
  { id: 'usr_linus.t', weight: 8 },
  { id: 'usr_margaret.h', weight: 6 },
  { id: 'usr_ken.thompson', weight: 5 },
  { id: 'usr_barbara.liskov', weight: 4 },
  { id: 'usr_dennis.r', weight: 3 },
  { id: 'usr_katherine.j', weight: 3 },
  { id: 'usr_edsger.d', weight: 2 },
  { id: 'usr_frances.allen', weight: 2 },
  { id: 'usr_donald.knuth', weight: 1 },
  { id: 'usr_radia.p', weight: 1 },
  { id: 'usr_john.mccarthy', weight: 1 },
] as const;

/** Share of requests sent without `x-user-id`, so they stay anonymous. */
export const ANONYMOUS_SHARE = 0.2;
