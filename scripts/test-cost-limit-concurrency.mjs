// Run only against the disposable Supabase local test stack after db reset.
// Container name is deliberately fixed: this must never target a hosted database.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
const exec = promisify(execFile);
const userId = randomUUID();
async function sql(statement) {
  const { stdout } = await exec("docker", [
    "exec", "supabase_db_singing-coach", "psql", "-U", "postgres", "-d", "postgres",
    "-XAtq", "-v", "ON_ERROR_STOP=1", "-c", statement,
  ]);
  return stdout.trim();
}
const oldLimit = Number(await sql("select free_monthly from public.cost_limit_policy where id"));
if (!Number.isInteger(oldLimit) || oldLimit < 1) throw new Error("Missing local quota policy");
try {
  await sql(`insert into auth.users (id) values ('${userId}'); update public.cost_limit_policy set free_monthly=1 where id`);
  const results = await Promise.all(Array.from({length: 16}, () => sql(
    `set role service_role; select public.consume_cost_operation('${userId}', 'coach')->>'allowed'`,
  )));
  if (results.filter(value => value === "true").length !== 1 || results.filter(value => value === "false").length !== 15) {
    throw new Error(`Expected exactly one accepted request: ${JSON.stringify(results)}`);
  }
  const used = Number(await sql(`select operations from public.cost_usage_buckets where scope='${userId}:month'`));
  if (used !== 1) throw new Error(`Expected one accounted operation, got ${used}`);
  console.log("Concurrent last-allowance test passed: 1 accepted, 15 denied.");
} finally {
  await sql(`update public.cost_limit_policy set free_monthly=${oldLimit} where id; delete from auth.users where id='${userId}'`);
}
