// A zoom-and-pan camera for one piece of content (an image) inside a viewport element.
//
// The content is placed at the viewport's top-left at its natural size and drawn with
// transform: translate(x, y) scale(s), origin 0 0; all the geometry is done here.
//
// - The viewport is meant to fill the window, with the controls floating over it (as in photo viewers):
//   a zoomed image reaches the window's edges instead of being clipped by an inner box. Padding, set in
//   CSS with --zoom-pad-top/right/bottom/left on the viewport, only keeps the fitted image clear of the
//   controls; the more the image is enlarged, the further it may pan towards the true edges.
// - While the pointer is over the viewport (or `wheelArea`), the wheel, with or without Ctrl, mouse or
//   trackpad, zooms around the cursor; the page neither scrolls nor zooms. Nothing is captured elsewhere.
// - Dragging pans 1:1 (pointer capture keeps it going outside), past an edge with a rubber band that
//   springs back on release, and with a little momentum after a flick. Two fingers pinch around their
//   midpoint. A double click zooms in at that point, or back to fit.
//
//   const view = createZoomView(viewport, image, { onChange: state => ... });
//   view.zoomIn() / zoomOut() / fitToView() / resetView() / setZoom(scale, anchor?, animate?)
//   view.panTo(x, y) / getViewportState() / moved() (the last press dragged: ignore its click)
//
// The same file is copied to the composer (composer_site/app/zoomview.js); edit it here.

const NO_PAN = "button, a, input, select, textarea, label, [data-no-pan]";

export function createZoomView(viewport, content, { maxZoom = 8, wheelArea = viewport, onChange = () => {} } = {}) {
  const camera = { scale: 1, x: 0, y: 0, fit: 1, min: 1, max: 1, width: 0, height: 0, contentWidth: 0, contentHeight: 0 };
  const pad = { top: 0, right: 0, bottom: 0, left: 0 };
  let zoomTarget = null;      // { scale, ax, ay }: an eased zoom anchored at viewport point (ax, ay)
  let settle = false;         // easing back inside the pan limits (after a rubber-band drag or a resize)
  let velocity = null;        // { x, y } px per ms: momentum after a flick
  let frame = 0, rect = null, dragged = false, lastTime = 0;
  const pointers = new Map(); // pointerId -> { x, y } (viewport coordinates)
  let gesture = null;         // a pan { x, y, start, samples } or a pinch { mid, distance }

  content.draggable = false;
  Object.assign(content.style, { position: "absolute", left: "0", top: "0", maxWidth: "none", maxHeight: "none", transformOrigin: "0 0", willChange: "transform" });
  Object.assign(viewport.style, { touchAction: "none", overflow: "hidden", userSelect: "none" });

  const clampScale = scale => Math.min(camera.max, Math.max(camera.min, scale));
  const local = event => {
    rect ||= viewport.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  // Where the content may sit on one axis. Fitted (or smaller), it is centred in the padded area; as it
  // grows its edges may move out to the viewport's own edges, never leaving a gap inside them.
  function limits(size, viewSize, before, after) {
    const centred = before + (viewSize - before - after - size) / 2;
    return [Math.min(centred, viewSize - size), Math.max(centred, 0)];
  }
  function bounds() {
    const [minX, maxX] = limits(camera.contentWidth * camera.scale, camera.width, pad.left, pad.right);
    const [minY, maxY] = limits(camera.contentHeight * camera.scale, camera.height, pad.top, pad.bottom);
    return { minX, maxX, minY, maxY };
  }
  function clampPan() {
    const b = bounds();
    camera.x = Math.min(b.maxX, Math.max(b.minX, camera.x));
    camera.y = Math.min(b.maxY, Math.max(b.minY, camera.y));
  }
  // Past a limit, the content follows the pointer less and less (iOS-style rubber band).
  function rubber(value, low, high, size) {
    if (value < low) return low - band(low - value, size);
    if (value > high) return high + band(value - high, size);
    return value;
  }
  const band = (distance, size) => (1 - 1 / (distance * 0.55 / Math.max(size, 1) + 1)) * size;

  // Scale about a viewport point: the content point under (ax, ay) stays under it.
  function zoomAbout(scale, ax, ay) {
    scale = clampScale(scale);
    const cx = (ax - camera.x) / camera.scale, cy = (ay - camera.y) / camera.scale;
    camera.scale = scale;
    camera.x = ax - cx * scale;
    camera.y = ay - cy * scale;
    clampPan();
  }

  function render() {
    content.style.transform = `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.scale})`;
    onChange(getViewportState());
  }

  // One animation frame: eased zoom (a share of the remaining distance in log space, so zooming in and
  // out feel alike), momentum (friction per ms), and settling back inside the limits.
  function step(now) {
    frame = 0;
    const elapsed = Math.min(64, now - (lastTime || now)) || 16;
    lastTime = now;
    let busy = false;
    if (zoomTarget) {
      const ratio = zoomTarget.scale / camera.scale;
      if (Math.abs(Math.log(ratio)) < 0.002) { zoomAbout(zoomTarget.scale, zoomTarget.ax, zoomTarget.ay); zoomTarget = null; }
      else { zoomAbout(camera.scale * ratio ** (1 - 0.65 ** (elapsed / 16)), zoomTarget.ax, zoomTarget.ay); busy = true; }
    }
    if (velocity) {
      camera.x += velocity.x * elapsed;
      camera.y += velocity.y * elapsed;
      const friction = 0.9 ** (elapsed / 16);
      velocity = { x: velocity.x * friction, y: velocity.y * friction };
      const b = bounds();
      if (camera.x < b.minX || camera.x > b.maxX) velocity.x = 0;  // momentum stops at an edge
      if (camera.y < b.minY || camera.y > b.maxY) velocity.y = 0;
      clampPan();
      if (Math.hypot(velocity.x, velocity.y) < 0.02) velocity = null;
      else busy = true;
    }
    if (settle) {
      const b = bounds(), x = Math.min(b.maxX, Math.max(b.minX, camera.x)), y = Math.min(b.maxY, Math.max(b.minY, camera.y));
      const share = 1 - 0.75 ** (elapsed / 16);
      camera.x += (x - camera.x) * share;
      camera.y += (y - camera.y) * share;
      if (Math.abs(x - camera.x) < 0.5 && Math.abs(y - camera.y) < 0.5) { camera.x = x; camera.y = y; settle = false; }
      else busy = true;
    }
    render();
    if (busy) frame = requestAnimationFrame(step);
    else lastTime = 0;
  }
  const schedule = () => { frame ||= requestAnimationFrame(step); };
  const stopMotion = () => { zoomTarget = null; velocity = null; settle = false; };

  const center = () => ({ x: pad.left + (camera.width - pad.left - pad.right) / 2, y: pad.top + (camera.height - pad.top - pad.bottom) / 2 });

  function setZoom(scale, anchor = center(), animate = true) {
    if (!camera.contentWidth) return;
    velocity = null;
    settle = false;
    if (animate) zoomTarget = { scale: clampScale(scale), ax: anchor.x, ay: anchor.y };
    else { zoomTarget = null; zoomAbout(scale, anchor.x, anchor.y); }
    schedule();
  }

  function measure() {
    rect = null;
    const style = getComputedStyle(viewport);
    for (const side of ["top", "right", "bottom", "left"]) pad[side] = parseFloat(style.getPropertyValue(`--zoom-pad-${side}`)) || 0;
    camera.width = viewport.clientWidth;
    camera.height = viewport.clientHeight;
    if (!camera.contentWidth || !camera.width || !camera.height) return false;
    const room = { width: Math.max(1, camera.width - pad.left - pad.right), height: Math.max(1, camera.height - pad.top - pad.bottom) };
    camera.fit = Math.min(1, room.width / camera.contentWidth, room.height / camera.contentHeight);
    camera.min = camera.fit;
    camera.max = Math.max(camera.fit * maxZoom, 1);
    return true;
  }

  function fitToView(animate = false) {
    if (!measure()) return;
    if (animate) return setZoom(camera.fit);
    stopMotion();
    camera.scale = camera.fit;
    clampPan();
    schedule();
  }

  // A new image (or the same one reloaded): fit it once its size is known.
  function load() {
    stopMotion();
    camera.contentWidth = content.naturalWidth || content.offsetWidth;
    camera.contentHeight = content.naturalHeight || content.offsetHeight;
    content.style.width = `${camera.contentWidth}px`;
    content.style.height = `${camera.contentHeight}px`;
    fitToView();
  }
  if (content.complete && content.naturalWidth) load();
  content.addEventListener("load", load);

  // Resizing keeps the point at the centre of the view where it is (and a fitted image fitted).
  new ResizeObserver(() => {
    if (!camera.contentWidth) return;
    const wasFit = camera.scale <= camera.fit + 1e-6;
    const old = center(), cx = (old.x - camera.x) / camera.scale, cy = (old.y - camera.y) / camera.scale;
    if (!measure()) return;
    if (wasFit) { camera.scale = camera.fit; clampPan(); return schedule(); }
    camera.scale = clampScale(camera.scale);
    const now = center();
    camera.x = now.x - cx * camera.scale;
    camera.y = now.y - cy * camera.scale;
    clampPan();
    schedule();
  }).observe(viewport);

  // Wheel: always zoom here (never scroll the page, never zoom the browser). Deltas are normalised:
  // lines and pages become pixels, one mouse notch is capped, and Ctrl + small fractional deltas
  // (trackpad pinch) are scaled up so pinching tracks the fingers.
  wheelArea.addEventListener("wheel", event => {
    event.preventDefault();
    if (!camera.contentWidth || pointers.size) return;
    let delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? camera.height : 1);
    const pinch = event.ctrlKey && Math.abs(delta) < 50 && !Number.isInteger(delta);
    delta = Math.max(-80, Math.min(80, delta));
    const { x, y } = local(event);
    velocity = null;
    settle = false;
    const from = zoomTarget ? zoomTarget.scale : camera.scale;
    zoomTarget = { scale: clampScale(from * Math.exp(-delta * (pinch ? 0.01 : 0.0025))), ax: x, ay: y };
    schedule();
  }, { passive: false });

  viewport.addEventListener("pointerdown", event => {
    if ((event.pointerType === "mouse" && event.button !== 0) || event.target.closest(NO_PAN)) return;
    rect = null;
    pointers.set(event.pointerId, local(event));
    viewport.setPointerCapture(event.pointerId);
    dragged = false;
    stopMotion();
    startGesture(event.timeStamp);
  });
  function startGesture(time) {
    const points = [...pointers.values()];
    // A pan keeps the unconstrained position (`raw`) so the rubber band can be measured from the limits.
    gesture = points.length >= 2
      ? { mid: { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 }, distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) || 1 }
      : points.length ? { x: points[0].x, y: points[0].y, start: { ...points[0] }, raw: { x: camera.x, y: camera.y }, samples: [{ ...points[0], time }] } : null;
  }
  viewport.addEventListener("pointermove", event => {
    if (!pointers.has(event.pointerId) || !gesture) return;
    pointers.set(event.pointerId, local(event));
    const points = [...pointers.values()];
    if (points.length >= 2) {
      const mid = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) || 1;
      camera.x += mid.x - gesture.mid.x;
      camera.y += mid.y - gesture.mid.y;
      zoomAbout(camera.scale * distance / gesture.distance, mid.x, mid.y);
      gesture = { mid, distance };
      dragged = true;
    } else {
      const point = points[0];
      gesture.raw.x += point.x - gesture.x;
      gesture.raw.y += point.y - gesture.y;
      const b = bounds();
      camera.x = rubber(gesture.raw.x, b.minX, b.maxX, camera.width);
      camera.y = rubber(gesture.raw.y, b.minY, b.maxY, camera.height);
      if (!dragged && Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) > 4) {
        dragged = true;
        viewport.classList.add("is-panning");
      }
      gesture.x = point.x;
      gesture.y = point.y;
      gesture.samples.push({ ...point, time: event.timeStamp });
      while (gesture.samples.length > 2 && event.timeStamp - gesture.samples[0].time > 100) gesture.samples.shift();
    }
    schedule();
  });
  const release = event => {
    if (!pointers.delete(event.pointerId)) return;
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    const pan = gesture && !gesture.mid ? gesture : null;
    if (!pointers.size) {
      viewport.classList.remove("is-panning");
      // A flick carries on a little (velocity over the last 100 ms); a slow release just stops.
      const first = pan?.samples[0], last = pan?.samples[pan.samples.length - 1];
      const span = first && last ? last.time - first.time : 0;
      if (dragged && span > 0 && event.type === "pointerup" && event.timeStamp - last.time < 50) {
        const v = { x: (last.x - first.x) / span, y: (last.y - first.y) / span };
        if (Math.hypot(v.x, v.y) > 0.25) velocity = v;
      }
      settle = true;
      schedule();
    }
    startGesture(event.timeStamp);  // a pinch that loses a finger carries on as a pan from the other
  };
  viewport.addEventListener("pointerup", release);
  viewport.addEventListener("pointercancel", release);
  viewport.addEventListener("dragstart", event => event.preventDefault());

  viewport.addEventListener("dblclick", event => {
    if (event.target.closest(NO_PAN) || !camera.contentWidth) return;
    if (camera.scale > camera.fit * 1.05) setZoom(camera.fit);
    else setZoom(camera.fit * 2.5, local(event));
  });

  function getViewportState() {
    return {
      scale: camera.scale, translateX: camera.x, translateY: camera.y,
      minimumScale: camera.min, maximumScale: camera.max, fitScale: camera.fit,
      zoom: camera.scale / camera.fit, maxZoom: camera.max / camera.fit,  // relative to fit (1 = fitted)
      viewportWidth: camera.width, viewportHeight: camera.height,
      contentWidth: camera.contentWidth, contentHeight: camera.contentHeight, padding: { ...pad },
    };
  }

  const aimed = () => (zoomTarget ? zoomTarget.scale : camera.scale);
  return {
    zoomIn: anchor => setZoom(aimed() * 1.5, anchor),
    zoomOut: anchor => setZoom(aimed() / 1.5, anchor),
    fitToView: () => fitToView(true),
    resetView: () => fitToView(true),
    setZoom,
    // Put content point (x, y) at the centre of the view.
    panTo(x, y) { stopMotion(); const c = center(); camera.x = c.x - x * camera.scale; camera.y = c.y - y * camera.scale; clampPan(); schedule(); },
    getViewportState,
    moved: () => dragged,
    load,
  };
}
