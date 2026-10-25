// Filled in by M6.
export function BattleReport({ data }: { data: any }) {
  return <pre className="report-body small">{JSON.stringify(data, null, 2)}</pre>;
}
