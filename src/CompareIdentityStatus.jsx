import React from 'react';

export default function CompareIdentityStatus({ selectedIds, centreLookup, statusById, onRetry }) {
  return selectedIds.filter((id) => !centreLookup.has(String(id))).map((id) => (
    <p className="fine-print" role={statusById[String(id)] === 'error' ? 'alert' : 'status'} key={id}>
      Centre {id}: {statusById[String(id)] === 'error'
        ? <><span>identity could not be loaded.</span>{' '}<button className="text-btn" onClick={onRetry}>Retry</button></>
        : 'loading centre identity…'}
    </p>
  ));
}
