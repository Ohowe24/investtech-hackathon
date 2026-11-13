"use client";

import { useEffect, useRef } from "react";

/*
  The page backdrop: OWN Financial's moving "field" (site-v2/js/stage.js in the
  OWN repo), ported unchanged to one fixed, full-window canvas.

  A black field that light falls across from the right in soft, slowly drifting
  folds, under film grain. Drawn in two passes: the folds are soft, so they are
  drawn at a fraction of the window's size into a texture; a second pass at full
  resolution scales them up and adds grain that moves every frame. At most 30
  frames a second, only while the tab is visible; with reduced motion it draws
  one still frame. Without WebGL the CSS gradient on .field-backdrop shows instead.
*/

const VERT = "attribute vec2 a; varying vec2 v; void main() { v = a * .5 + .5; gl_Position = vec4(a, 0., 1.); }";

/* The light: a folded sheet (a height field of two long waves bent by simplex
   noise, Ashima Arts / Stefan Gustavson, MIT), shaded like satin and faded to
   black toward the left. Same constants as OWN's stage.js. */
const FIELD = `precision highp float;
#define FOLD .12
#define BASE .3
#define GAIN 1.4
#define REACH0 .3
#define REACH1 .74
uniform vec2 res; uniform float t; uniform float lv; varying vec2 v;
vec3 perm(vec3 x) { return mod(((x * 34.) + 1.) * x, 289.); }
float sn(vec2 v) {
  const vec4 C = vec4(.211324865405187, .366025403784439, -.577350269189626, .024390243902439);
  vec2 i = floor(v + dot(v, C.yy)); vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1., 0.) : vec2(0., 1.);
  vec4 x12 = x0.xyxy + C.xxzz; x12.xy -= i1;
  i = mod(i, 289.);
  vec3 p = perm(perm(i.y + vec3(0., i1.y, 1.)) + i.x + vec3(0., i1.x, 1.));
  vec3 m = max(.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.);
  m = m * m; m = m * m;
  vec3 x = 2. * fract(p * C.www) - 1.; vec3 h = abs(x) - .5; vec3 a0 = x - floor(x + .5);
  m *= 1.79284291400159 - .85373472095314 * (a0 * a0 + h * h);
  vec3 g; g.x = a0.x * x0.x + h.x * x0.y; g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130. * dot(m, g);
}
float H(vec2 p, float T) {
  float a = sn(p * .55 + vec2(T * .030, -T * .018));
  float b = sn(p * .45 + vec2(-T * .022, T * .026) + 4.3);
  return .55 * sin(dot(p, vec2(-5.5, 11.)) + 1.8 * a + T * .09)
       + .35 * sin(dot(p, vec2(-2.4, 8.2)) + 1.5 * b - T * .07 + 1.7)
       + .30 * sn(p * 1.1 + vec2(T * .015, T * .01) + 9.1);
}
void main() {
  vec2 p = vec2(v.x * res.x / res.y, v.y);
  float e = 1.5 / res.y;
  float h0 = H(p, t), hx = H(p + vec2(e, 0.), t), hy = H(p + vec2(0., e), t);
  vec3 n = normalize(vec3((h0 - hx) / e * FOLD, (h0 - hy) / e * FOLD, 1.));
  vec3 L = normalize(vec3(.45, .7, .55));
  float dif = max(dot(n, L), 0.);
  float sheen = pow(max(dot(reflect(-L, n), vec3(0., 0., 1.)), 0.), 10.);
  float shade = .5 * dif * dif + .8 * sheen;
  float reach = v.x + .3 * (v.y - .5) + .14 * sn(p * .8 + t * .02);
  float light = smoothstep(REACH0, REACH1, reach);
  float c = .03 + lv * light * (BASE + GAIN * shade);
  gl_FragColor = vec4(vec3(clamp(c, 0., 1.)), 1.);
}`;

/* Full resolution: the light scaled up, and the grain. */
const GRAIN = `precision mediump float;
uniform sampler2D f; uniform vec2 uvs; uniform float seed; uniform float amt; uniform float gs; varying vec2 v;
float h(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
void main() {
  float c = texture2D(f, v * uvs).r;
  vec2 px = floor(gl_FragCoord.xy / gs);
  float g = h(px + seed) + h(px * 1.37 + seed * 1.91) - 1.;
  float k = amt * (.3 + .7 * smoothstep(.0, .35, c));
  gl_FragColor = vec4(vec3(clamp(c + g * k, 0., 1.)), 1.);
}`;

const LOW = 0.3; // the folds' resolution, as a share of the window's CSS size
const T0 = 40; // start part-way into the drift so the first frame is already lit
const SPEED = 1.25; // the drift's pace, as on the OWN site

export default function FieldBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const wrap = canvas?.parentElement;
    if (!canvas || !wrap) return;
    const gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: "low-power" });
    if (!gl) return;
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

    const program = (fs: string) => {
      const p = gl.createProgram();
      if (!p) return null;
      for (const [type, src] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, fs]] as const) {
        const s = gl.createShader(type);
        if (!s) return null;
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) return null;
        gl.attachShader(p, s);
      }
      gl.linkProgram(p);
      return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
    };
    const field = program(FIELD);
    const grain = program(GRAIN);
    if (!field || !grain) return;

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const bind = (p: WebGLProgram) => {
      gl.useProgram(p);
      const a = gl.getAttribLocation(p, "a");
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    };
    const U = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n);
    const uF = { res: U(field, "res"), t: U(field, "t"), lv: U(field, "lv") };
    const uG = { f: U(grain, "f"), uvs: U(grain, "uvs"), seed: U(grain, "seed"), amt: U(grain, "amt"), gs: U(grain, "gs") };

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();

    let w = 0, h = 0, lw = 0, lh = 0, dpr = 1;
    let time = T0, last = 0, raf = 0, frame = 0, drawn = false;

    const size = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const cw = window.innerWidth, ch = window.innerHeight;
      w = Math.max(1, Math.round(cw * dpr));
      h = Math.max(1, Math.round(ch * dpr));
      lw = Math.max(2, Math.round(cw * LOW));
      lh = Math.max(2, Math.round(ch * LOW));
      canvas.width = w;
      canvas.height = h;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, lw, lh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    };

    const draw = () => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, lw, lh);
      bind(field);
      gl.uniform2f(uF.res, lw, lh);
      gl.uniform1f(uF.t, time);
      gl.uniform1f(uF.lv, 1);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, w, h);
      bind(grain);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(uG.f, 0);
      gl.uniform2f(uG.uvs, 1, 1);
      gl.uniform1f(uG.seed, (frame++ % 97) * 13.7);
      gl.uniform1f(uG.amt, 0.075);
      gl.uniform1f(uG.gs, dpr);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (!drawn) {
        drawn = true;
        canvas.classList.add("is-on");
        wrap.classList.add("is-live");
      }
    };

    const running = () => !document.hidden && !reduceMotion;
    const tick = (now: number) => {
      raf = 0;
      if (!running()) return;
      raf = requestAnimationFrame(tick);
      if (now - last < 1000 / 30 - 2) return; // 30 frames a second is plenty for a drift
      time += last ? Math.min(0.1, (now - last) / 1000) * SPEED : 0;
      last = now;
      draw();
    };
    const play = () => {
      if (running() && !raf) {
        last = 0;
        raf = requestAnimationFrame(tick);
      }
    };
    const onResize = () => {
      size();
      draw();
    };

    size();
    draw();
    play();
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", play);
    return () => {
      cancelAnimationFrame(raf);
      raf = 0;
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", play);
    };
  }, []);

  return (
    <div aria-hidden="true" className="field-backdrop">
      <canvas ref={ref} className="field-canvas" />
    </div>
  );
}
