import { useUsage } from '../auth/UsageContext.jsx';

/**
 * QuotaBadge — a compact freemium indicator showing how many generations remain
 * this month, or a "limit reached" state. Monochrome: fills as the count grows,
 * turns into a solid pill when the limit is hit.
 *
 *   <QuotaBadge />           inline pill
 *   <QuotaBadge block />     wider block variant (for the Account page)
 */
function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export default function QuotaBadge({ block = false }) {
  const { quota, limited } = useUsage();
  const { remaining, limit, count, resetsAt } = quota;
  const used = Math.min(count, limit);
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;

  if (limited) {
    return (
      <div className={`quota quota--limited${block ? ' quota--block' : ''}`}>
        <span className="quota__label">Free limit reached</span>
        {resetsAt && <span className="quota__hint">resets {formatDate(resetsAt)}</span>}
      </div>
    );
  }

  return (
    <div className={`quota${block ? ' quota--block' : ''}`} title={`${remaining} of ${limit} free generations left this month`}>
      <div className="quota__top">
        <span className="quota__label">{remaining} free {remaining === 1 ? 'generation' : 'generations'} left</span>
        {limit > 1 && <span className="quota__count">{used}/{limit}</span>}
      </div>
      {limit > 1 && (
        <div className="quota__bar" aria-hidden="true">
          <span className="quota__bar-fill" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}
