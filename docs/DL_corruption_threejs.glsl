// Dark Lattice — surface corruption function
// Designed for the current hero material where vMonoW, monoHash(), vMonoRough,
// diffuseColor and totalEmissiveRadiance already exist.
// This is SURFACE REWRITING, not geometry damage.

float dlHash2(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float dlNoise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f*f*(3.0-2.0*f);
    float a = dlHash2(i);
    float b = dlHash2(i + vec2(1.0,0.0));
    float c = dlHash2(i + vec2(0.0,1.0));
    float d = dlHash2(i + vec2(1.0,1.0));
    return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}

struct DLCorruption {
    float mask;
    float claw;
    float disease;
    float particle;
};

DLCorruption dlCorruption(vec3 wp, float ang, float sideS) {
    // Hero height in the current monument shader is ~195.
    float h = clamp(wp.y / 195.0, 0.0, 1.0);

    // Normalize the existing face-coordinate "ang" into a stable local horizontal.
    float s = clamp(ang / 3.0 + 0.5, 0.0, 1.0);

    // ONE privileged face only. Flip this if the opposite blade is desired.
    float faceGate = step(0.0, sideS);

    // Diagonal brush path: lower-left to upper-right.
    float center = 0.79 - 0.58 * s;

    float nA = dlNoise2(vec2(s*5.0, h*7.0));
    float nB = dlNoise2(vec2(s*22.0 + 8.0, h*31.0 - 3.0));
    float wobble = (nA-0.5)*0.065 + (nB-0.5)*0.020;

    float taper = smoothstep(0.03,0.14,s) * (1.0-smoothstep(0.86,0.98,s));
    float width = (0.073 + (nA-0.5)*0.032) * taper;

    float d = abs(h - center + wobble);
    float broad = 1.0 - smoothstep(max(width*0.70,0.004), max(width,0.010), d);

    // Disease breakup: clustered, uneven, never a clean painted stripe.
    float cell = dlNoise2(vec2(s*46.0, h*57.0));
    float disease = smoothstep(0.49,0.72, cell + (nB-0.5)*0.24) * broad;

    // Four implied claw currents, fragmented and partly swallowed by the broad stroke.
    float claw = 0.0;
    const float offs[4] = float[4](-0.040, -0.012, 0.020, 0.051);
    const float widths[4] = float[4](0.010, 0.007, 0.012, 0.008);
    for (int i=0; i<4; i++) {
        float br = dlNoise2(vec2(s*(70.0+float(i)*9.0), h*(83.0+float(i)*13.0)));
        float ld = abs((h-center) - offs[i] + (nA-0.5)*0.018 + (br-0.5)*0.010);
        float lane = 1.0 - smoothstep(widths[i]*0.55, widths[i]*1.60, ld);
        lane *= smoothstep(0.43,0.64,br);
        claw = max(claw, lane);
    }
    claw *= broad;

    float mask = clamp(broad*0.72 + claw*0.55 + disease*0.35, 0.0, 1.0);

    // Matrix-particle memory: sparse quantized events, never a glowing slash.
    vec2 q = floor(vec2(s*380.0, h*520.0));
    float ph = dlHash2(q);
    float particle = step(0.982 + (1.0-claw)*0.012, ph) * mask;

    DLCorruption o;
    o.mask = mask * faceGate;
    o.claw = claw * faceGate;
    o.disease = disease * faceGate;
    o.particle = particle * faceGate;
    return o;
}

// ---- Insert inside FRAG_MAP after the normal base material has been established ----
// DLCorruption dlc = dlCorruption(vMonoW, ang, sideS);
//
// // The corruption is primarily ROUGHNESS, not color.
// float corruptRough = clamp(0.44 + 0.30*dlNoise2(vec2(ang*13.0, vMonoW.y*0.19))
//                            + 0.18*dlc.disease - 0.24*dlc.claw,
//                            0.22, 0.94);
// vMonoRough = mix(vMonoRough, corruptRough, dlc.mask);
//
// // Minimal value shift: "surface rewritten", not painted.
// diffuseColor.rgb *= mix(1.0, 0.78 + 0.30*dlNoise2(vec2(ang*29.0, vMonoW.y*0.41)), dlc.mask);
// diffuseColor.rgb += vec3(0.022,0.028,0.036) * dlc.disease * 0.45;
//
// // Tiny cold pinpricks only.
// vMonoEng += dlc.particle * 0.22;
//
// IMPORTANT:
// - no displacement/gouge
// - no orange/red wound
// - no continuous emissive line
// - no clean four-claw decal
// - silhouette must remain unchanged
