// Prints today's scheduled run times, for checking what the job will do.
import { todaysPlan, fmt } from './schedule.mjs';
const { plan } = todaysPlan();
console.log(plan.slots.map((s) => `${fmt(s.atMinutes)}${s.done ? ' (done)' : ''}`).join('  '));
