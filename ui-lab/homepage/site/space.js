/* Self-contained canvas scene. No network, frameworks, or production state. */
window.createSpaceScene = function (canvas, onAvailability) {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) { onAvailability(false); return null; }
  let width = 0, height = 0, ratio = 1, time = 0, last = 0, frame = 0;
  let paused = false, visible = !document.hidden;
  let palette;
  function readPalette() {
    const css = getComputedStyle(document.documentElement);
    const get = key => css.getPropertyValue(key).trim();
    palette = { light:document.documentElement.dataset.theme === "light", bg:get("--bg"), glow:get("--scene-glow"), orbit:get("--scene-orbit"), particle:get("--scene-particle"), bright:get("--scene-bright"), warm:get("--scene-warm"), accent:get("--accent") };
  }
  const control = document.getElementById("orbit-control");
  let tilt = .91, spin = -.54, targetTilt = tilt, targetSpin = spin, drag = null;
  let rotation = 0, velocity = 0;
  let seed = 71;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const points = Array.from({ length: 1550 }, () => ({
    angle: random() * Math.PI * 2,
    radius: .78 + (random() + random() + random()) / 3 * .47,
    depth: (random() + random() + random() - 1.5) * .16,
    size: .35 + random() * 1.05,
    brightness: .25 + random() * .75,
    color: random(),
  }));
  const stars = Array.from({ length: 100 }, () => ({ x: random(), y: random(), size: .3 + random() * .7, phase: random() * 6.28 }));
  function resize() {
    width = canvas.clientWidth; height = canvas.clientHeight;
    ratio = Math.min(devicePixelRatio || 1, 1.75);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (paused || !visible) draw();
  }
  function project(x, y, z, radius, cx, cy) {
    const rotatedX = x * Math.cos(rotation) - y * Math.sin(rotation);
    y = x * Math.sin(rotation) + y * Math.cos(rotation);
    x = rotatedX;
    const yy = y * Math.cos(tilt) - z * Math.sin(tilt);
    const zz = y * Math.sin(tilt) + z * Math.cos(tilt);
    const perspective = 1 + zz * .13;
    return { x: cx + (x * Math.cos(spin) - yy * Math.sin(spin)) * radius * perspective,
      y: cy + (x * Math.sin(spin) + yy * Math.cos(spin)) * radius * perspective, z: zz };
  }
  function draw() {
    if (!width || !height) return;
    const mobile = width < 680;
    const radius = mobile ? Math.min(width * .53, 270) : Math.min(width * .255, height * .44, 450);
    const cx = width * (mobile ? .61 : .745);
    const cy = height * (mobile ? .77 : .5);
    ctx.fillStyle = palette.bg; ctx.fillRect(0, 0, width, height);
    const glow = ctx.createRadialGradient(cx, cy, radius * .1, cx, cy, radius * 1.5);
    glow.addColorStop(0, `rgba(${palette.glow},.04)`);
    glow.addColorStop(.5, `rgba(${palette.glow},.13)`);
    glow.addColorStop(1, `rgba(${palette.glow},0)`);
    ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
    for (const star of stars) {
      const opacity = .14 + (Math.sin(time * .22 + star.phase) + 1) * .06;
      ctx.fillStyle = `rgba(${palette.orbit},${opacity})`;
      ctx.beginPath(); ctx.arc(star.x * width, star.y * height, star.size, 0, Math.PI * 2); ctx.fill();
    }
    // Fine orbit paths anchor the cloud without a busy network of lines.
    for (const ring of [.72, 1.16, 1.38]) {
      ctx.beginPath();
      for (let step = 0; step <= 200; step++) {
        const a = step / 200 * Math.PI * 2;
        const p = project(Math.cos(a) * ring, Math.sin(a) * ring, 0, radius, cx, cy);
        if (!step) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = `rgba(${palette.orbit},${palette.light ? .22 : .13})`;
      ctx.lineWidth = .65; ctx.stroke();
    }
    const projected = [];
    const count = mobile ? 1000 : points.length;
    for (let i = 0; i < count; i++) {
      const point = points[i];
      const a = point.angle + time * (.018 + (1.1 - point.radius) * .012);
      const ripple = Math.sin(a * 3 + time * .12) * .022;
      const p = project(Math.cos(a) * (point.radius + ripple), Math.sin(a) * (point.radius + ripple), point.depth + Math.sin(a * 2 + time * .08) * .045, radius, cx, cy);
      projected.push({ ...p, point });
    }
    projected.sort((a, b) => a.z - b.z);
    for (const { x, y, z, point } of projected) {
      const depth = (z + 1.4) / 2.8;
      const opacity = palette.light ? (.38 + depth * .56) * (.65 + point.brightness * .35) : (.15 + depth * .72) * point.brightness;
      const size = point.size * (.65 + depth * .7) * (mobile ? .9 : 1) * (palette.light ? 1.25 : 1);
      const color = point.color > .92 ? palette.warm : point.color > .55 ? palette.bright : palette.particle;
      const rgb = palette.light ? color.split(",").map(channel => Math.round(Number(channel) * .8)).join(",") : color;
      if (point.size > 1.12 && z > .15) {
        ctx.fillStyle = `rgba(${rgb},${opacity * .1})`; ctx.beginPath(); ctx.arc(x, y, size * 3.8, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = `rgba(${rgb},${opacity})`; ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
    }
    // One small moving highlight gives the eye a calm point to follow.
    const a = time * .095 + .32;
    const beacon = project(Math.cos(a) * 1.38, Math.sin(a) * 1.38, 0, radius, cx, cy);
    ctx.strokeStyle = `rgba(${palette.orbit},.28)`;
    ctx.lineWidth = .8; ctx.beginPath(); ctx.arc(beacon.x, beacon.y, 6, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = palette.accent;ctx.beginPath();ctx.arc(beacon.x, beacon.y, 1.8, 0, Math.PI * 2);ctx.fill();
  }
  function animate(now) {
    frame = 0;
    if (paused || !visible) return;
    if (!last || now - last >= 1000 / 30) {
      const dt = last ? Math.min((now - last) / 1000, .08) : 0;
      time += dt;
      if (!drag) {
        rotation += velocity * dt;
        velocity *= Math.exp(-2.4 * dt);
        const ease = 1 - Math.exp(-5 * dt);
        tilt += (targetTilt - tilt) * ease;
        spin += (targetSpin - spin) * ease;
      }
      last = now;
      draw();
    }
    frame = requestAnimationFrame(animate);
  }
  function schedule() { if (!frame && !paused && visible) { last = 0; frame = requestAnimationFrame(animate); } }
  function setPaused(value) {
    paused = value;
    if (paused) { cancelAnimationFrame(frame); frame = 0; draw(); } else schedule();
    canvas.dataset.motion = paused ? 'paused' : 'running';
  }
  function endDrag() {
    if (!drag) return;
    const id = drag.id;
    if (performance.now() - drag.at > 100 || paused) velocity = 0;
    drag = null;
    control.classList.remove('dragging');
    if (control.hasPointerCapture(id)) control.releasePointerCapture(id);
  }
  // Invert the fixed view to measure a gesture around the disc's own axis.
  function pointerAngle(event) {
    const rect = canvas.getBoundingClientRect();
    const mobile = width < 680;
    const x = event.clientX - rect.left - width * (mobile ? .61 : .745);
    const y = event.clientY - rect.top - height * (mobile ? .77 : .5);
    const localX = x * Math.cos(spin) + y * Math.sin(spin);
    const localY = (-x * Math.sin(spin) + y * Math.cos(spin)) / Math.cos(tilt);
    return Math.hypot(localX, localY) < 40 ? null : Math.atan2(localY, localX);
  }
  control.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || drag) return;
    drag = { id:event.pointerId, angle:pointerAngle(event), at:event.timeStamp };
    velocity = 0;
    targetTilt = tilt; targetSpin = spin;
    control.setPointerCapture(event.pointerId);
    control.classList.add('dragging');
    event.preventDefault();
    control.focus({ preventScroll:true });
  });
  control.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const angle = pointerAngle(event);
    if (angle !== null && drag.angle !== null) {
      const delta = Math.atan2(Math.sin(angle - drag.angle), Math.cos(angle - drag.angle));
      rotation += delta;
      const dt = Math.max((event.timeStamp - drag.at) / 1000, .016);
      velocity = Math.max(-4, Math.min(4, delta / dt));
      draw();
    }
    drag.angle = angle; drag.at = event.timeStamp;
  });
  window.addEventListener('pointermove', event => {
    if (drag || event.buttons || event.pointerType === 'touch' || paused) return;
    targetTilt = .91 + (event.clientY / innerHeight - .5) * .24;
    targetSpin = -.54 + (event.clientX / innerWidth - .5) * .18;
  });
  control.addEventListener('pointerup', endDrag);
  control.addEventListener('pointercancel', endDrag);
  control.addEventListener('lostpointercapture', endDrag);
  window.addEventListener('blur', endDrag);
  control.addEventListener('keydown', event => {
    const steps = { ArrowLeft:-.12, ArrowRight:.12, ArrowUp:-.12, ArrowDown:.12 };
    if (steps[event.key]) { event.preventDefault(); rotation += steps[event.key]; draw(); }
  });
  document.addEventListener('visibilitychange', () => {
    visible = !document.hidden;
    if (!visible) { endDrag(); cancelAnimationFrame(frame); frame = 0; } else schedule();
  });
  const observer = new ResizeObserver(resize); observer.observe(canvas);
  readPalette(); resize();
  return { setPaused, setAppearance() { readPalette(); draw(); } };
};
