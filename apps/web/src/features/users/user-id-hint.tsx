/** How to get users reported: the agent sends the id from `http.getUserId`. */
export function UserIdHint() {
  return (
    <>
      <p>
        Users show up when the application reports who made each request. Set{' '}
        <code className="text-foreground">http.getUserId</code> in{' '}
        <code className="text-foreground">ObserveModule</code>:
      </p>
      <pre className="mt-2 rounded-md bg-muted px-3 py-2 text-left text-xs text-foreground">
        {`ObserveModule.forRoot({
  http: {
    getUserId: (req) => req.user?.id,
  },
})`}
      </pre>
    </>
  );
}
