import React from "react";
import { useCommuteSession } from "./commuteSession.js";
import { formatDuration, formatDistance, summarizeCommute } from "./CentreCommute.jsx";
import { isEndpointAuthorizationError } from "./commuteContract.js";

const MODES = [
  ["drive", "Driving"], ["pt", "Public transport"], ["walk", "Walking"], ["cycle", "Cycling"],
];

export default function MatchesCommute({ centres, currentUser, profileId, profile, onSignIn }) {
  const ids = centres.map((centre) => String(centre.id));
  const locationKey = `${profile?.home || ""}:${profile?.work || ""}`;
  const session = useCommuteSession({
    centreId: currentUser && profileId && ids.length ? ids[0] : null,
    comparisonCentreIds: currentUser && profileId ? ids : null,
    profileId: currentUser && profileId ? profileId : null,
    locationKey,
    userId: currentUser?.uid || currentUser?.user_id || currentUser?.id || currentUser?.email || null,
  });
  if (!centres.length) return null;
  const workplaceConfigured = Boolean(profile?.work);
  const authError = isEndpointAuthorizationError(session.error);

  return <section className="matches-commute" aria-label="Estimated travel for top matches">
    <div className="matches-commute-heading">
      <div>
        <h3>Estimated travel</h3>
        <p>Estimated travel time; child drop-off time is excluded. Actual journeys may vary.</p>
      </div>
      <div className="commute-mode-selector" role="group" aria-label="Travel mode">
        {MODES.map(([mode, label]) => <button key={mode} type="button" className={`commute-mode-btn ${session.mode === mode ? "active" : ""}`}
          aria-pressed={session.mode === mode} onClick={() => session.setMode(mode)}>{label}</button>)}
      </div>
    </div>
    <div className="matches-commute-grid">
      {centres.map((centre) => {
        const data = session.setData?.[String(centre.id)] || (String(session.centreId) === String(centre.id) ? session.data : null);
        const summary = summarizeCommute({ data, profileId, mode: session.mode, directBaselineStatus: session.directBaselineStatus, workplaceConfigured });
        const available = workplaceConfigured ? summary.comparisonAvailable : summary.homeTravelSeconds !== null;
        return <div className="matches-commute-item" key={centre.id}>
          <strong>{centre.name}</strong>
          {available && workplaceConfigured ? <>
            <b>{summary.deviationHeadline}</b>
            <span>Via centre {formatDuration(summary.sample.totals.duration_seconds)} · Direct {formatDuration(summary.directRoute.totals.duration_seconds)}</span>
          </> : available ? <>
            <b>{formatDuration(summary.homeTravelSeconds)} home to centre</b>
            <span>{formatDistance(summary.homeTravelDistanceMeters)} · No workplace is configured</span>
          </> : session.setErrors?.[String(centre.id)] ? <span role="status">Travel estimate unavailable. <button type="button" className="matches-commute-retry" onClick={session.retry}>Retry</button></span> : session.loading ? <span role="status">Loading estimate…</span> : <span role="status">
            {workplaceConfigured ? "Extra travel unavailable with the available route data." : "Home to centre estimate unavailable."}
          </span>}
        </div>;
      })}
    </div>
    {!currentUser && <p className="matches-commute-note"><button type="button" onClick={onSignIn}>Sign in</button> to see personalised travel estimates.</p>}
    {authError && <p className="matches-commute-note" role="alert">{session.error.status === 401 ? "Your sign-in has expired." : "This account cannot access personal commute routes."} <button type="button" onClick={onSignIn}>Sign in</button></p>}
    {session.error && !authError && currentUser && <p className="matches-commute-note" role="status">Some travel estimates could not be loaded. Match scores and order are unchanged. <button type="button" onClick={session.retry}>Retry estimates</button></p>}
  </section>;
}
