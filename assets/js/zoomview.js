// A zoom-and-pan camera for one piece of content (an image) inside a viewport element.
//
// The content is placed at the viewport's top-left at its natural size and drawn with
// transform: translate(x, y) scale(s), origin 0 0; all the geometry is done here. While the pointer
// is over the viewport, the wheel (with or without Ctrl, mouse or trackpad) zooms around the cursor and
// the page neither scrolls nor zooms; dragging pans (with pointer capture), two fingers pinch around their
// midpoint, and a double click zooms in at that point (or back to fit). Nothing is captured outside it.
//
//   const view = createZoomView(viewport, image, { onChange: state => ... });
//   view.zoomIn() / zoomOut() / fitToView() / resetView() / setZoom(scale, anchor?, animate?)
//   view.panTo(x, y) / getViewportState() / moved() (the last press dragged: ignore its click)
//
// The same file is copied to the composer (composer_site/app/zoomview.js); edit it here.

const NO_PAN = "button, a, input, select, textarea, label, [data-no-pan]";

export function createZoomView(viewport, content, { maxZoom = 8, onChange = () => {} } = {}) {
  const camera = { scale: 1, x: 0, y: 0, fit: 1, min: 1, max: 1, width: 0, height: 0, contentWidth: 0, contentHeight: 0 };
  let target = null;          // { scale, ax, ay }: an eased zoom in progress, anchored at viewport point (ax, ay)
  let frame = 0, rect = null, dragged = false;
  const pointers = new Map(); // pointerId -> { x, y } (viewport coordinates)
  let gesture = null;         // { x, y } last pan point, or { mid, distance } last pinch

  content.draggable = false;
  Object.assign(content.style, { position: "absolute", left: "0", top: "0", maxWidth: "none", maxHeight: "none", transformOrigin: "0 0", willChange: "transform" });
  viewport.style.touchAction = "none";
  viewport.style.overflow = "hidden";
  viewport.style.userSelect = "none";

  const clampScale = scale => Math.min(camera.max, Math.max(camera.min, scale));
  const local = event => {
    rect ||= viewport.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  // Keep the content on screen: a dimension smaller than the viewport is centred, a larger one may not
  // leave a gap at either edge.
  function clampPan() {
    const width = camera.contentWidth * camera.scale, height = camera.contentHeight * camera.scale;
    camera.x = width <= camera.width ? (camera.width - width) / 2 : Math.min(0, Math.max(camera.width - width, camera.x));
    camera.y = height <= camera.height ? (camera.height - height) / 2 : Math.min(0, Math.max(camera.height - height, camera.y));
  }

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
    content.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`;
    onChange(getViewportState());
  }

  // One frame of the eased zoom: cover a share of the remaining distance (in log space, so zooming in
  // and out feel alike), finishing once it is within a hair.
  function step() {
    frame = 0;
    if (target) {
      const ratio = target.scale / camera.scale;
      if (Math.abs(Math.log(ratio)) < 0.002) { zoomAbout(target.scale, target.ax, target.ay); target = null; }
      else { zoomAbout(camera.scale * ratio ** 0.35, target.ax, target.ay); }
    }
    render();
    if (target) frame = requestAnimationFrame(step);
  }
  const schedule = () => { frame ||= requestAnimationFrame(step); };

  function center() { return { x: camera.width / 2, y: camera.height / 2 }; }

  function setZoom(scale, anchor = center(), animate = true) {
    if (!camera.contentWidth) return;
    if (animate) { target = { scale: clampScale(scale), ax: anchor.x, ay: anchor.y }; schedule(); }
    else { target = null; zoomAbout(scale, anchor.x, anchor.y); schedule(); }
  }

  function measure() {
    rect = null;
    camera.width = viewport.clientWidth;
    camera.height = viewport.clientHeight;
    if (!camera.contentWidth || !camera.width || !camera.height) return false;
    camera.fit = Math.min(1, camera.width / camera.contentWidth, camera.height / camera.contentHeight);
    camera.min = camera.fit;
    camera.max = Math.max(camera.fit * maxZoom, 1);
    return true;
  }

  function fitToView(animate = false) {
    if (!measure()) return;
    if (animate) return setZoom(camera.fit);
    target = null;
    camera.scale = camera.fit;
    clampPan();
    schedule();
  }

  // A new image (or the same one reloaded): fit it once its size is known.
  function load() {
    target = null;
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
  viewport.addEventListener("wheel", event => {
    event.preventDefault();
    if (!camera.contentWidth) return;
    let delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? camera.height : 1);
    const pinch = event.ctrlKey && Math.abs(delta) < 50 && !Number.isInteger(delta);
    delta = Math.max(-80, Math.min(80, delta));
    const { x, y } = local(event);
    const from = target ? target.scale : camera.scale;
    target = { scale: clampScale(from * Math.exp(-delta * (pinch ? 0.01 : 0.0025))), ax: x, ay: y };
    schedule();
  }, { passive: false });

  viewport.addEventListener("pointerdown", event => {
    if ((event.pointerType === "mouse" && event.button !== 0) || event.target.closest(NO_PAN)) return;
    rect = null;
    pointers.set(event.pointerId, local(event));
    viewport.setPointerCapture(event.pointerId);
    dragged = false;
    target = null;
    startGesture();
  });
  function startGesture() {
    const points = [...pointers.values()];
    gesture = points.length >= 2
      ? { mid: { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 }, distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) || 1 }
      : points.length ? { x: points[0].x, y: points[0].y, start: { ...points[0] } } : null;
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
      camera.x += point.x - gesture.x;
      camera.y += point.y - gesture.y;
      clampPan();
      if (!dragged && Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) > 4) {
        dragged = true;
        viewport.classList.add("is-panning");
      }
      gesture = { ...gesture, x: point.x, y: point.y };
    }
    schedule();
  });
  const release = event => {
    if (!pointers.delete(event.pointerId)) return;
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    startGesture();  // a pinch that loses a finger carries on as a pan from where that finger is
    if (!pointers.size) viewport.classList.remove("is-panning");
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
      contentWidth: camera.contentWidth, contentHeight: camera.contentHeight,
    };
  }

  return {
    zoomIn: (anchor) => setZoom((target ? target.scale : camera.scale) * 1.5, anchor),
    zoomOut: (anchor) => setZoom((target ? target.scale : camera.scale) / 1.5, anchor),
    fitToView: () => fitToView(true),
    resetView: () => fitToView(true),
    setZoom,
    // Put content point (x, y) at the centre of the view.
    panTo(x, y) { target = null; camera.x = camera.width / 2 - x * camera.scale; camera.y = camera.height / 2 - y * camera.scale; clampPan(); schedule(); },
    getViewportState,
    moved: () => dragged,
    load,
  };
}
