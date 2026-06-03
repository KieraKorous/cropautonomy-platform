import { UsersIcon } from "@gaia/ui";

import { ComingSoon } from "../_components/ComingSoon";

export default function TeamPage() {
  return (
    <ComingSoon
      title="Team"
      intro="Everyone working the operation — operators, agronomists, and the crew in the field."
      icon={<UsersIcon size={18} />}
      note="Nobody's clocked in here yet."
    />
  );
}
