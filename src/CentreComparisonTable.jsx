import React from 'react';

const normalized = (value) => String(value ?? '').trim().toLocaleLowerCase('en');
const levelNames = {
  infant: 'Infant', pg: 'Playgroup', n1: 'Nursery 1', n2: 'Nursery 2',
  k1: 'Kindergarten 1', k2: 'Kindergarten 2', student_care: 'Student care'
};
const levelName = (value) => levelNames[normalized(value)] || String(value ?? 'Level not provided');
const money = (value) => `$${Number(value).toFixed(2)}`;
const publishedFee = (value) => {
  if (value == null || String(value).trim() === '') return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
};
const monthKey = (value) => {
  const match = /^(\d{4})-(\d{2})/.exec(String(value ?? '').trim());
  return match ? `${match[1]}-${match[2]}` : '';
};
const monthLabel = (value) => {
  const key = monthKey(value);
  if (!key) return 'Month not provided';
  const [year, month] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-SG', {
    month: 'long', year: 'numeric', timeZone: 'UTC'
  });
};
const statusLabel = (value) => {
  const status = String(value ?? '').trim();
  if (!status) return 'Unknown';
  const key = normalized(status).replace(/\s+/g, ' ');
  if (/^(?:no (?:open |immediate )?vacancy(?: listed)?|not available|unavailable|closed|full)$/.test(key)) return `No vacancy (${status})`;
  if (/^(?:available(?: now)?|open(?: vacancy)?|immediate(?: vacancy| availability)?)$/.test(key)) return key === 'available' || key === 'open' ? 'Available' : `Available (${status})`;
  if (/^(?:waitlist|waiting list|wait listed)$/.test(key)) return key === 'waitlist' || key === 'waiting list' ? 'Waitlist' : `Waitlist (${status})`;
  return `Unknown (${status})`;
};
const yesNo = (value) => value == null ? 'Not provided' : value ? 'Yes' : 'No';
const websiteHref = (url) => {
  const value = String(url ?? '').trim();
  return value && !/^https?:\/\//i.test(value) ? `https://${value}` : value;
};

function matchingFeeRecords(services, profile) {
  if (!profile?.level || !profile?.service || !profile?.citizenship) return [];
  return services.filter((service) =>
    normalized(service?.level) === normalized(profile.level) &&
    normalized(service?.type_of_service) === normalized(profile.service) &&
    normalized(service?.citizenship_type) === normalized(profile.citizenship)
  );
}

function exactVacancies(vacancies, profile) {
  const targetMonth = monthKey(profile?.enrolMonth);
  if (!profile?.level || !targetMonth) return [];
  return vacancies.filter((vacancy) =>
    normalized(vacancy?.level_type) === normalized(profile.level) &&
    monthKey(vacancy?.enrollment_month_year) === targetMonth
  );
}

function ServicesCell({ entry }) {
  if (entry.loading) return <span role="status">Loading care services…</span>;
  if (entry.error) return <span>Care service records unavailable</span>;
  if (!entry.data || !Array.isArray(entry.data.services)) return <span>Care service records unavailable</span>;
  if (!entry.data.services.length) return <span>No care service records published</span>;
  return (
    <ul className="comparison-service-list">
      {entry.data.services.map((service, index) => (
        <li key={service.service_id ?? `${service.level}-${service.type_of_service}-${index}`}>
          {service.type_of_service || 'Care type not provided'} · {levelName(service.level)}
        </li>
      ))}
    </ul>
  );
}

function FeeCell({ entry, profile }) {
  if (entry.loading) return <span role="status">Loading fee records…</span>;
  if (entry.error) return <span>Fee records unavailable</span>;
  if (!entry.data) return <span>Fee records unavailable</span>;

  const services = Array.isArray(entry.data.services) ? entry.data.services : null;
  if (!services) return <span>Fee records unavailable</span>;
  const matchingRecords = matchingFeeRecords(services, profile);
  const matching = matchingRecords.filter((service) => publishedFee(service?.fee) !== null);
  const options = services.map((service) => ({ service, fee: publishedFee(service?.fee) }))
    .filter(({ service, fee }) => fee !== null && !matchingRecords.includes(service));
  const context = `${levelName(profile?.level)} · ${profile?.service || 'Care type not set'} · ${profile?.citizenship || 'Citizenship not set'}`;

  return (
    <div className="comparison-fact">
      {!profile?.level || !profile?.service || !profile?.citizenship
        ? <span>Profile details unavailable</span>
        : matching.length
          ? <><strong>{[...new Set(matching.map((item) => publishedFee(item.fee)))].map(money).join(' / ')}</strong><small>Before subsidy · {context}</small>{matchingRecords.length > matching.length && <small>Another matching fee record has no valid amount</small>}</>
          : matchingRecords.length
            ? <span>Fee amount unavailable for the matching service · {context}</span>
            : <span>No matching fee record published · {context}</span>}
      {options.length > 0 && (
        <details className="comparison-options">
          <summary>Other published fee options ({options.length})</summary>
          <ul>
            {options.map(({ service, fee }, index) => (
              <li key={service.service_id ?? `${service.level}-${service.type_of_service}-${service.citizenship_type}-${index}`}>
                <strong>{money(fee)}</strong> before subsidy · {levelName(service.level)} · {service.type_of_service || 'Care type not provided'} · {service.citizenship_type || 'Citizenship not provided'}
              </li>
            ))}
          </ul>
        </details>
      )}
      {options.length === 0 && <small>No other published fee options</small>}
    </div>
  );
}

function VacancyCell({ entry, profile }) {
  if (entry.loading) return <span role="status">Loading vacancy records…</span>;
  if (entry.error) return <span>Vacancy records unavailable</span>;
  if (!entry.data) return <span>Vacancy records unavailable</span>;

  const vacancies = Array.isArray(entry.data.vacancies) ? entry.data.vacancies : null;
  if (!vacancies) return <span>Vacancy records unavailable</span>;
  const matching = exactVacancies(vacancies, profile);
  const otherVacancies = vacancies.filter((vacancy) => !matching.includes(vacancy));
  const context = `${levelName(profile?.level)} · ${profile?.enrolMonth ? monthLabel(profile.enrolMonth) : 'Enrolment month not set'}`;

  return (
    <div className="comparison-fact">
      {!profile?.level || !monthKey(profile?.enrolMonth)
        ? <span>Profile details unavailable</span>
        : matching.length
          ? matching.map((vacancy, index) => <span className="comparison-vacancy" key={vacancy.record_id ?? index}>{statusLabel(vacancy.vacancy_status)}</span>)
          : <span>No matching vacancy record · {context}</span>}
      {otherVacancies.length > 0 && (
        <details className="comparison-options">
          <summary>Other published vacancy options ({otherVacancies.length})</summary>
          <ul>
            {otherVacancies.map((vacancy, index) => (
              <li key={vacancy.record_id ?? index}>
                {levelName(vacancy.level_type)} · {monthLabel(vacancy.enrollment_month_year)} · {statusLabel(vacancy.vacancy_status)}
              </li>
            ))}
          </ul>
        </details>
      )}
      {otherVacancies.length === 0 && <small>No other published vacancy options</small>}
    </div>
  );
}

function Value({ children }) {
  if (children == null || children === '') return 'Not provided';
  if (typeof children === 'boolean') return children ? 'Yes' : 'No';
  return children;
}

export default function CentreComparisonTable({ centres, details, profile, onRetry, onViewDetails, onRemove }) {
  const rows = [
    { key: 'fee', label: 'Monthly fee', render: (entry) => <FeeCell entry={entry} profile={profile} /> },
    { key: 'vacancies', label: 'Vacancy for your enrolment month', render: (entry) => <VacancyCell entry={entry} profile={profile} /> },
    { key: 'weekday', label: 'Weekday hours', get: (centre) => centre.weekday_full_day_hours },
    { key: 'saturday', label: 'Saturday hours', get: (centre) => centre.saturday_hours },
    { key: 'extended', label: 'Extended hours', get: (centre) => yesNo(centre.extended_operating_hours) },
    { key: 'transport', label: 'Transport provided', get: (centre) => yesNo(centre.transport_provided) },
    { key: 'subsidy', label: 'Government subsidy', get: (centre) => yesNo(centre.gov_subsidy) },
    { key: 'spark', label: 'SPARK certification', get: (centre) => yesNo(centre.spark_certified) },
    { key: 'services', label: 'Care services', render: (entry) => <ServicesCell entry={entry} /> },
    { key: 'food', label: 'Food offered', get: (centre) => centre.food_offered },
    { key: 'languages', label: 'Second languages', get: (centre) => centre.second_languages },
    { key: 'code', label: 'Centre code', get: (centre) => centre.centre_code },
    { key: 'contact', label: 'Contact', render: (entry, centre) => (
      <div className="comparison-contact">
        <Value>{centre.contact}</Value>
        {centre.email && <a href={`mailto:${centre.email}`}>{centre.email}</a>}
        {centre.website_url && <a href={websiteHref(centre.website_url)} target="_blank" rel="noreferrer">Visit website</a>}
      </div>
    ) }
  ];

  return (
    <div className="comparison-table-scroll" role="region" aria-label="Centre comparison table" tabIndex="0">
      <table className="spec-comparison-table">
        <caption className="visually-hidden">Selected centre facts compared side by side</caption>
        <thead>
          <tr>
            <th className="comparison-row-label" scope="col">Centre details</th>
            {centres.map((centre) => {
              const entry = details[String(centre.id)] || {};
              const mergedCentre = entry.data ? { ...centre, ...entry.data, id: centre.id, name: centre.name } : centre;
              return (
                <th className="comparison-centre-heading" scope="col" key={centre.id}>
                  <h3>{centre.name}</h3>
                  <p>{centre.address || 'Address not provided'}{centre.postal ? ` · ${centre.postal}` : ''}</p>
                  {entry.loading && <span className="comparison-load-state" role="status">Loading centre details…</span>}
                  {entry.error && (
                    <div className="comparison-load-error" role="alert">
                      <span>Could not load this centre’s details.</span>
                      <button type="button" onClick={() => onRetry(centre.id)}>Retry</button>
                    </div>
                  )}
                  <div className="comparison-centre-actions">
                    <button type="button" data-centre-id={centre.id} aria-label={`View ${centre.name} details`} onClick={() => onViewDetails(mergedCentre)}>View details</button>
                    <button type="button" onClick={() => onRemove(centre.id)}>Remove</button>
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th className="comparison-row-label" scope="row">{row.label}</th>
              {centres.map((centre) => {
                const entry = details[String(centre.id)] || {};
                const valueCentre = entry.data ? { ...centre, ...entry.data } : centre;
                return (
                  <td key={centre.id}>
                    {row.render ? row.render(entry, valueCentre) : <Value>{row.get(valueCentre)}</Value>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
