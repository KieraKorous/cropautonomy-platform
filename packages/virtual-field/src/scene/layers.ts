// Three.js render layer for simulation-only visualisations (LiDAR point cloud,
// range ring, waypoint markers). The orbit/main camera is opted into this layer;
// the rover's onboard camera is not — so the camera feed and captured dataset
// frames stay clean RGB of the world, without debug overlays baked in.
export const VIZ_LAYER = 2;
