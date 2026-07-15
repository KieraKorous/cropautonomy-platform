export interface RoverRuntime {
  x: number;
  z: number;
  heading: number;
  speed: number;
}

// Live pose of the *active* rover, written every frame and read by the sensors,
// onboard camera, physics collider, drag, and planning code that follow whichever
// rover is selected. A plain mutable object — no React re-renders on the hot path.
export const roverPose: RoverRuntime = { x: 0, z: 0, heading: 0, speed: 0 };

// Live pose of every rover in the fleet, keyed by index. Each Rover registers its
// runtime here so the others can avoid it, and so each gets its own physics
// collider. The active rover also mirrors into `roverPose` above.
export const roverRuntimes = new Map<number, RoverRuntime>();

// Where the rover is being dragged to (world X/Z), written by the drag-catcher
// plane's pointer-move and read by the Robot while `dragging` is set in the store.
export const dragTarget = { x: 0, z: 0 };
