export function formatReportId(id: number | string) {
  return `AURA-RPT-${String(id).replace(/\D/g, "").padStart(6, "0")}`;
}

export function formatFindingId(scanJobId: number | string, index: number) {
  const job = String(scanJobId).replace(/\D/g, "").padStart(6, "0");
  return `AURA-FND-${job}-${String(index + 1).padStart(3, "0")}`;
}
