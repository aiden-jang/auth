/*
 * Reads the shared `aidenjang_events` dataset every app writes to.
 *
 *   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... pnpm run events [days]
 *
 * The token needs Account Analytics:Read. Analytics Engine keeps 90 days, so anything older
 * than that is gone and no query here can recover it.
 */
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!account || !token) {
  console.error('Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (Account Analytics:Read).');
  process.exit(1);
}

const days = Number(process.argv[2] ?? 7);
if (!Number.isInteger(days) || days < 1 || days > 90) {
  console.error(`Days must be 1-90 (Analytics Engine keeps 90). Got: ${process.argv[2]}`);
  process.exit(1);
}

async function run(sql) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/analytics_engine/sql`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: sql },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text).data ?? [];
}

const since = `timestamp >= NOW() - INTERVAL '${days}' DAY`;

const byApp = await run(
  `SELECT blob1 AS app, SUM(_sample_interval * double1) AS events FROM aidenjang_events
   WHERE ${since} GROUP BY app ORDER BY events DESC`,
);
const byEvent = await run(
  `SELECT blob1 AS app, blob2 AS event, blob3 AS variant, SUM(_sample_interval * double1) AS n
   FROM aidenjang_events WHERE ${since} GROUP BY app, event, variant ORDER BY n DESC LIMIT 60`,
);

if (byApp.length === 0) {
  console.log(
    `No events in the last ${days} day(s). Nothing has been deployed with a binding yet,`,
  );
  console.log('or nobody has used the apps in that window.');
  process.exit(0);
}

console.log(`\nLast ${days} day(s), by app:`);
for (const r of byApp) console.log(`  ${String(r.app).padEnd(18)} ${r.events}`);

console.log('\nBy event:');
for (const r of byEvent) {
  const label = r.variant ? `${r.event} (${r.variant})` : r.event;
  console.log(`  ${String(r.app).padEnd(18)} ${String(label).padEnd(34)} ${r.n}`);
}
