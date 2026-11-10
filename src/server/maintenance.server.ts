import { runBudgetAlertCheckForAllUsers } from "#/server/budgets.server";
import { runComplianceSweep } from "#/server/compliance.server";
import { env } from "#/server/env";
import { getLogger } from "#/server/logger";

//
// In-process scheduler for the compliance sweep and the budget alert
// backstop. There is no external job runner — the loop is armed lazily by the
// first request (see start.ts) and re-runs hourly. TEST_MODE never arms it: E2E tests trigger the sweep
// deterministically through /test-run-sweep instead.

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

let armed = false;

export function ensureMaintenanceLoop(): void {
  if (armed) return;
  armed = true;
  if (env.isTestMode) return;

  // Each job catches its own failure so one never skips the other.
  const sweep = () =>
    runComplianceSweep().catch((error) =>
      getLogger().error({ err: error }, "compliance sweep failed"),
    );
  const budgetAlerts = () =>
    runBudgetAlertCheckForAllUsers().catch((error) =>
      getLogger().error(
        { errorName: error instanceof Error ? error.name : "unknown" },
        "budget alert backstop failed",
      ),
    );
  const run = () => Promise.all([sweep(), budgetAlerts()]);
  void run();
  // unref: the timer must never keep a shutting-down server process alive.
  setInterval(run, SWEEP_INTERVAL_MS).unref();
}
