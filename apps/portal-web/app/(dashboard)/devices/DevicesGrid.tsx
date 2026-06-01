"use client";

import { useState } from "react";
import { PlusIcon } from "@gaia/ui";
import { AddDeviceDialog } from "./AddDeviceDialog";

// Grid-only devices view. Starts empty save for the dashed "add device" tile;
// real device cards will map in alongside it once the devices API exists. The
// add tile opens a placeholder dialog for now (see AddDeviceDialog).
export function DevicesGrid() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group flex aspect-square flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed border-base-content/20 bg-base-100 text-base-content/55 transition-colors hover:border-primary/40 hover:bg-base-content/[0.02] hover:text-primary"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-base-content/[0.04] text-base-content/45 transition-colors group-hover:bg-primary/10 group-hover:text-primary">
            <PlusIcon size={24} />
          </span>
          <span className="text-sm font-medium">Add device</span>
        </button>
      </div>

      <AddDeviceDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
