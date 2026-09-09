/**
 * Moraware read-only dry run.
 *
 * Reads only. The client refuses any command that is not a *Query, so this
 * cannot modify the fabricator's system.
 *
 *   MORAWARE_TENANT=asf \
 *   MORAWARE_USER=... \
 *   MORAWARE_PASSWORD=... \
 *   npx tsx scripts/moraware-dry-run.ts
 *
 * ---------------------------------------------------------------------------
 * jobQuery grammar, recovered from the server's own schema validator (Moraware
 * publish no XML schema docs — only .NET SDK docs — so this is written down
 * here to save the next person the discovery):
 *
 *   <jobQuery>
 *     <filter>      one of: processes | account | job | process | purchaseOrders
 *     <include>     any of: creationDate, jobStatus, account, notes, jobActivity,
 *                           jobCustomField, salesperson, name, address,
 *                           totalRecords, process, jobContact, jobPhase
 *     <pagingSpec firstRecord="0" pageSize="30"/>
 *   </jobQuery>
 *
 * Notes:
 *   - <filter> is required; paging is required for filtered job queries.
 *   - <jobCustomField> needs a child: name | dataType | id | allFieldTypes.
 *   - The response carries firstRecord/moreRecords, and totalRecords when
 *     <totalRecords/> is included.
 * ---------------------------------------------------------------------------
 */
import { MorawareClient, MorawareError } from "../lib/moraware/client";

const PROCESS_IDS = ["1", "2", "4", "5", "6", "7"];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. See the header of this file for usage.`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const client = new MorawareClient({
    tenant: required("MORAWARE_TENANT"),
    userName: required("MORAWARE_USER"),
    password: required("MORAWARE_PASSWORD"),
  });

  await client.login();
  console.log("Authenticated.\n");

  try {
    console.log("Jobs per process");
    let grandTotal = 0;
    for (const id of PROCESS_IDS) {
      try {
        const xml = await client.query(
          "jobQuery",
          `<filter><process id="${id}"/></filter>` +
            `<include><totalRecords/></include>` +
            `<pagingSpec firstRecord="0" pageSize="1"/>`,
        );
        const total = Number(xml.match(/totalRecords="(\d+)"/)?.[1] ?? 0);
        grandTotal += total;
        console.log(`  process ${id}: ${total.toLocaleString()}`);
      } catch (err) {
        const e = err as MorawareError;
        console.log(`  process ${id}: unavailable (${e.codeDescription})`);
      }
      await sleep(200);
    }
    console.log(`  total: ${grandTotal.toLocaleString()}\n`);

    console.log("Sample jobs (most recent page of process 1)");
    const xml = await client.query(
      "jobQuery",
      `<filter><process id="1"/></filter>` +
        `<include><name/><jobStatus/><creationDate/><salesperson/><account/>` +
        `<address/><notes/></include>` +
        `<pagingSpec firstRecord="0" pageSize="5"/>`,
    );
    for (const m of xml.matchAll(/<job\b[^>]*\bid="(\d+)"[^>]*>([\s\S]*?)<\/job>/g)) {
      const body = m[2];
      const field = (tag: string) =>
        body.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1] ?? "—";
      console.log(
        `  #${m[1]}  ${field("creationDate")}  ${field("name").slice(0, 44)}`,
      );
    }
  } finally {
    await client.logout();
    console.log("\nSession released.");
  }
}

main().catch((err) => {
  if (err instanceof MorawareError) {
    console.error(`Moraware error [${err.code}] ${err.codeDescription}`);
    console.error(err.message);
  } else {
    console.error(err);
  }
  process.exit(1);
});
