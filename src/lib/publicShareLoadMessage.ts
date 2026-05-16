/** User-facing hints when the public RSVP page cannot load the share RPC. */

export function messageForShareRpcError(loadError: { message?: string; code?: string } | null): string {
  const msg = (loadError?.message ?? "").trim();
  const lower = msg.toLowerCase();

  if (lower.includes("failed to fetch") || lower.includes("networkerror")) {
    return "We could not reach the server. Check your internet connection and try again.";
  }
  if (/timeout|timed out|aborted/.test(lower)) {
    return "The request timed out. Please try again in a moment.";
  }
  return "Something went wrong while loading this page. Please try again in a moment.";
}

/** RPC succeeded but returned no payload — disabled / revoked / unknown token */
export function shareUnavailableExplanation(): string {
  return (
    "This invitation link may have been turned off by the host, could not be found, " +
    "or the URL may be incomplete. Ask the host for a current link."
  );
}
