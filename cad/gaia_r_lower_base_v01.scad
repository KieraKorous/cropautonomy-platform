/*
  GAIA-R Lower Base / Undercarriage Module v0.1
  Purpose: red-circled lower chassis bucket from GAIA-R concept.

  Design intent:
  - Rapid-iteration 3D printed prototype part
  - Rounded rectangular lower tub / bucket
  - Open interior cavity for battery, navigation/control electronics, wiring
  - Side snap/rail interfaces for removable wheel-arm modules
  - Cable pass-through holes near each wheel station
  - Top interface lip for future green main body module
  - Front interface pads for future blue sensor array module

  OpenSCAD controls:
  - Set show_assembly_features = true/false to include visual interface parts
  - F5 preview, F6 render
*/

$fn = 48;

// -----------------------
// Global Parameters (mm)
// -----------------------
base_len        = 360;   // X length front-to-back
base_width      = 210;   // Y width left-to-right
base_height     = 80;    // Z height
wall            = 5;
floor_thick     = 6;
corner_r        = 24;
chamfer         = 6;

// Main opening / bucket
inner_margin_x  = 24;
inner_margin_y  = 24;
inner_depth     = 62;

// Top lip for future green body module
top_lip_h       = 8;
top_lip_w       = 7;
body_snap_count = 4;

// Wheel module interfaces
wheel_stations_x = [-115, 0, 115];
rail_len         = 58;
rail_height      = 18;
rail_depth       = 9;
rail_z           = 28;
rail_y_offset    = base_width/2 + 1;
wire_hole_d      = 16;

// Front sensor module interface
front_yoke_w     = 130;
front_pad_w      = 34;
front_pad_h      = 22;
front_pad_d      = 8;

// Bottom ribs
rib_thick        = 4;
rib_height       = 5;

show_assembly_features = true;
show_cutaway_preview   = false;  // true removes upper half to inspect cavity

// Colors
c_body   = [0.05, 0.06, 0.05];
c_panel  = [0.12, 0.14, 0.12];
c_green  = [0.28, 0.52, 0.12];
c_cut    = [1, 0, 0, 0.25];

// -----------------------
// Helpers
// -----------------------
module rounded_box(size=[100,100,20], r=10) {
    x=size[0]; y=size[1]; z=size[2];
    hull() {
        for (sx=[-1,1], sy=[-1,1])
            translate([sx*(x/2-r), sy*(y/2-r), 0])
                cylinder(h=z, r=r, center=true);
    }
}

module chamfered_rounded_box(size=[100,100,20], r=10, ch=4) {
    // practical visual chamfer: stack three rounded slabs
    hull() {
        translate([0,0,-size[2]/2 + ch/2])
            rounded_box([size[0]-2*ch, size[1]-2*ch, ch], max(r-ch,2));
        translate([0,0,0])
            rounded_box([size[0], size[1], size[2]-2*ch], r);
        translate([0,0,size[2]/2 - ch/2])
            rounded_box([size[0]-2*ch, size[1]-2*ch, ch], max(r-ch,2));
    }
}

module screwless_snap_tab(w=18,d=6,h=8) {
    // Visual snap latch / retention tab. No screw holes by design.
    union() {
        cube([w,d,h], center=true);
        translate([0,d/2, h/2-2])
            rotate([0,90,0])
                cylinder(h=w, r=3, center=true, $fn=24);
    }
}

module dovetail_rail(len=60, depth=9, h=18) {
    // Male rail on lower base side; wheel module has matching female slot.
    // Load is carried by rail faces; snap tab only retains position.
    rotate([90,0,0])
    linear_extrude(height=depth, center=true)
        polygon(points=[
            [-len/2, -h/2],
            [ len/2, -h/2],
            [ len/2-7, h/2],
            [-len/2+7, h/2]
        ]);
}

module wire_pass_hole(side=1, x=0) {
    translate([x, side*(base_width/2-wall/2), rail_z])
        rotate([90,0,0])
            cylinder(h=wall*3, d=wire_hole_d, center=true);
}

module wheel_interface(side=1, x=0) {
    // Dovetail rail, retention latch, and cable port per wheel station.
    translate([x, side*rail_y_offset, rail_z])
        color(c_green) dovetail_rail(rail_len, rail_depth, rail_height);

    // front/back stop blocks around rail
    for (dx=[-rail_len/2-8, rail_len/2+8])
        translate([x+dx, side*(base_width/2+4), rail_z])
            color(c_panel) cube([8, 12, rail_height+8], center=true);

    // Snap latch at top center of each interface
    translate([x, side*(base_width/2+8), rail_z+rail_height/2+7])
        color(c_green) screwless_snap_tab(20, 6, 7);
}

module top_body_interface() {
    // Raised perimeter lip for future green side/body shell to sit over/snap around.
    difference() {
        translate([0,0,base_height/2 + top_lip_h/2 - 1])
            rounded_box([base_len-18, base_width-18, top_lip_h], corner_r-6);
        translate([0,0,base_height/2 + top_lip_h/2])
            rounded_box([base_len-18-2*top_lip_w, base_width-18-2*top_lip_w, top_lip_h+3], corner_r-12);
    }

    // Green snap nubs for future upper body shell
    for (sx=[-1,1], sy=[-1,1])
        translate([sx*(base_len/2-60), sy*(base_width/2-8), base_height/2+top_lip_h+3])
            color(c_green) screwless_snap_tab(16, 8, 6);
}

module front_sensor_interface() {
    // Front is -X. Pads/slots for future blue sensor face module.
    xfront = -base_len/2 - front_pad_d/2 + 2;

    // Lower front mounting shelf / ledge
    translate([-base_len/2+8, 0, 5])
        color(c_panel) cube([14, front_yoke_w, 12], center=true);

    // Left/right side pads
    for (y=[-front_yoke_w/2, front_yoke_w/2])
        translate([xfront, y, 24])
            color(c_green) cube([front_pad_d, front_pad_w, front_pad_h], center=true);

    // Center alignment tongue
    translate([xfront, 0, 45])
        color(c_green) cube([front_pad_d, 46, 12], center=true);
}

module internal_posts_and_ribs() {
    // Soft component standoffs, no screw threading assumed. Use zip ties / snap trays later.
    for (x=[-90,90], y=[-55,55])
        translate([x,y,-base_height/2+floor_thick+9])
            color(c_panel) cylinder(h=18, d=16, center=true);

    // Bottom rib grid for stiffness
    z=-base_height/2 + floor_thick + rib_height/2;
    for (x=[-120,-60,0,60,120])
        translate([x,0,z]) cube([rib_thick, base_width-55, rib_height], center=true);
    for (y=[-60,0,60])
        translate([0,y,z]) cube([base_len-55, rib_thick, rib_height], center=true);

    // Cable channels leading from wheel ports toward center
    for (side=[-1,1], x=wheel_stations_x)
        translate([x, side*55, -base_height/2+floor_thick+rib_height+2])
            color(c_green) cube([18, 52, 4], center=true);
}

module lower_base_shell() {
    difference() {
        color(c_body) chamfered_rounded_box([base_len, base_width, base_height], corner_r, chamfer);

        // Open bucket cavity from top
        translate([0,0,base_height/2 - inner_depth/2 + 2])
            rounded_box([base_len-2*inner_margin_x, base_width-2*inner_margin_y, inner_depth+8], corner_r-14);

        // Wire pass-through holes on both sides at wheel stations
        for (side=[-1,1], x=wheel_stations_x)
            wire_pass_hole(side, x);

        // Front service panel recess
        translate([-base_len/2-1,0,15])
            cube([8, 100, 34], center=true);

        // Optional cutaway for inspection
        if (show_cutaway_preview)
            translate([0, base_width/2, 20])
                cube([base_len+20, base_width, base_height+40], center=true);
    }
}

module service_panel_details() {
    // Decorative/service hatch on front lower base, matching circled under-front visual.
    translate([-base_len/2-1,0,18]) {
        color(c_panel) cube([4, 96, 38], center=true);
        for (z=[10,18,26])
            translate([-3,0,z-18]) cube([3,70,2], center=true);
        translate([-4,0,-12]) cube([3,34,4], center=true);
    }
}

module gaia_lower_base_v01() {
    union() {
        lower_base_shell();
        internal_posts_and_ribs();
        top_body_interface();
        front_sensor_interface();
        service_panel_details();

        if (show_assembly_features) {
            // Six side module interfaces for wheel arms / pods
            for (side=[-1,1], x=wheel_stations_x)
                wheel_interface(side, x);
        }
    }
}

// -----------------------
// Render
// -----------------------
gaia_lower_base_v01();

// Uncomment this to preview a placeholder future upper body footprint.
// color([0.2,0.5,0.1,0.25]) translate([0,0,base_height/2+32]) rounded_box([340,190,44],22);
