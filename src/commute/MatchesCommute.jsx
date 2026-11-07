import React from "react";
import { CommuteModeSelector, formatDuration, formatDistance, summarizeCommute } from "./CentreCommute.jsx";
import { getProfileCommuteContextKey, useCommuteSession } from "./commuteSession.js";
import { isEndpointAuthorizationError } from "./commuteContract.js";

export function MatchCommuteSummary({ centre, summary, error, loading, workplaceConfigured, onRetry }) {
  if (summary.locationError) return <p className="match-travel-status" role="alert">{summary.locationError}</p>;
  if (workplaceConfigured && summary.comparisonAvailable) return <div className="match-travel-summary">
    <strong>{summary.deviationHeadline}</strong>
    <span>Via centre {formatDuration(summary.sample.totals.duration_seconds)} · Direct {formatDuration(summary.directRoute.totals.duration_seconds)}</span>
    <small>Times rounded</small>
  </div>;
  if (!workplaceConfigured && summary.homeTravelSeconds !== null) return <div className="match-travel-summary">
    <strong>{formatDuration(summary.homeTravelSeconds)} home to centre</strong>
    <span>{formatDistance(summary.homeTravelDistanceMeters)} · No workplace is configured</span>
    {!summary.homeTravelComparable && <small>Comparison conditions unavailable; this route is shown individually.</small>}
  </div>;

  const centreError = error?.[String(centre.id)];
  return <div className="match-travel-summary" role="status">
    <strong>{centreError ? "Travel estimate could not be loaded." : loading ? "Loading estimate…"
      : summary.comparisonUnavailableMessage || "Home to centre estimate unavailable."}</strong>
    {summary.usableViaLegs.map((leg) => <span key={`${leg.from}-${leg.to}`}>
      {leg.from === "home" ? "Home to centre" : "Centre to workplace"}: {formatDuration(leg.durationSeconds)} ({formatDistance(leg.distanceMeters)})
    </span>)}
    {summary.directTravelSeconds !== null && <span>Direct home to workplace: {formatDuration(summary.directTravelSeconds)} ({formatDistance(summary.directTravelDistanceMeters)})</span>}
    {(centreError || summary.retryable || summary.directBaselineStatus === "error") && <button type="button" className="matches-commute-retry" onClick={onRetry}>Retry estimate</button>}
  </div>;
}

export default function MatchesCommute({ centres, currentUser, profileId, profile, onSignIn, children }) {
  const ids = centres.map((centre) => String(centre.id));
  const locationKey = getProfileCommuteContextKey(profile, profileId);
  const session = useCommuteSession({
    centreId: currentUser && profileId && ids.length ? ids[0] : null,
    comparisonCentreIds: currentUser && profileId ? ids : null,
    profileId: currentUser && profileId ? profileId : null,
    locationKey,
    userId: currentUser?.uid || currentUser?.user_id || currentUser?.id || currentUser?.email || null,
  });
  const workplaceConfigured = Boolean(profile?.work);
  const authError = isEndpointAuthorizationError(session.error);
  const summaryFor = (centre) => {
    const data = session.setData?.[String(centre.id)] ||
      (String(session.centreId) === String(centre.id) ? session.data : null);
    return summarizeCommute({ data, profileId, mode: session.mode,
      directBaselineStatus: session.directBaselineStatus, workplaceConfigured,
      comparisonCompatible: session.comparisonCompatible, comparisonSetComplete: session.comparisonSetComplete });
  };

  return <>
    <section className="matches-commute" aria-label="Travel estimate settings">
      <div className="matches-commute-heading">
        <div><h3>Estimated travel</h3><p>Estimated travel time; child drop-off time is excluded. Actual journeys may vary.</p></div>
        <CommuteModeSelector mode={session.mode} onModeChange={session.setMode} />
      </div>
      {!currentUser && <p className="matches-commute-note"><button type="button" onClick={onSignIn}>Sign in</button> to see personalised travel estimates.</p>}
      {authError && <p className="matches-commute-note" role="alert">{session.error.status === 401 ? "Your sign-in has expired." : "This account cannot access personal commute routes."} <button type="button" onClick={onSignIn}>Sign in</button></p>}
      {session.error && !authError && currentUser && <p className="matches-commute-note" role="status">Some travel estimates could not be loaded. Match scores and order are unchanged. <button type="button" onClick={session.retry}>Retry estimates</button></p>}
    </section>
    {children?.((centre) => ({ summary: summaryFor(centre), loading: session.loading, errors: session.setErrors, retry: session.retry }))}
  </>;
}
