// GAIA-R — Ground rover, mockup-faithful OpenSCAD sketch.
// Six-wheel chassis, roof solar array, front sensor pod, twin manipulator arms,
// LIDAR/comms turret, side leaf glyph and GAIA-R wordmark.
//
// Units: millimetres. Approximate scale ~1:10 of a notional 1.6 m wide rover.
// Render: openscad cad/gaia-r.scad

$fa = 2;
$fs = 0.8;

// ---------- Palette (approximate brand greens + chassis silvers) ----------
C_GREEN_DEEP   = [0.13, 0.32, 0.18];   // dark olive/forest accent
C_GREEN_MID    = [0.28, 0.50, 0.26];   // primary green panels
C_GREEN_LIME   = [0.55, 0.78, 0.32];   // leaf glyph / wheel hub rings
C_SILVER       = [0.78, 0.80, 0.78];   // body shell
C_WHITE        = [0.92, 0.92, 0.90];   // side panel face
C_BLACK        = [0.06, 0.06, 0.07];   // tires, lens housings, antenna
C_TIRE         = [0.10, 0.10, 0.10];
C_GLASS        = [0.10, 0.18, 0.22];   // camera lens glass
C_HEADLIGHT    = [0.95, 0.95, 0.85];   // emissive cool-white
C_SOLAR        = [0.08, 0.14, 0.34];   // solar cell deep blue
C_SOLAR_GRID   = [0.55, 0.62, 0.78];   // cell separators

// ---------- Overall dimensions ----------
BODY_L = 220;   // chassis length
BODY_W = 140;   // chassis width
BODY_H = 70;    // chassis height (without roof)
GROUND = 55;    // ground clearance to chassis underside

WHEEL_R = 38;
WHEEL_W = 30;
WHEEL_HUB_R = 14;

AXLE_FRONT  =  78;
AXLE_MID    =   0;
AXLE_REAR   = -78;
AXLE_Y      = BODY_W / 2 + 8;   // wheels splay outboard of body

// ===========================================================
// Main assembly
// ===========================================================
module gaia_r() {
    chassis();
    roof_solar_array();
    front_sensor_pod();
    side_panels();
    turret_and_antenna();
    manipulator_arms();
    wheels_all();
}

// ===========================================================
// Chassis — boxy body with chamfered nose and slight roof bevel
// ===========================================================
module chassis() {
    // Lower hull (silver)
    color(C_SILVER)
        translate([0, 0, GROUND + BODY_H * 0.25])
            rounded_box(BODY_L, BODY_W, BODY_H * 0.5, r = 6);

    // Upper hull (dark green band)
    color(C_GREEN_DEEP)
        translate([0, 0, GROUND + BODY_H * 0.5])
            rounded_box(BODY_L - 8, BODY_W - 4, BODY_H * 0.10, r = 4);

    // Cab / sensor head block (forward, slightly taller)
    color(C_GREEN_DEEP)
        translate([BODY_L * 0.18, 0, GROUND + BODY_H * 0.55])
            rounded_box(BODY_L * 0.35, BODY_W * 0.96, BODY_H * 0.45, r = 6);

    // Tail equipment bay (rear)
    color(C_SILVER)
        translate([-BODY_L * 0.30, 0, GROUND + BODY_H * 0.60])
            rounded_box(BODY_L * 0.40, BODY_W * 0.88, BODY_H * 0.35, r = 5);

    // Lime running light strip down the body crease
    color(C_GREEN_LIME)
        for (s = [-1, 1])
            translate([0, s * (BODY_W / 2 + 0.5), GROUND + BODY_H * 0.46])
                cube([BODY_L - 30, 1.2, 2], center = true);
}

// ===========================================================
// Roof solar array — tilted dual-panel deck with cell grid
// ===========================================================
module roof_solar_array() {
    roof_z = GROUND + BODY_H + 4;
    panel_l = BODY_L * 0.78;
    panel_w = BODY_W * 0.88;

    // Mounting deck
    color(C_GREEN_DEEP)
        translate([0, 0, roof_z])
            rounded_box(panel_l + 10, panel_w + 8, 6, r = 3);

    // Tilted panel (slight forward rake, like the mockup)
    translate([0, 0, roof_z + 5])
        rotate([0, -4, 0]) {
            color(C_SOLAR)
                translate([0, 0, 2])
                    cube([panel_l, panel_w, 3], center = true);

            // Cell grid lines
            color(C_SOLAR_GRID) {
                cols = 8;
                rows = 4;
                for (i = [1 : cols - 1])
                    translate([-panel_l / 2 + i * panel_l / cols, 0, 3.6])
                        cube([0.6, panel_w - 4, 0.4], center = true);
                for (j = [1 : rows - 1])
                    translate([0, -panel_w / 2 + j * panel_w / rows, 3.6])
                        cube([panel_l - 4, 0.6, 0.4], center = true);
            }

            // Outer panel frame
            color(C_SILVER)
                difference() {
                    translate([0, 0, 2])
                        cube([panel_l + 2, panel_w + 2, 3.4], center = true);
                    translate([0, 0, 2])
                        cube([panel_l - 1, panel_w - 1, 4], center = true);
                }
        }
}

// ===========================================================
// Front sensor pod — twin camera array + headlight strips + center scope
// ===========================================================
module front_sensor_pod() {
    fx = BODY_L * 0.18 + BODY_L * 0.35 / 2;   // front face x of cab block
    fz = GROUND + BODY_H * 0.75;

    // Dark recessed face plate
    color(C_BLACK)
        translate([fx - 1, 0, fz])
            cube([4, BODY_W * 0.85, BODY_H * 0.40], center = true);

    // Twin camera lens housings (the mockup's pair of big eyes)
    for (s = [-1, 1])
        translate([fx + 1, s * 30, fz + 4]) {
            color(C_BLACK)
                rotate([0, 90, 0])
                    cylinder(h = 8, r = 11);
            color(C_GLASS)
                translate([6, 0, 0])
                    rotate([0, 90, 0])
                        cylinder(h = 1.2, r = 9);
            color(C_GREEN_LIME)
                translate([6.6, 0, 0])
                    rotate([0, 90, 0])
                        difference() {
                            cylinder(h = 0.4, r = 9.2);
                            cylinder(h = 0.6, r = 7.8);
                        }
        }

    // Center small scope between the eyes
    translate([fx + 1, 0, fz + 4]) {
        color(C_BLACK) rotate([0, 90, 0]) cylinder(h = 7, r = 5.5);
        color(C_GLASS) translate([5.5, 0, 0]) rotate([0, 90, 0]) cylinder(h = 1, r = 4);
    }

    // Lower headlight strips (the bright DRLs in the mockup)
    for (s = [-1, 1])
        translate([fx + 1.5, s * 30, fz - 16])
            color(C_HEADLIGHT)
                cube([2, 22, 4], center = true);

    // GAIA-R wordmark plate below sensors
    translate([fx + 1.5, 0, fz - 26]) {
        color(C_BLACK) cube([2.2, 64, 10], center = true);
        color(C_WHITE) translate([1.2, 0, 0])
            linear_extrude(0.6)
                text("GAIA-R", size = 6.5, halign = "center", valign = "center",
                     font = "Liberation Sans:style=Bold");
    }
}

// ===========================================================
// Side panels — white face with leaf glyph and secondary GAIA-R mark
// ===========================================================
module side_panels() {
    panel_l = BODY_L * 0.55;
    panel_h = BODY_H * 0.55;
    panel_y = BODY_W / 2 + 0.6;
    panel_z = GROUND + BODY_H * 0.55;
    panel_x = -BODY_L * 0.05;

    for (s = [-1, 1]) {
        // White panel face
        color(C_WHITE)
            translate([panel_x, s * panel_y, panel_z])
                cube([panel_l, 1.6, panel_h], center = true);

        // Angled cut accent at trailing edge (suggests the chamfered panel)
        color(C_GREEN_DEEP)
            translate([panel_x - panel_l / 2 - 6, s * panel_y, panel_z])
                rotate([0, 0, s * 25])
                    cube([14, 1.8, panel_h], center = true);

        // Leaf glyph (simple stylized leaf in lime green)
        translate([panel_x + panel_l * 0.18, s * (panel_y + 0.05), panel_z - 2])
            rotate([90, 0, s * 90])
                leaf_glyph(scale_factor = 0.9);

        // Small GAIA-R sub-mark
        color(C_GREEN_DEEP)
            translate([panel_x - panel_l * 0.20, s * (panel_y + 0.9), panel_z + 6])
                rotate([90, 0, s * 90])
                    linear_extrude(0.6)
                        text("GAIA-R", size = 5,
                             halign = "center", valign = "center",
                             font = "Liberation Sans:style=Bold");
    }
}

module leaf_glyph(scale_factor = 1) {
    color(C_GREEN_LIME)
        scale([scale_factor, scale_factor, 1])
            linear_extrude(0.8)
                union() {
                    // Leaf body: intersection of two offset circles
                    intersection() {
                        translate([-4, 0, 0]) circle(r = 10);
                        translate([ 4, 0, 0]) circle(r = 10);
                    }
                    // Stem
                    translate([-7, -1, 0]) square([6, 2]);
                }
}

// ===========================================================
// Turret + antenna — roof-mounted LIDAR puck and whip antenna
// ===========================================================
module turret_and_antenna() {
    base_z = GROUND + BODY_H + 12;

    // Mast base
    color(C_GREEN_DEEP)
        translate([BODY_L * 0.05, 0, base_z])
            cylinder(h = 8, r = 18);

    // LIDAR puck (dark cylinder with lime accent band)
    color(C_BLACK)
        translate([BODY_L * 0.05, 0, base_z + 8])
            cylinder(h = 14, r = 15);
    color(C_GREEN_LIME)
        translate([BODY_L * 0.05, 0, base_z + 13])
            difference() {
                cylinder(h = 1.5, r = 15.3);
                translate([0, 0, -0.5]) cylinder(h = 2.5, r = 14.2);
            }
    color(C_SILVER)
        translate([BODY_L * 0.05, 0, base_z + 22])
            cylinder(h = 3, r = 14);

    // Whip antenna
    color(C_BLACK)
        translate([BODY_L * 0.05 - 14, 6, base_z + 24])
            cylinder(h = 70, r = 0.8);
    color(C_GREEN_LIME)
        translate([BODY_L * 0.05 - 14, 6, base_z + 24 + 70])
            sphere(r = 1.6);
}

// ===========================================================
// Manipulator arms — twin articulated arms forward of front wheels
// ===========================================================
module manipulator_arms() {
    shoulder_x = BODY_L * 0.30;
    shoulder_z = GROUND + 8;

    for (s = [-1, 1])
        translate([shoulder_x, s * (BODY_W / 2 - 4), shoulder_z])
            rotate([0, 0, s * -10])
                arm_chain(side = s);
}

module arm_chain(side = 1) {
    // Shoulder joint
    color(C_BLACK) sphere(r = 7);
    color(C_GREEN_LIME)
        rotate([90, 0, 0])
            cylinder(h = 2, r = 7.4, center = true);

    // Upper arm — angled down and forward
    rotate([0, 35, 0])
        translate([0, 0, -22]) {
            color(C_SILVER) cylinder(h = 44, r = 4.5);
            // Elbow
            translate([0, 0, 44]) {
                color(C_BLACK) sphere(r = 6);

                // Forearm — angled further down/forward, grippy claw at tip
                rotate([0, 55, 0])
                    translate([0, 0, 0]) {
                        color(C_GREEN_DEEP)
                            cylinder(h = 38, r = 4);
                        translate([0, 0, 38]) {
                            color(C_BLACK) sphere(r = 5);
                            claw();
                        }
                    }
            }
        }
}

module claw() {
    // Two-finger gripper, fingers splayed slightly
    for (a = [-18, 18])
        rotate([a, 0, 0])
            translate([0, 0, 6]) {
                color(C_SILVER) cylinder(h = 14, r = 1.6);
                color(C_BLACK)
                    translate([0, 0, 14])
                        rotate([0, 90, 0])
                            cylinder(h = 4, r = 1.2, center = true);
            }
}

// ===========================================================
// Wheels — 6 large knobby off-road tires with hub + lime ring
// ===========================================================
module wheels_all() {
    for (x = [AXLE_FRONT, AXLE_MID, AXLE_REAR])
        for (s = [-1, 1])
            translate([x, s * AXLE_Y, GROUND - 8])
                rotate([90, 0, 0])
                    wheel();
}

module wheel() {
    // Tire body
    color(C_TIRE)
        rotate_extrude($fn = 60)
            translate([WHEEL_R - 6, 0])
                square([6, WHEEL_W], center = true);
    // Tire sidewall
    color(C_TIRE)
        cylinder(h = WHEEL_W, r = WHEEL_R - 2, center = true);

    // Tread lugs
    color(C_BLACK)
        for (a = [0 : 360 / 14 : 359])
            rotate([0, 0, a])
                translate([WHEEL_R - 1, 0, 0])
                    cube([4, 7, WHEEL_W - 2], center = true);

    // Hub (silver)
    color(C_SILVER)
        cylinder(h = WHEEL_W + 1, r = WHEEL_HUB_R, center = true);

    // Lime accent ring on hub face
    for (s = [-1, 1])
        color(C_GREEN_LIME)
            translate([0, 0, s * (WHEEL_W / 2 + 0.4)])
                difference() {
                    cylinder(h = 0.8, r = WHEEL_HUB_R - 1);
                    translate([0, 0, -0.1])
                        cylinder(h = 1.0, r = WHEEL_HUB_R - 4);
                }

    // Leaf glyph on hub face
    for (s = [-1, 1])
        translate([0, 0, s * (WHEEL_W / 2 + 1.0)])
            rotate([s < 0 ? 180 : 0, 0, 0])
                leaf_glyph(scale_factor = 0.45);
}

// ===========================================================
// Utilities
// ===========================================================
module rounded_box(l, w, h, r = 3) {
    hull() {
        for (sx = [-1, 1]) for (sy = [-1, 1]) for (sz = [-1, 1])
            translate([sx * (l / 2 - r), sy * (w / 2 - r), sz * (h / 2 - r)])
                sphere(r = r);
    }
}

// ===========================================================
gaia_r();
