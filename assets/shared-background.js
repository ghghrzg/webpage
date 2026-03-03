(function () {
  const bodyControllers = new WeakMap();
  const glowHandlers = new WeakMap();

  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalizeRange(input, fallback) {
    if (!Array.isArray(input) || input.length !== 2) return fallback;
    const min = Number(input[0]);
    const max = Number(input[1]);
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return fallback;
    return [min, max];
  }

  function safeNumber(value, fallback) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function setBodyVar(body, name, value, unit = "") {
    if (value == null) return;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    body.style.setProperty(name, `${numeric}${unit}`);
  }

  function ensureMetaTag(name) {
    let tag = document.head.querySelector(`meta[name="${name}"]`);
    if (!tag) {
      tag = document.createElement("meta");
      tag.setAttribute("name", name);
      document.head.appendChild(tag);
    }
    return tag;
  }

  function firstNonEmpty(...values) {
    for (const value of values) {
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
  }

  function applyThemeColor(body, options) {
    if (!document.head) return;

    const rootStyles = getComputedStyle(document.documentElement);
    const bodyStyles = getComputedStyle(body);
    const themeColor = firstNonEmpty(
      options.themeColor,
      rootStyles.getPropertyValue("--shared-theme-color"),
      rootStyles.getPropertyValue("--shared-bg0"),
      rootStyles.getPropertyValue("--bg0"),
      bodyStyles.getPropertyValue("--shared-theme-color"),
      bodyStyles.getPropertyValue("--shared-bg0"),
      bodyStyles.getPropertyValue("--bg0"),
      "#111730"
    );

    ensureMetaTag("theme-color").setAttribute("content", themeColor);
  }

  function initSharedBackground(options = {}) {
    const body = options.body || document.body;
    if (!body) return null;

    const existing = bodyControllers.get(body);
    if (existing && typeof existing.destroy === "function") {
      existing.destroy();
    }

    const ambient = options.ambient || body.querySelector(".ambient");
    const glow = options.glow || body.querySelector(".cursor-glow");
    const mobileBreakpoint = safeNumber(options.mobileBreakpoint, 899);
    const compactQuery = window.matchMedia(`(max-width: ${mobileBreakpoint}px)`);
    let isCompactViewport = compactQuery.matches;
    let rafId = 0;
    let unbound = false;

    setBodyVar(body, "--shared-overlay-opacity", options.overlayOpacityDesktop);
    setBodyVar(body, "--shared-overlay-opacity-mobile", options.overlayOpacityMobile);
    setBodyVar(body, "--shared-cursor-opacity", options.cursorOpacity);
    setBodyVar(body, "--shared-cursor-size", options.cursorSize, "px");
    applyThemeColor(body, options);

    if (glow && !glowHandlers.has(body)) {
      const onMouseMove = (event) => {
        body.classList.add("moused");
        glow.style.left = `${event.clientX}px`;
        glow.style.top = `${event.clientY}px`;
      };
      window.addEventListener("mousemove", onMouseMove, { passive: true });
      glowHandlers.set(body, onMouseMove);
    }

    if (!ambient) {
      const noAmbientController = {
        destroy() {
          if (unbound) return;
          unbound = true;
        }
      };
      bodyControllers.set(body, noAmbientController);
      return noAmbientController;
    }

    const paletteDesktop = Array.isArray(options.paletteDesktop) && options.paletteDesktop.length > 0
      ? options.paletteDesktop
      : [
          "rgba(124, 255, 209, 0.22)",
          "rgba(255, 184, 77, 0.22)",
          "rgba(120, 166, 255, 0.2)",
          "rgba(255, 122, 217, 0.2)",
          "rgba(102, 193, 255, 0.2)"
        ];
    const paletteMobile = Array.isArray(options.paletteMobile) && options.paletteMobile.length > 0
      ? options.paletteMobile
      : paletteDesktop;

    const spotCountDesktop = Math.max(0, Math.round(safeNumber(options.spotCountDesktop, 12)));
    const spotCountMobile = Math.max(0, Math.round(safeNumber(options.spotCountMobile, spotCountDesktop)));
    const sizeDesktop = normalizeRange(options.sizeDesktop, [70, 200]);
    const sizeMobile = normalizeRange(options.sizeMobile, sizeDesktop);
    const opacityBaseDesktop = normalizeRange(options.opacityBaseDesktop, [0.25, 0.5]);
    const opacityBaseMobile = normalizeRange(options.opacityBaseMobile, opacityBaseDesktop);
    const opacityAmpDesktop = normalizeRange(options.opacityAmpDesktop, [0.12, 0.25]);
    const opacityAmpMobile = normalizeRange(options.opacityAmpMobile, opacityAmpDesktop);
    const speedScaleDesktop = safeNumber(options.speedScaleDesktop, 1);
    const speedScaleMobile = safeNumber(options.speedScaleMobile, 1);
    const opacityFloor = safeNumber(options.opacityFloor, 0.15);
    const opacityCeil = safeNumber(options.opacityCeil, 0.7);

    const spots = [];

    function selectConfig() {
      if (isCompactViewport) {
        return {
          palette: paletteMobile,
          spotCount: spotCountMobile,
          sizeRange: sizeMobile,
          opacityBase: opacityBaseMobile,
          opacityAmp: opacityAmpMobile,
          speedScale: speedScaleMobile
        };
      }

      return {
        palette: paletteDesktop,
        spotCount: spotCountDesktop,
        sizeRange: sizeDesktop,
        opacityBase: opacityBaseDesktop,
        opacityAmp: opacityAmpDesktop,
        speedScale: speedScaleDesktop
      };
    }

    function createSpot() {
      const cfg = selectConfig();
      const el = document.createElement("span");
      const size = rand(cfg.sizeRange[0], cfg.sizeRange[1]);
      const color = cfg.palette[Math.floor(rand(0, cfg.palette.length))];
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.style.background = `radial-gradient(circle, ${color}, transparent 70%)`;
      ambient.appendChild(el);

      return {
        el,
        size,
        speed: rand(0.022, 0.06),
        phase: rand(0, 1),
        xCenter: rand(0.15, 0.85),
        xAmp: rand(0.08, 0.3),
        yBase: rand(0.1, 0.9),
        curve: rand(-0.35, 0.35),
        driftAmpX: rand(0.01, 0.05),
        driftAmpY: rand(0.01, 0.05),
        driftFreqX: rand(0.03, 0.08),
        driftFreqY: rand(0.02, 0.07),
        driftPhaseX: rand(0, Math.PI * 2),
        driftPhaseY: rand(0, Math.PI * 2),
        wobbleAmpX: rand(0.008, 0.03),
        wobbleAmpY: rand(0.008, 0.03),
        wobbleFreqX: rand(0.15, 0.6),
        wobbleFreqY: rand(0.12, 0.55),
        wobblePhaseX: rand(0, Math.PI * 2),
        wobblePhaseY: rand(0, Math.PI * 2),
        shimmerSpeed: rand(0.2, 0.6),
        shimmerPhase: rand(0, Math.PI * 2),
        opacityBase: rand(cfg.opacityBase[0], cfg.opacityBase[1]),
        opacityAmp: rand(cfg.opacityAmp[0], cfg.opacityAmp[1])
      };
    }

    function rebuildSpots() {
      for (const spot of spots) {
        spot.el.remove();
      }
      spots.length = 0;

      const target = selectConfig().spotCount;
      for (let i = 0; i < target; i += 1) {
        spots.push(createSpot());
      }
    }

    function animateSpots(time) {
      if (unbound) return;

      const cfg = selectConfig();
      const t = (time / 1000) * cfg.speedScale;
      const width = window.innerWidth;
      const height = window.innerHeight;

      for (const spot of spots) {
        const theta = (t * spot.speed + spot.phase) * Math.PI * 2;
        const progress = 0.5 - 0.5 * Math.cos(theta);
        const wobbleX = spot.wobbleAmpX * Math.sin(t * spot.wobbleFreqX + spot.wobblePhaseX);
        const wobbleY = spot.wobbleAmpY * Math.sin(t * spot.wobbleFreqY + spot.wobblePhaseY);
        const driftX = spot.driftAmpX * Math.sin(t * spot.driftFreqX + spot.driftPhaseX);
        const driftY = spot.driftAmpY * Math.sin(t * spot.driftFreqY + spot.driftPhaseY);
        const x = spot.xCenter + spot.xAmp * Math.sin(theta) + wobbleX + driftX;
        const parabola = (progress - 0.5) ** 2 * 4;
        const y = clamp(spot.yBase + spot.curve * parabola + wobbleY + driftY, 0.05, 0.95);

        const px = x * width;
        const py = y * height;
        spot.el.style.transform = `translate(${px - spot.size / 2}px, ${py - spot.size / 2}px)`;

        const shimmer = spot.opacityBase + spot.opacityAmp * Math.sin(t * spot.shimmerSpeed + spot.shimmerPhase);
        spot.el.style.opacity = clamp(shimmer, opacityFloor, opacityCeil);
      }

      rafId = requestAnimationFrame(animateSpots);
    }

    function onViewportModeChange(event) {
      isCompactViewport = event.matches;
      rebuildSpots();
    }

    rebuildSpots();
    rafId = requestAnimationFrame(animateSpots);

    if (typeof compactQuery.addEventListener === "function") {
      compactQuery.addEventListener("change", onViewportModeChange);
    } else if (typeof compactQuery.addListener === "function") {
      compactQuery.addListener(onViewportModeChange);
    }

    const controller = {
      rebuild: rebuildSpots,
      destroy() {
        if (unbound) return;
        unbound = true;
        if (rafId) cancelAnimationFrame(rafId);
        for (const spot of spots) {
          spot.el.remove();
        }
        spots.length = 0;
        if (typeof compactQuery.removeEventListener === "function") {
          compactQuery.removeEventListener("change", onViewportModeChange);
        } else if (typeof compactQuery.removeListener === "function") {
          compactQuery.removeListener(onViewportModeChange);
        }
      }
    };

    bodyControllers.set(body, controller);
    return controller;
  }

  window.initSharedBackground = initSharedBackground;
})();
