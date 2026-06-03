import { ChecklistIcon } from "@gaia/ui";

import { ComingSoon } from "../_components/ComingSoon";

export default function ScoutListPage() {
  return (
    <ComingSoon
      title="Today's scout list"
      intro="The day's checks and walk-outs, assigned to the crew working each field."
      icon={<ChecklistIcon size={18} />}
      note="Nothing on the board today."
    />
  );
}
