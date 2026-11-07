import React from 'react';
import CentreComparisonTable from '../CentreComparisonTable.jsx';
import { CommuteModeSelector, summarizeCommute } from './CentreCommute.jsx';
import { getProfileCommuteContextKey, useCommuteSession } from './commuteSession.js';
import { isEndpointAuthorizationError } from './commuteContract.js';

/** Owns one ephemeral commute session for the complete comparison selection. */
export default function ComparisonCommuteTable({ selectedIds, centres, details, profile, profileId, currentUser, onSignIn, onRetryDetails, onViewDetails, onRemove }) {
  const ids = selectedIds.map(String);
  const userId = currentUser?.uid || currentUser?.user_id || currentUser?.id || currentUser?.email || null;
  const locationKey = getProfileCommuteContextKey(profile, profileId);
  const session = useCommuteSession({
    centreId: currentUser && profileId && ids.length ? ids[0] : null,
    comparisonCentreIds: currentUser && profileId ? ids : null,
    profileId: currentUser && profileId ? profileId : null,
    locationKey,
    userId,
  });
  const workplaceConfigured = Boolean(profile?.work);
  const summaries = Object.fromEntries(centres.map((centre) => {
    const key = String(centre.id);
    const data = session.setData?.[key] || (String(session.centreId) === key ? session.data : null);
    return [key, summarizeCommute({
      data, profileId, mode: session.mode, directBaselineStatus: session.directBaselineStatus,
      workplaceConfigured, comparisonCompatible: session.comparisonCompatible,
      comparisonSetComplete: session.comparisonSetComplete,
    })];
  }));
  const authError = isEndpointAuthorizationError(session.error);

  return <>
    <section className="matches-commute comparison-commute" aria-label="Comparison travel settings">
      <div className="matches-commute-heading">
        <div><h3>Estimated travel</h3><p>Estimates use the same active travel conditions when verifiable. Travel time excludes child drop-off; actual journeys may vary.</p></div>
        <CommuteModeSelector mode={session.mode} onModeChange={session.setMode} />
      </div>
      {!currentUser && <p className="matches-commute-note" role="status">Sign in to see personalised travel estimates.</p>}
      {authError && <p className="matches-commute-note" role="alert">{session.error.status === 401 ? 'Your sign-in has expired.' : 'This account cannot access personal commute routes.'} <button type="button" onClick={onSignIn}>Sign in</button></p>}
      {session.directBaselineError && !session.error && currentUser && <p className="matches-commute-note" role="status">Extra travel support could not be checked. <button type="button" onClick={session.retry}>Retry estimates</button></p>}
      {session.error && !authError && currentUser && <p className="matches-commute-note" role="status">Some travel estimates could not be loaded. <button type="button" onClick={session.retry}>Retry estimates</button></p>}
      {currentUser && session.loading && !Object.keys(session.setData || {}).length && <p className="matches-commute-note" role="status">Loading travel estimates...</p>}
    </section>
    <CentreComparisonTable centres={centres} details={details} profile={profile}
      travel={{ summaries, errors: session.setErrors, loading: session.loading, retry: session.retry }}
      onRetry={onRetryDetails} onViewDetails={onViewDetails} onRemove={onRemove} />
  </>;
}
