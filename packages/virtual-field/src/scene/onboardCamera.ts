import type { PerspectiveCamera } from "three";

// The rover's onboard camera lives as a child of the robot group (so it inherits
// the robot's pose automatically), but the picture-in-picture renderer that draws
// its feed lives in a separate component. This tiny shared holder hands the camera
// from one to the other without prop-drilling or a React context re-render.
export const onboardCameraRef: { current: PerspectiveCamera | null } = {
  current: null
};
