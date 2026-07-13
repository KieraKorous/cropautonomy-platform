// Live rover pose, written by Robot every frame and read by physics/planning code
// that needs the *current* pose (not the throttled telemetry in the store). Used
// by the kinematic collider that pushes obstacles, and by "return home" planning.
// A plain mutable object — no React re-renders on the 60fps hot path.
export const roverPose = { x: 0, z: 0, heading: 0, speed: 0 };
