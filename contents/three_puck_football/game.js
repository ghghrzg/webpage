(() => {
  const FIELD_WIDTH = 1900;
  const FIELD_HEIGHT = 560;
  const PUCK_RADIUS = 18;
  const GOAL_DEPTH = 210;
  const GOAL_HEIGHT = 246;
  const MAX_PULL = 240;
  const MIN_PULL = 16;
  const MAX_SPEED = 832;
  const MIN_SPEED = 255;
  const WALL_BOUNCE = 0.78;
  const COLLISION_BOUNCE = 0.34;
  const FRICTION_PER_FRAME = 0.972;
  const STOP_SPEED = 28;
  const INVALID_PENALTY_MS = 3000;
  const COLLISION_PENALTY_MS = 2000;
  const ACCURACY_CYCLE_MS = 900;
  const MAX_INACCURACY_DEG = 30;
  const MAX_INACCURACY_STRENGTH = 0.15;

  const INITIAL_PUCKS = [
    { id: 0, label: "A", x: 350, y: 190 },
    { id: 1, label: "B", x: 350, y: 370 },
    { id: 2, label: "C", x: 520, y: 280 }
  ];

  const state = {
    pucks: [],
    drag: null,
    shotInFlight: false,
    finished: false,
    shots: 0,
    penaltyMs: 0,
    timerStartedAt: null,
    timerElapsedMs: 0,
    timerFrame: 0,
    aimFrame: 0,
    elements: {}
  };

  function initGame() {
    state.elements.field = document.getElementById("game-field");
    if (!state.elements.field) return;

    state.elements.timer = document.getElementById("run-timer");
    state.elements.shotCount = document.getElementById("shot-count");
    state.elements.penaltyTime = document.getElementById("penalty-time");
    state.elements.statusCard = document.getElementById("status-card");
    state.elements.statusMessage = document.getElementById("status-message");
    state.elements.rulesCard = document.getElementById("rules-card");
    state.elements.toggleRules = document.getElementById("toggle-rules");
    state.elements.newGame = document.getElementById("new-game");
    state.elements.aimLine = document.getElementById("aim-line");
    state.elements.dragPoint = document.getElementById("drag-point");
    state.elements.aimCone = document.getElementById("aim-cone");
    state.elements.accuracyDot = document.getElementById("accuracy-dot");
    state.elements.releasePopup = document.getElementById("release-popup");
    state.elements.pucks = Array.from(document.querySelectorAll(".puck[data-puck]"));

    state.elements.newGame.addEventListener("click", startNewGame);
    state.elements.toggleRules.addEventListener("click", toggleRules);
    state.elements.field.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    window.addEventListener("resize", () => {
      renderGame();
      updateAimLine();
    });

    initSharedBackground();
    startNewGame();
  }

  function initSharedBackground() {
    if (typeof window.initSharedBackground !== "function") return;

    window.initSharedBackground({
      body: document.body,
      cursorSize: 160,
      cursorOpacity: 0.4,
      overlayOpacityDesktop: 0.56,
      overlayOpacityMobile: 0.76,
      spotCountDesktop: 12,
      spotCountMobile: 16,
      paletteDesktop: [
        "rgba(116, 245, 190, 0.2)",
        "rgba(255, 209, 102, 0.18)",
        "rgba(142, 203, 255, 0.18)",
        "rgba(90, 184, 255, 0.12)"
      ],
      paletteMobile: [
        "rgba(116, 245, 190, 0.3)",
        "rgba(255, 209, 102, 0.28)",
        "rgba(142, 203, 255, 0.28)",
        "rgba(90, 184, 255, 0.18)"
      ],
      sizeDesktop: [80, 200],
      sizeMobile: [95, 240],
      opacityBaseDesktop: [0.22, 0.48],
      opacityBaseMobile: [0.28, 0.58],
      opacityAmpDesktop: [0.1, 0.24],
      opacityAmpMobile: [0.15, 0.28]
    });
  }

  function startNewGame() {
    stopTimerLoop();
    state.pucks = INITIAL_PUCKS.map((puck) => ({ ...puck }));
    state.drag = null;
    state.shotInFlight = false;
    state.finished = false;
    state.shots = 0;
    state.penaltyMs = 0;
    state.timerStartedAt = null;
    state.timerElapsedMs = 0;
    clearAimState();
    renderGame();
    updateHud();
    setStatus("Bereit. Zieh einen Puck nach hinten und schnips ihn auf das rechte Tor.", "info");
  }

  function resetRound() {
    startNewGame();
  }

  function toggleRules() {
    const isVisible = !state.elements.rulesCard.hidden;
    state.elements.rulesCard.hidden = isVisible;
    state.elements.toggleRules.textContent = isVisible ? "Regeln anzeigen" : "Regeln ausblenden";
    state.elements.toggleRules.setAttribute("aria-expanded", String(!isVisible));
  }

  function handlePointerDown(event) {
    if (state.shotInFlight || state.finished) return;

    const puckElement = event.target.closest(".puck[data-puck]");
    if (!puckElement || !state.elements.field.contains(puckElement)) return;

    event.preventDefault();

    const puckId = Number(puckElement.dataset.puck);
    const point = getFieldPoint(event);
    state.drag = {
      pointerId: event.pointerId,
      puckId,
      anchorPoint: point,
      currentPointer: point,
      startPositions: snapshotPositions(),
      accuracyStartedAt: performance.now()
    };

    puckElement.classList.add("is-active");
    try {
      puckElement.setPointerCapture(event.pointerId);
    } catch (error) {
      // Pointer capture helps on touch devices but is not mandatory.
    }
    startAimLoop();
    updateAimLine();
  }

  function handlePointerMove(event) {
    if (!state.drag || event.pointerId !== state.drag.pointerId) return;

    event.preventDefault();
    state.drag.currentPointer = getFieldPoint(event);
    updateAimLine();
  }

  async function handlePointerUp(event) {
    if (!state.drag || event.pointerId !== state.drag.pointerId) return;

    event.preventDefault();

    if (event.type === "pointercancel") {
      clearAimState();
      state.drag = null;
      setStatus("Schuss abgebrochen.", "info");
      return;
    }

    const dragState = state.drag;
    const startPosition = dragState.startPositions.find((puck) => puck.id === dragState.puckId);
    const movedPuck = state.pucks.find((puck) => puck.id === dragState.puckId);
    const pullVector = {
      x: dragState.currentPointer.x - dragState.anchorPoint.x,
      y: dragState.currentPointer.y - dragState.anchorPoint.y
    };
    const clampedPull = clampVector(pullVector, MAX_PULL);
    const pullDistance = Math.hypot(clampedPull.x, clampedPull.y);
    const accuracyQuality = getCurrentAccuracyQuality(dragState);
    const releasePercent = Math.round(accuracyQuality * 100);

    clearAimState();
    state.drag = null;

    if (pullDistance < MIN_PULL) {
      setStatus("Zug zu kurz. Zieh weiter nach hinten fuer einen echten Schnips.", "info");
      return;
    }

    if (!state.timerStartedAt) {
      state.timerStartedAt = performance.now();
      startTimerLoop();
    }

    state.shots += 1;
    updateHud();
    showReleasePopup(dragState.currentPointer, releasePercent, accuracyQuality);

    const shotTrace = [{ x: startPosition.x, y: startPosition.y }];
    const outcome = await launchPuck(movedPuck, startPosition, clampedPull, shotTrace, accuracyQuality);

    let penaltyApplied = 0;
    const validMove = isValidMove(dragState.puckId, dragState.startPositions, shotTrace);

    if (outcome.collided) {
      penaltyApplied += COLLISION_PENALTY_MS;
    }

    if (!validMove) {
      penaltyApplied += INVALID_PENALTY_MS;
    }

    if (penaltyApplied > 0) {
      state.penaltyMs += penaltyApplied;
      updateHud();
    }

    if (outcome.goal) {
      finishRun();
      return;
    }

    if (outcome.collided && !validMove) {
      setStatus(`Kollision und kein Durchstecher. ${describeRelease(accuracyQuality)} +5.0s Strafe.`, "invalid");
      return;
    }

    if (outcome.collided) {
      setStatus(`Kollision. ${describeRelease(accuracyQuality)} +2.0s Strafe.`, "invalid");
      return;
    }

    if (!validMove) {
      setStatus(`Kein sauberer Durchstich. ${describeRelease(accuracyQuality)} +3.0s Strafe.`, "invalid");
      return;
    }

    setStatus(`Gueltiger Zug. ${describeRelease(accuracyQuality)} Weiter aufs rechte Tor.`, "valid");
  }

  function finishRun() {
    state.finished = true;
    state.shotInFlight = false;
    stopTimerLoop();
    state.timerElapsedMs = state.timerStartedAt ? Math.max(0, performance.now() - state.timerStartedAt) : 0;
    updateHud();
    setStatus(
      `Tor! Run beendet in ${formatTimer(getCurrentRunMs())} bei ${state.shots} Schuessen und ${formatPenalty(state.penaltyMs)} Strafe.`,
      "goal"
    );
  }

  async function launchPuck(movedPuck, startPosition, pullVector, trace, accuracyQuality) {
    state.shotInFlight = true;

    const launchVector = { x: -pullVector.x, y: -pullVector.y };
    const normalizedPull = Math.min(1, Math.hypot(launchVector.x, launchVector.y) / MAX_PULL);
    const rawSpeed = lerp(MIN_SPEED, MAX_SPEED, Math.pow(normalizedPull, 0.92));
    const direction = applyAccuracyVariance(normalizeVector(launchVector), rawSpeed, accuracyQuality);
    let velocity = {
      x: direction.x,
      y: direction.y
    };
    let previousTime = performance.now();
    let collided = false;
    let goal = false;

    while (Math.hypot(velocity.x, velocity.y) > STOP_SPEED) {
      const frameTime = await nextFrame();
      const dt = Math.min(34, frameTime - previousTime);
      previousTime = frameTime;

      const step = dt / 1000;
      const nextPosition = {
        x: movedPuck.x + velocity.x * step,
        y: movedPuck.y + velocity.y * step
      };

      const collision = detectFirstCollision(movedPuck.id, movedPuck, nextPosition);
      if (collision) {
        collided = true;
        movedPuck.x = collision.contact.x;
        movedPuck.y = collision.contact.y;
        trace.push({ x: movedPuck.x, y: movedPuck.y });

        const normalVelocity = dot(velocity, collision.normal);
        const tangent = {
          x: velocity.x - collision.normal.x * normalVelocity,
          y: velocity.y - collision.normal.y * normalVelocity
        };
        velocity = {
          x: tangent.x * 0.22 - collision.normal.x * Math.abs(normalVelocity) * COLLISION_BOUNCE,
          y: tangent.y * 0.22 - collision.normal.y * Math.abs(normalVelocity) * COLLISION_BOUNCE
        };
      } else {
        movedPuck.x = nextPosition.x;
        movedPuck.y = nextPosition.y;
      }

      const wallResult = resolveWallBounce(movedPuck, velocity);
      velocity = wallResult.velocity;

      if (trace.length === 0 || distanceBetween(trace[trace.length - 1], movedPuck) > 10) {
        trace.push({ x: movedPuck.x, y: movedPuck.y });
      }

      renderGame();

      if (checkGoal(movedPuck)) {
        goal = true;
        break;
      }

      const frictionFactor = Math.pow(FRICTION_PER_FRAME, dt / 16.667);
      velocity.x *= frictionFactor;
      velocity.y *= frictionFactor;
    }

    state.shotInFlight = false;
    trace.push({ x: movedPuck.x, y: movedPuck.y });
    renderGame();

    return { collided, goal };
  }

  function resolveWallBounce(puck, velocity) {
    let nextVelocity = { ...velocity };
    const goalRange = getGoalRange();
    const insideGoalOpening = puck.y >= goalRange.top && puck.y <= goalRange.bottom;
    const rightGoalEntry = FIELD_WIDTH - GOAL_DEPTH;

    if (puck.y <= PUCK_RADIUS) {
      puck.y = PUCK_RADIUS;
      nextVelocity.y = Math.abs(nextVelocity.y) * WALL_BOUNCE;
    } else if (puck.y >= FIELD_HEIGHT - PUCK_RADIUS) {
      puck.y = FIELD_HEIGHT - PUCK_RADIUS;
      nextVelocity.y = -Math.abs(nextVelocity.y) * WALL_BOUNCE;
    }

    if (puck.x <= PUCK_RADIUS) {
      puck.x = PUCK_RADIUS;
      nextVelocity.x = Math.abs(nextVelocity.x) * WALL_BOUNCE;
    } else if (puck.x >= FIELD_WIDTH - PUCK_RADIUS) {
      if (insideGoalOpening) {
        puck.x = FIELD_WIDTH - PUCK_RADIUS * 0.3;
      } else {
        puck.x = FIELD_WIDTH - PUCK_RADIUS;
        nextVelocity.x = -Math.abs(nextVelocity.x) * WALL_BOUNCE;
      }
    } else if (puck.x >= rightGoalEntry - PUCK_RADIUS && !insideGoalOpening) {
      puck.x = rightGoalEntry - PUCK_RADIUS;
      nextVelocity.x = -Math.abs(nextVelocity.x) * WALL_BOUNCE;
    }

    return { velocity: nextVelocity };
  }

  function detectFirstCollision(movedPuckId, from, to) {
    let earliestCollision = null;

    state.pucks.forEach((otherPuck) => {
      if (otherPuck.id === movedPuckId) return;

      const collision = intersectSegmentCircle(from, to, otherPuck, PUCK_RADIUS * 2 + 1);
      if (!collision) return;

      if (!earliestCollision || collision.t < earliestCollision.t) {
        const normal = normalizeVector({
          x: collision.contact.x - otherPuck.x,
          y: collision.contact.y - otherPuck.y
        });
        earliestCollision = {
          ...collision,
          normal
        };
      }
    });

    return earliestCollision;
  }

  function isValidMove(movedPuckId, startPositions, trace) {
    const movementCount = state.pucks.reduce((count, puck) => {
      const beforeMove = startPositions.find((entry) => entry.id === puck.id);
      return count + (distanceBetween(puck, beforeMove) > 2 ? 1 : 0);
    }, 0);

    if (movementCount !== 1) return false;

    const otherPucks = startPositions.filter((entry) => entry.id !== movedPuckId);
    for (let index = 1; index < trace.length; index += 1) {
      if (
        lineCrossesWithTolerance(
          trace[index - 1],
          trace[index],
          otherPucks[0],
          otherPucks[1],
          PUCK_RADIUS * 0.85
        )
      ) {
        return true;
      }
    }

    return false;
  }

  function checkGoal(movedPuck) {
    const goalRange = getGoalRange();
    return movedPuck.x >= FIELD_WIDTH - GOAL_DEPTH - PUCK_RADIUS * 0.15
      && movedPuck.y >= goalRange.top
      && movedPuck.y <= goalRange.bottom;
  }

  function renderGame() {
    state.elements.pucks.forEach((puckElement) => {
      const puckId = Number(puckElement.dataset.puck);
      const puck = state.pucks.find((entry) => entry.id === puckId);
      puckElement.style.left = `${(puck.x / FIELD_WIDTH) * 100}%`;
      puckElement.style.top = `${(puck.y / FIELD_HEIGHT) * 100}%`;
    });
  }

  function updateHud() {
    state.elements.timer.textContent = formatTimer(getCurrentRunMs());
    state.elements.shotCount.textContent = String(state.shots);
    state.elements.penaltyTime.textContent = formatPenalty(state.penaltyMs);
  }

  function setStatus(message, tone) {
    state.elements.statusMessage.textContent = message;
    state.elements.statusCard.dataset.tone = tone;
  }

  function snapshotPositions() {
    return state.pucks.map((puck) => ({ id: puck.id, x: puck.x, y: puck.y }));
  }

  function startTimerLoop() {
    stopTimerLoop();

    function updateTimer() {
      if (!state.timerStartedAt || state.finished) return;
      state.elements.timer.textContent = formatTimer(getCurrentRunMs());
      state.timerFrame = window.requestAnimationFrame(updateTimer);
    }

    state.timerFrame = window.requestAnimationFrame(updateTimer);
  }

  function stopTimerLoop() {
    if (!state.timerFrame) return;
    window.cancelAnimationFrame(state.timerFrame);
    state.timerFrame = 0;
  }

  function getCurrentRunMs() {
    if (!state.timerStartedAt) {
      return state.penaltyMs;
    }

    if (state.finished) {
      return state.timerElapsedMs + state.penaltyMs;
    }

    return Math.max(0, performance.now() - state.timerStartedAt) + state.penaltyMs;
  }

  function getFieldPoint(event) {
    const rect = state.elements.field.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * FIELD_WIDTH;
    const y = ((event.clientY - rect.top) / rect.height) * FIELD_HEIGHT;

    return {
      x,
      y
    };
  }

  function updateAimLine() {
    const aimLine = state.elements.aimLine;
    const dragPoint = state.elements.dragPoint;
    const aimCone = state.elements.aimCone;
    const accuracyDot = state.elements.accuracyDot;
    if (!state.drag) {
      aimLine.hidden = true;
      dragPoint.hidden = true;
      aimCone.hidden = true;
      accuracyDot.hidden = true;
      return;
    }

    const startPosition = state.drag.startPositions.find((puck) => puck.id === state.drag.puckId);
    const rawPull = {
      x: state.drag.currentPointer.x - state.drag.anchorPoint.x,
      y: state.drag.currentPointer.y - state.drag.anchorPoint.y
    };
    const clampedPull = clampVector(rawPull, MAX_PULL);
    const launchVector = { x: -clampedPull.x, y: -clampedPull.y };
    const length = Math.hypot(launchVector.x, launchVector.y);
    const accuracyQuality = getCurrentAccuracyQuality(state.drag);

    if (length < 4) {
      aimLine.hidden = true;
      dragPoint.hidden = true;
      aimCone.hidden = true;
      accuracyDot.hidden = true;
      return;
    }

    const rect = state.elements.field.getBoundingClientRect();
    const startPx = toPixelPoint(startPosition, rect);
    const pointerPx = toPixelPoint(state.drag.currentPointer, rect);
    const launchEnd = {
      x: startPosition.x + launchVector.x * 0.95,
      y: startPosition.y + launchVector.y * 0.95
    };
    const launchEndPx = toPixelPoint(launchEnd, rect);
    const dragDx = pointerPx.x - startPx.x;
    const dragDy = pointerPx.y - startPx.y;
    const dragLengthPx = Math.hypot(dragDx, dragDy);
    const launchDx = launchEndPx.x - startPx.x;
    const launchDy = launchEndPx.y - startPx.y;
    const launchLengthPx = Math.hypot(launchDx, launchDy);
    const launchAngle = Math.atan2(launchDy, launchDx);
    const spreadDeg = lerp(MAX_INACCURACY_DEG, 3, accuracyQuality);
    const pullRatio = Math.min(1, length / MAX_PULL);
    const coneLength = pullRatio * 230;
    const coneHeight = Math.tan(degreesToRadians(spreadDeg)) * coneLength * 2;
    const accuracyPointDistance = coneLength * 0.72;
    const accuracyPx = {
      x: startPx.x + Math.cos(launchAngle) * accuracyPointDistance,
      y: startPx.y + Math.sin(launchAngle) * accuracyPointDistance
    };
    const accuracyColor = mixColor([255, 88, 88], [124, 255, 170], accuracyQuality);

    aimLine.hidden = false;
    aimLine.style.left = `${startPx.x}px`;
    aimLine.style.top = `${startPx.y}px`;
    aimLine.style.width = `${dragLengthPx}px`;
    aimLine.style.transform = `translateY(-50%) rotate(${Math.atan2(dragDy, dragDx)}rad)`;

    dragPoint.hidden = false;
    dragPoint.style.left = `${pointerPx.x}px`;
    dragPoint.style.top = `${pointerPx.y}px`;

    aimCone.hidden = false;
    aimCone.style.left = `${startPx.x}px`;
    aimCone.style.top = `${startPx.y - coneHeight / 2}px`;
    aimCone.style.width = `${coneLength}px`;
    aimCone.style.height = `${coneHeight}px`;
    aimCone.style.transform = `rotate(${launchAngle}rad)`;
    aimCone.style.background = `linear-gradient(90deg, rgba(255,255,255,0.04), rgba(${accuracyColor[0]}, ${accuracyColor[1]}, ${accuracyColor[2]}, 0.2))`;

    accuracyDot.hidden = false;
    accuracyDot.style.left = `${accuracyPx.x}px`;
    accuracyDot.style.top = `${accuracyPx.y}px`;
    accuracyDot.style.background = `rgb(${accuracyColor[0]}, ${accuracyColor[1]}, ${accuracyColor[2]})`;
    accuracyDot.style.boxShadow = `0 0 0 4px rgba(${accuracyColor[0]}, ${accuracyColor[1]}, ${accuracyColor[2]}, 0.14), 0 0 20px rgba(${accuracyColor[0]}, ${accuracyColor[1]}, ${accuracyColor[2]}, 0.3)`;
  }

  function clearAimState() {
    stopAimLoop();
    state.elements.pucks.forEach((puckElement) => puckElement.classList.remove("is-active"));
    state.elements.aimLine.hidden = true;
    state.elements.dragPoint.hidden = true;
    state.elements.aimCone.hidden = true;
    state.elements.accuracyDot.hidden = true;
  }

  function showReleasePopup(point, percent, accuracyQuality) {
    const popup = state.elements.releasePopup;
    if (!popup) return;

    const rect = state.elements.field.getBoundingClientRect();
    const px = toPixelPoint(point, rect);
    const color = mixColor([255, 88, 88], [124, 255, 170], accuracyQuality);

    popup.hidden = false;
    popup.textContent = `${percent}%`;
    popup.style.left = `${px.x}px`;
    popup.style.top = `${px.y - 24}px`;
    popup.style.background = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
    popup.style.opacity = "1";

    popup.animate(
      [
        { transform: "translate(-50%, -50%) scale(0.92)", opacity: 0 },
        { transform: "translate(-50%, -58%) scale(1)", opacity: 1, offset: 0.18 },
        { transform: "translate(-50%, -66%) scale(0.99)", opacity: 1, offset: 0.72 },
        { transform: "translate(-50%, -74%) scale(0.97)", opacity: 0 }
      ],
      {
        duration: 1320,
        easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
        fill: "forwards"
      }
    ).finished.finally(() => {
      popup.hidden = true;
      popup.style.opacity = "0";
    });
  }

  function startAimLoop() {
    stopAimLoop();

    function tick() {
      if (!state.drag) return;
      updateAimLine();
      state.aimFrame = window.requestAnimationFrame(tick);
    }

    state.aimFrame = window.requestAnimationFrame(tick);
  }

  function stopAimLoop() {
    if (!state.aimFrame) return;
    window.cancelAnimationFrame(state.aimFrame);
    state.aimFrame = 0;
  }

  function lineCrossesWithTolerance(movedStart, movedEnd, otherStart, otherEnd, tolerance) {
    const movedDistance = distanceBetween(movedStart, movedEnd);
    if (movedDistance < 8) return false;

    const baseVector = {
      x: otherEnd.x - otherStart.x,
      y: otherEnd.y - otherStart.y
    };
    const baseLength = Math.hypot(baseVector.x, baseVector.y) || 1;

    const startSide = cross(otherStart, otherEnd, movedStart) / baseLength;
    const endSide = cross(otherStart, otherEnd, movedEnd) / baseLength;
    const changedSides = startSide === 0 || endSide === 0 || startSide * endSide <= 0;

    const projectionStart = dot(
      { x: movedStart.x - otherStart.x, y: movedStart.y - otherStart.y },
      baseVector
    ) / (baseLength * baseLength);
    const projectionEnd = dot(
      { x: movedEnd.x - otherStart.x, y: movedEnd.y - otherStart.y },
      baseVector
    ) / (baseLength * baseLength);
    const reachesSegment = Math.max(projectionStart, projectionEnd) >= -0.18
      && Math.min(projectionStart, projectionEnd) <= 1.18;

    const segmentDistance = minimumSegmentDistance(movedStart, movedEnd, otherStart, otherEnd);
    return (changedSides && reachesSegment) || segmentDistance <= tolerance;
  }

  function minimumSegmentDistance(aStart, aEnd, bStart, bEnd) {
    return Math.min(
      pointToSegmentDistance(aStart, bStart, bEnd),
      pointToSegmentDistance(aEnd, bStart, bEnd),
      pointToSegmentDistance(bStart, aStart, aEnd),
      pointToSegmentDistance(bEnd, aStart, aEnd)
    );
  }

  function pointToSegmentDistance(point, segmentStart, segmentEnd) {
    const segmentVector = {
      x: segmentEnd.x - segmentStart.x,
      y: segmentEnd.y - segmentStart.y
    };
    const lengthSquared = segmentVector.x * segmentVector.x + segmentVector.y * segmentVector.y;
    if (lengthSquared === 0) return distanceBetween(point, segmentStart);

    const projection = clamp(
      dot(
        { x: point.x - segmentStart.x, y: point.y - segmentStart.y },
        segmentVector
      ) / lengthSquared,
      0,
      1
    );

    const closestPoint = {
      x: segmentStart.x + segmentVector.x * projection,
      y: segmentStart.y + segmentVector.y * projection
    };

    return distanceBetween(point, closestPoint);
  }

  function intersectSegmentCircle(start, end, center, radius) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const fx = start.x - center.x;
    const fy = start.y - center.y;
    const a = dx * dx + dy * dy;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - radius * radius;
    const discriminant = b * b - 4 * a * c;

    if (discriminant < 0 || a === 0) return null;

    const root = Math.sqrt(discriminant);
    const t1 = (-b - root) / (2 * a);
    const t2 = (-b + root) / (2 * a);
    const t = [t1, t2].find((candidate) => candidate >= 0 && candidate <= 1);
    if (t === undefined) return null;

    const contact = {
      x: start.x + dx * Math.max(0, t - 0.01),
      y: start.y + dy * Math.max(0, t - 0.01)
    };

    return { t, contact };
  }

  function getGoalRange() {
    return {
      top: (FIELD_HEIGHT - GOAL_HEIGHT) / 2 + PUCK_RADIUS * 0.18,
      bottom: (FIELD_HEIGHT + GOAL_HEIGHT) / 2 - PUCK_RADIUS * 0.18
    };
  }

  function nextFrame() {
    return new Promise((resolve) => window.requestAnimationFrame(resolve));
  }

  function formatTimer(ms) {
    const totalMs = Math.max(0, ms);
    const minutes = Math.floor(totalMs / 60000);
    const seconds = Math.floor((totalMs % 60000) / 1000);
    const tenths = Math.floor((totalMs % 1000) / 100);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`;
  }

  function formatPenalty(ms) {
    return `+${(ms / 1000).toFixed(1)}s`;
  }

  function getCurrentAccuracyQuality(dragState, now = performance.now()) {
    if (!dragState || !dragState.accuracyStartedAt) return 1;
    const elapsed = now - dragState.accuracyStartedAt;
    const cycleProgress = (elapsed % ACCURACY_CYCLE_MS) / ACCURACY_CYCLE_MS;
    return cycleProgress < 0.5
      ? cycleProgress * 2
      : 2 - cycleProgress * 2;
  }

  function applyAccuracyVariance(direction, speed, accuracyQuality) {
    const maxAngleOffset = degreesToRadians(lerp(MAX_INACCURACY_DEG, 0, accuracyQuality));
    const strengthVariance = lerp(MAX_INACCURACY_STRENGTH, 0, accuracyQuality);
    const angleOffset = randomBetween(-maxAngleOffset, maxAngleOffset);
    const speedScale = 1 + randomBetween(-strengthVariance, strengthVariance);
    const rotated = rotateVector(direction, angleOffset);
    return {
      x: rotated.x * speed * speedScale,
      y: rotated.y * speed * speedScale
    };
  }

  function describeRelease(accuracyQuality) {
    if (accuracyQuality >= 0.82) return "Gruener Release.";
    if (accuracyQuality >= 0.52) return "Gelber Release.";
    return "Roter Release.";
  }

  function clampVector(vector, maxLength) {
    const length = Math.hypot(vector.x, vector.y);
    if (!length || length <= maxLength) return vector;

    const factor = maxLength / length;
    return {
      x: vector.x * factor,
      y: vector.y * factor
    };
  }

  function normalizeVector(vector) {
    const length = Math.hypot(vector.x, vector.y) || 1;
    return {
      x: vector.x / length,
      y: vector.y / length
    };
  }

  function toPixelPoint(point, rect) {
    return {
      x: (point.x / FIELD_WIDTH) * rect.width,
      y: (point.y / FIELD_HEIGHT) * rect.height
    };
  }

  function rotateVector(vector, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: vector.x * cos - vector.y * sin,
      y: vector.x * sin + vector.y * cos
    };
  }

  function degreesToRadians(value) {
    return (value * Math.PI) / 180;
  }

  function mixColor(from, to, amount) {
    return [
      Math.round(lerp(from[0], to[0], amount)),
      Math.round(lerp(from[1], to[1], amount)),
      Math.round(lerp(from[2], to[2], amount))
    ];
  }

  function randomBetween(min, max) {
    return Math.random() * (max - min) + min;
  }

  function distanceBetween(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function cross(a, b, c) {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  }

  function dot(a, b) {
    return a.x * b.x + a.y * b.y;
  }

  function lerp(start, end, amount) {
    return start + (end - start) * amount;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  initGame();
})();
