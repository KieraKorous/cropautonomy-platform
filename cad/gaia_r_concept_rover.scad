// GAIA-R Concept Rover - OpenSCAD overall render (no arms)
// Inspired by the uploaded GAIA-R mockup image.
// Units: millimeters
// Tip: Open in OpenSCAD, press F5 for preview or F6 for render.

$fn = 48;

// -----------------------------
// Parameters
// -----------------------------
body_len = 220;
body_w   = 135;
body_h   = 48;
body_z   = 58;

wheel_r = 28;
wheel_w = 18;
wheel_y = body_w/2 + 18;
wheel_z = 30;
front_x = 78;
rear_x  = -78;
mid_x   = 0;

accent = [0.22, 0.38, 0.16];       // deep agricultural green
light_panel = [0.72, 0.73, 0.66];  // warm gray/cream
black = [0.04, 0.045, 0.04];
dark = [0.10, 0.12, 0.10];
rubber = [0.025, 0.025, 0.025];
metal = [0.55, 0.55, 0.50];
solar = [0.02, 0.05, 0.09];
blueblack = [0.02, 0.04, 0.08];
light = [0.9, 0.95, 1.0];

// -----------------------------
// Helpers
// -----------------------------
module rounded_box(size=[10,10,10], r=3, center=true) {
    // Minkowski rounded box. Good for concept renders, heavier for final CAD.
    minkowski() {
        cube([size[0]-2*r, size[1]-2*r, size[2]-2*r], center=center);
        sphere(r=r);
    }
}

module bevel_plate(size=[10,10,2], r=2) {
    rounded_box(size=size, r=r, center=true);
}

module screw_head(x,y,z, radius=2) {
    color(dark)
    translate([x,y,z]) cylinder(h=1.2, r=radius, center=true);
}

// -----------------------------
// Main chassis
// -----------------------------
module lower_chassis() {
    color(dark)
    translate([0,0,body_z])
    rounded_box([body_len, body_w, body_h], r=10);

    // front black face
    color(black)
    translate([body_len/2 + 1, 0, body_z+2])
    rotate([0,90,0])
    rounded_box([body_h-10, body_w-22, 7], r=6);

    // rear vent block
    color(black)
    translate([-body_len/2 - 1, 0, body_z+2])
    rotate([0,90,0])
    rounded_box([body_h-12, body_w-28, 6], r=4);
}

module upper_shell() {
    // cream top shell
    color(light_panel)
    translate([4,0,body_z + body_h/2 + 13])
    rounded_box([body_len-28, body_w-20, 28], r=8);

    // green side armor strips
    color(accent)
    translate([0, body_w/2-7, body_z + body_h/2 + 27])
    rounded_box([body_len-36, 9, 11], r=3);

    color(accent)
    translate([0, -body_w/2+7, body_z + body_h/2 + 27])
    rounded_box([body_len-36, 9, 11], r=3);

    // front top visor
    color(accent)
    translate([body_len/2-28,0,body_z + body_h/2 + 31])
    rounded_box([42, body_w-28, 8], r=4);

    // angled-looking side panels as simple plates
    color(light_panel)
    translate([-35, body_w/2+1, body_z+12])
    rotate([0,0,0])
    rounded_box([92, 5, 30], r=3);

    color(light_panel)
    translate([-35, -body_w/2-1, body_z+12])
    rounded_box([92, 5, 30], r=3);
}

module solar_panel() {
    color(solar)
    translate([6,0,body_z + body_h/2 + 31.5])
    rounded_box([132, 82, 3], r=3);

    // solar grid lines
    for (x=[-50,-25,0,25,50])
        color([0.75,0.82,0.88]) translate([x,0,body_z + body_h/2 + 33.4]) cube([0.8,80,0.8], center=true);
    for (y=[-27,0,27])
        color([0.75,0.82,0.88]) translate([6,y,body_z + body_h/2 + 33.5]) cube([130,0.8,0.8], center=true);
}

module sensor_turret() {
    base_z = body_z + body_h/2 + 40;
    color(accent)
    translate([5,0,base_z]) cylinder(h=8, r=22, center=true);

    color(dark)
    translate([5,0,base_z+8]) cylinder(h=8, r=18, center=true);

    color(light_panel)
    translate([5,0,base_z+16]) cylinder(h=14, r=15, center=true);

    color(black)
    translate([5,0,base_z+24]) cylinder(h=8, r=18, center=true);

    // LiDAR/camera slit
    color(black)
    translate([5,-18,base_z+16]) cube([28,3,7], center=true);
}

module antenna() {
    color(black)
    translate([-78, body_w/2-10, body_z + body_h/2 + 36])
    cylinder(h=82, r=1.2);

    color(black)
    translate([-78, body_w/2-10, body_z + body_h/2 + 119])
    sphere(r=2.5);
}

// -----------------------------
// Front face cameras and lights
// -----------------------------
module front_camera_array() {
    x = body_len/2 + 5;
    z = body_z + 6;

    // central label plate
    color(black)
    translate([x+1,0,body_z-13])
    rotate([0,90,0]) rounded_box([18,70,5], r=3);

    color(light_panel)
    translate([x+4,0,body_z-13])
    rotate([0,90,0]) linear_extrude(height=1) text("GAIA-R", size=12, halign="center", valign="center");

    // cameras
    for (y=[-38,-18,18,38]) {
        color(black)
        translate([x,y,z]) rotate([0,90,0]) cylinder(h=7, r=11, center=true);
        color(blueblack)
        translate([x+4,y,z]) rotate([0,90,0]) cylinder(h=3, r=7, center=true);
        color([0.05,0.08,0.10])
        translate([x+6,y,z]) rotate([0,90,0]) cylinder(h=1.5, r=4, center=true);
    }

    // headlights
    for (y=[-55,55]) {
        color(black)
        translate([x,y,z+8]) rotate([0,90,0]) cylinder(h=7, r=11, center=true);
        color(light)
        translate([x+4,y,z+8]) rotate([0,90,0]) cylinder(h=3, r=7, center=true);
    }

    // lower light bars
    for (y=[-34,34]) {
        color(black)
        translate([x+3,y,body_z-29]) rotate([0,90,0]) rounded_box([9,25,5], r=2);
        for (yy=[-7,0,7])
            color(light) translate([x+7,y+yy,body_z-29]) sphere(r=2.2);
    }
}

// -----------------------------
// Wheels and suspension
// -----------------------------
module tire() {
    rotate([90,0,0])
    difference() {
        color(rubber) cylinder(h=wheel_w, r=wheel_r, center=true);
        cylinder(h=wheel_w+2, r=wheel_r-9, center=true);
    }

    // chunky tread blocks
    for (a=[0:20:340]) {
        rotate([0,a,0])
        translate([0,0,wheel_r])
        color(rubber)
        cube([wheel_w+3, 7, 5], center=true);
    }
}

module wheel_assembly(x,y) {
    translate([x,y,wheel_z]) {
        tire();
        color(accent) rotate([90,0,0]) cylinder(h=wheel_w+3, r=wheel_r-12, center=true);
        color(black)  rotate([90,0,0]) cylinder(h=wheel_w+5, r=wheel_r-18, center=true);
        color(metal)  rotate([90,0,0]) cylinder(h=wheel_w+8, r=5, center=true);
    }
}

module suspension_link(x,y) {
    // simple dark strut from chassis to wheel
    color(dark)
    hull() {
        translate([x, y*0.72, body_z-8]) sphere(r=5);
        translate([x, y*0.93, wheel_z+10]) sphere(r=5);
    }

    color(metal)
    hull() {
        translate([x+14, y*0.68, body_z-12]) sphere(r=3);
        translate([x+8, y*0.92, wheel_z-4]) sphere(r=3);
    }
}

module all_wheels() {
    for (x=[rear_x, mid_x, front_x]) {
        wheel_assembly(x, wheel_y);
        wheel_assembly(x, -wheel_y);
        suspension_link(x, wheel_y);
        suspension_link(x, -wheel_y);
    }
}

// -----------------------------
// Side branding / panels
// -----------------------------
module side_details() {
    color(accent)
    translate([-18, body_w/2+5, body_z+8])
    rounded_box([48, 4, 24], r=2);

    color(light_panel)
    translate([-18, body_w/2+8, body_z+13])
    rotate([90,0,0]) linear_extrude(height=1) text("GAIA-R", size=10, halign="center", valign="center");

    color(black)
    translate([-73, body_w/2+5, body_z+3]) rounded_box([28, 4, 20], r=2);
    color(black)
    translate([-73, -body_w/2-5, body_z+3]) rounded_box([28, 4, 20], r=2);

    // vents
    for (z=[body_z-8, body_z, body_z+8]) {
        color(black) translate([-96, body_w/2+6, z]) cube([22,3,2], center=true);
        color(black) translate([-96, -body_w/2-6, z]) cube([22,3,2], center=true);
    }
}

module top_screws() {
    z = body_z + body_h/2 + 36;
    for (x=[-70,70], y=[-47,47]) screw_head(x,y,z,1.8);
    for (x=[-40,40], y=[-30,30]) screw_head(x,y,z,1.4);
}

// -----------------------------
// Full Rover
// -----------------------------
module gaia_r_concept() {
    all_wheels();
    lower_chassis();
    upper_shell();
    solar_panel();
    sensor_turret();
    antenna();
    front_camera_array();
    side_details();
    top_screws();

    // small underside skid plate
    color(black)
    translate([15,0,body_z-30])
    rounded_box([100,70,10], r=4);
}

// Render
translate([0,0,0]) gaia_r_concept();
