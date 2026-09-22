import { MorawareClient } from "@/lib/moraware/client";
import { LeadIndex, type MatchableLead } from "@/lib/moraware/match";

/**
 * Daily reconcile: stamp "Generated Image on Sterling's Visualizer" onto every
 * Moraware job that matches one of our leads (by email OR address), so Lauren
 * can report on which jobs came from the visualizer and what they were worth —
 * the dollar figure lives on the Moraware job, we only add the marker.
 *
 * Defaults to DRY RUN: it matches and reports what it WOULD tag but writes
 * nothing, until (a) the activityCreate grammar is verified against `asf` (see
 * scripts/moraware-write-probe.ts + MorawareClient.createJobActivity) and (b)
 * MORAWARE_WRITE_ENABLED is set. That lets us confirm the matches are right
 * before a single note is written into a customer's system.
 */

export const VISUALIZER_MARKER = "Generated Image on Sterling's Visualizer";

// Recovered jobQuery grammar (see scripts/moraware-dry-run.ts).
const PROCESS_IDS = ["1", "2", "4", "5", "6", "7"];

export interface ParsedJob {
  jobId: string;
  email: string | null;
  address: string | null;
  /** True if the job already carries our marker (notes/activities included). */
  alreadyTagged: boolean;
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

/**
 * Parse `<job>` blocks from a jobQuery response. Best-effort against the fields
 * we include (jobContact, address, notes/jobActivity). The exact nesting of the
 * contact email inside <jobContact> is not documented, so we take the first
 * email-shaped string in the block; verify against a live response and tighten
 * if needed.
 */
export function parseJobs(xml: string): ParsedJob[] {
  const jobs: ParsedJob[] = [];
  for (const m of xml.matchAll(
    /<job\b[^>]*\bid="(\d+)"[^>]*>([\s\S]*?)<\/job>/g,
  )) {
    const jobId = m[1];
    const body = m[2];
    const email = body.match(EMAIL_RE)?.[0] ?? null;
    const addressBlock = body.match(/<address>([\s\S]*?)<\/address>/)?.[1] ?? "";
    const address = addressBlock.replace(/<[^>]+>/g, " ").trim() || null;
    const alreadyTagged = body
      .toLowerCase()
      .includes(VISUALIZER_MARKER.toLowerCase());
    jobs.push({ jobId, email, address, alreadyTagged });
  }
  return jobs;
}

export interface ReconcileOptions {
  dryRun?: boolean;
  pageSize?: number;
  /** Safety cap on pages per process so one run can't loop unbounded. */
  maxPagesPerProcess?: number;
}

export interface ReconcileSummary {
  jobsScanned: number;
  matched: number;
  alreadyTagged: number;
  tagged: number;
  wouldTag: number;
  errors: number;
  dryRun: boolean;
}

/**
 * Runs the reconcile against an already-logged-in Moraware client. Leads are
 * indexed once; jobs are paged and matched in a single pass each.
 */
export async function reconcileVisualizerNotes(
  client: MorawareClient,
  leads: MatchableLead[],
  opts: ReconcileOptions = {},
): Promise<ReconcileSummary> {
  const dryRun = opts.dryRun ?? true;
  const pageSize = opts.pageSize ?? 100;
  const maxPages = opts.maxPagesPerProcess ?? 200;
  const index = new LeadIndex(leads);

  const summary: ReconcileSummary = {
    jobsScanned: 0,
    matched: 0,
    alreadyTagged: 0,
    tagged: 0,
    wouldTag: 0,
    errors: 0,
    dryRun,
  };

  for (const processId of PROCESS_IDS) {
    let firstRecord = 0;
    for (let page = 0; page < maxPages; page++) {
      let xml: string;
      try {
        xml = await client.query(
          "jobQuery",
          `<filter><process id="${processId}"/></filter>` +
            `<include><address/><jobContact/><notes/><jobActivity/></include>` +
            `<pagingSpec firstRecord="${firstRecord}" pageSize="${pageSize}"/>`,
        );
      } catch {
        summary.errors++;
        break; // this process is unavailable; move on
      }

      const jobs = parseJobs(xml);
      summary.jobsScanned += jobs.length;

      for (const job of jobs) {
        const matched = index.matches(job);
        if (matched.length === 0) continue;
        summary.matched++;

        if (job.alreadyTagged) {
          summary.alreadyTagged++;
          continue;
        }
        if (dryRun) {
          summary.wouldTag++;
          console.log(
            `[moraware-reconcile] would tag job ${job.jobId} (leads: ${matched
              .map((l) => l.id)
              .join(", ")})`,
          );
          continue;
        }
        try {
          await client.createJobActivity(job.jobId, VISUALIZER_MARKER);
          summary.tagged++;
        } catch (e) {
          summary.errors++;
          console.error(
            `[moraware-reconcile] failed to tag job ${job.jobId}:`,
            e instanceof Error ? e.message : e,
          );
        }
      }

      // Advance paging: stop when the server says there are no more records.
      const moreRecords = /moreRecords="true"/i.test(xml);
      if (!moreRecords || jobs.length === 0) break;
      firstRecord += pageSize;
    }
  }

  return summary;
}
