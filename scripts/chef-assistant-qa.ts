/**
 * Six-pillar Chef Assistant + Super-Admin QA.
 * Run: npm run test:chef-qa
 */
import {
  formatChefQaReport,
  runChefQaSuite,
} from "../src/lib/chef-qa";

const report = runChefQaSuite();
console.log(formatChefQaReport(report));
console.log(
  `\nSummary: ${report.passed}/${report.total} passed, ${report.failed} failed`,
);

if (report.failed > 0) {
  process.exit(1);
}
