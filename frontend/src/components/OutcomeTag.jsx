const LABELS = { success: 'Success', retried: 'Retried', failed: 'Failed' };

export default function OutcomeTag({ outcome }) {
  return <span className={`outcome outcome-${outcome}`}>{LABELS[outcome] ?? outcome}</span>;
}
