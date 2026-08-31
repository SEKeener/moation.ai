// Emits SQL to load data/exhibits.json into D1. Exhibits are curated in git;
// this just mirrors them into the table for querying.
import { readFileSync } from 'node:fs';
const q = (s) => (s === null || s === undefined ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`);
const rows = JSON.parse(readFileSync(new URL('../data/exhibits.json', import.meta.url)));
console.log('DELETE FROM exhibits;');
for (const e of rows) {
  console.log(`INSERT INTO exhibits (slug,name,actor,kind,from_edge,to_edge,era,summary,source_url) VALUES (${[e.slug, e.name, e.actor, e.kind, e.from_edge, e.to_edge, e.era, e.summary, e.source_url].map(q).join(',')});`);
}
