/**
 * Read-only: pull jobs with their activities and surface "Lead Received"
 * activities that have Delay Notes filled in — optionally matching a search
 * string (the message Lauren entered).
 *
 * Doubles as grammar discovery: it dumps the raw XML of the first activity-
 * bearing job so we can see exactly how a "Lead Received" activity and its
 * "Delay Notes" field are shaped. That is what the WRITE
 * (MorawareClient.createJobActivity) needs to build, so we can model it on a
 * real record instead of guessing.
 *
 * Nothing is written — this only issues *Query commands.
 *
 * Usage:
 *   MORAWARE_TENANT=asf MORAWARE_USER=... MORAWARE_PASSWORD=... \
 *     [SEARCH="Generated Image on Sterling's Visualizer"] \
 *     [PROCESS=1] [PAGES=3] [PAGE_SIZE=100] \
 *     npx tsx scripts/moraware-find-lead-activities.ts
 */
import { MorawareClient, MorawareError } from "../lib/moraware/client";

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name}. See the header of this file for usage.`);
    process.exit(1);
  }
  return v;
}

async function main(): Promise<void> {
  const client = new MorawareClient({
    tenant: required("MORAWARE_TENANT"),
    userName: required("MORAWARE_USER"),
    password: required("MORAWARE_PASSWORD"),
  });

  const search = (process.env.SEARCH ?? "").trim();
  const processId = process.env.PROCESS ?? "1";
  const pages = Number(process.env.PAGES ?? "3");
  const pageSize = Number(process.env.PAGE_SIZE ?? "100");

  await client.login();
  console.log(
    `Authenticated. Scanning process ${processId}, ${pages} page(s) x ${pageSize}.` +
      (search ? ` Matching Delay Notes containing: "${search}"` : "") +
      "\n",
  );

  let dumpedStructure = false;
  let jobsScanned = 0;
  let jobsWithActivity = 0;
  let matches = 0;

  try {
    for (let page = 0; page < pages; page++) {
      const firstRecord = page * pageSize;
      const xml = await client.query(
        "jobQuery",
        `<filter><process id="${processId}"/></filter>` +
          `<include><name/><account/><address/><creationDate/><jobActivity/></include>` +
          `<pagingSpec firstRecord="${firstRecord}" pageSize="${pageSize}"/>`,
      );

      const jobBlocks = [
        ...xml.matchAll(/<job\b[^>]*\bid="(\d+)"[^>]*>([\s\S]*?)<\/job>/g),
      ];
      if (jobBlocks.length === 0) break;

      for (const m of jobBlocks) {
        jobsScanned++;
        const jobId = m[1];
        const body = m[2];
        const name = body.match(/<name>([^<]*)<\/name>/)?.[1] ?? "(no name)";

        const hasActivity = /<jobActivity/i.test(body) || /<activity\b/i.test(body);
        if (hasActivity) jobsWithActivity++;

        // One-time structure dump so we can see the real grammar.
        if (hasActivity && !dumpedStructure) {
          dumpedStructure = true;
          console.log("=".repeat(72));
          console.log(`RAW activity XML for job #${jobId} (${name}) — grammar sample:`);
          const actBlock =
            body.match(/<jobActivity>[\s\S]*?<\/jobActivity>/i)?.[0] ??
            body.match(/<activity\b[\s\S]*?<\/activity>/i)?.[0] ??
            body;
          console.log(actBlock.slice(0, 4000));
          console.log("=".repeat(72) + "\n");
        }

        // Match: the search string anywhere in this job's activity data.
        if (search && body.toLowerCase().includes(search.toLowerCase())) {
          matches++;
          const idx = body.toLowerCase().indexOf(search.toLowerCase());
          const snippet = body
            .slice(Math.max(0, idx - 80), idx + search.length + 80)
            .replace(/\s+/g, " ")
            .trim();
          console.log(`MATCH job #${jobId}  ${name.slice(0, 40)}`);
          console.log(`   …${snippet}…\n`);
        }
      }

      if (jobBlocks.length < pageSize) break;
    }
  } catch (e) {
    if (e instanceof MorawareError) {
      console.error(`Moraware error [${e.code}] ${e.codeDescription}: ${e.message}`);
    } else {
      console.error(e);
    }
  } finally {
    await client.logout();
  }

  console.log(
    `\nScanned ${jobsScanned} jobs; ${jobsWithActivity} had activities` +
      (search ? `; ${matches} matched "${search}".` : "."),
  );
  if (!dumpedStructure) {
    console.log(
      "No activities came back in the included fields — the field may be named " +
        "differently, or activities may need an activityQuery. Paste this output " +
        "back and we'll adjust the include/query.",
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
