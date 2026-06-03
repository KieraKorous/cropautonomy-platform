import { ChartIcon } from "@gaia/ui";

import { ComingSoon } from "../_components/ComingSoon";

export default function ReportsPage() {
  return (
    <ComingSoon
      title="Reports"
      intro="The weekly read on the operation — what changed, what's trending, what needs a decision."
      icon={<ChartIcon size={18} />}
      note="The ledger's still empty — check back after a few scans."
    />
  );
}
