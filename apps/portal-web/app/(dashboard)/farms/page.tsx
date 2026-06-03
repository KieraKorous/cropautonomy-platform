import { FarmIcon } from "@gaia/ui";

import { ComingSoon } from "../_components/ComingSoon";

export default function FarmsPage() {
  return (
    <ComingSoon
      title="Farms"
      intro="Every operation under management, from the home quarter to leased ground."
      icon={<FarmIcon size={18} />}
      note="Still breaking ground on this one."
    />
  );
}
