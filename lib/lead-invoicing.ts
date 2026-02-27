export interface MonthlyPeriod {
  startIso: string;
  endIso: string;
}

export function getCurrentMonthPeriod(
  referenceDate: Date = new Date(),
): MonthlyPeriod {
  const start = new Date(
    Date.UTC(
      referenceDate.getUTCFullYear(),
      referenceDate.getUTCMonth(),
      1,
      0,
      0,
      0,
      0,
    ),
  );
  const end = new Date(
    Date.UTC(
      referenceDate.getUTCFullYear(),
      referenceDate.getUTCMonth() + 1,
      1,
      0,
      0,
      0,
      0,
    ),
  );
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export function getPreviousMonthPeriod(
  referenceDate: Date = new Date(),
): MonthlyPeriod {
  const start = new Date(
    Date.UTC(
      referenceDate.getUTCFullYear(),
      referenceDate.getUTCMonth() - 1,
      1,
      0,
      0,
      0,
      0,
    ),
  );
  const end = new Date(
    Date.UTC(
      referenceDate.getUTCFullYear(),
      referenceDate.getUTCMonth(),
      1,
      0,
      0,
      0,
      0,
    ),
  );
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export function buildLeadUsageInvoiceDescription({
  usageCount,
  periodStartIso,
  periodEndIso,
}: {
  usageCount: number;
  periodStartIso: string;
  periodEndIso: string;
}) {
  const start = new Date(periodStartIso).toLocaleDateString();
  const end = new Date(
    new Date(periodEndIso).getTime() - 1,
  ).toLocaleDateString();
  return `Lead usage (${usageCount} leads) for ${start} - ${end}`;
}
