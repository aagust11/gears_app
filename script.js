const canvas = document.getElementById("gear-canvas");
const ctx = canvas.getContext("2d");
const wrapper = document.querySelector(".canvas-wrapper");
const toggleSimBtn = document.getElementById("toggle-sim");
const chainModeBtn = document.getElementById("chain-mode");
const clearAllBtn = document.getElementById("clear-all");
const editor = document.getElementById("gear-editor");
const teethInput = document.getElementById("gear-teeth");
const rpmInput = document.getElementById("gear-rpm");
const directionButtons = editor.querySelectorAll(".toggle-buttons button");
const deleteBtn = document.getElementById("delete-gear");
const closeEditorBtn = document.getElementById("close-editor");
const quickInfoBtn = document.getElementById("quick-info");
const quickInfoPopup = document.getElementById("quick-info-popup");
const quickInfoClose = document.getElementById("quick-info-close");
const themeToggleBtn = document.getElementById("theme-toggle");

let gears = [];
let gearCounter = 1;
let hoveredGear = null;
let selectedGear = null;
let drawing = false;
let drawingStart = null;
let previewRadius = 0;
let draggingGear = null;
let dragOffset = { x: 0, y: 0 };
let dragMoved = false;
let simulationRunning = false;
let chainMode = false;
let chainSelection = null;
let lastTime = performance.now();
let activeTheme = document.body?.dataset?.theme || "dark";

const THEME_KEY = "gearlab-theme";
const prefersDarkQuery =
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;

function applyTheme(theme) {
  const normalized = theme === "light" ? "light" : "dark";
  document.body.classList.remove("theme-light", "theme-dark");
  document.body.classList.add(`theme-${normalized}`);
  document.body.dataset.theme = normalized;
  if (themeToggleBtn) {
    themeToggleBtn.setAttribute("aria-pressed", normalized === "dark" ? "true" : "false");
  }
  activeTheme = normalized;
}

let storedTheme = null;
try {
  storedTheme = localStorage.getItem(THEME_KEY);
} catch (error) {
  console.warn("No es pot llegir la preferència de tema", error);
}

if (storedTheme) {
  applyTheme(storedTheme);
} else {
  const prefersDark = prefersDarkQuery ? prefersDarkQuery.matches : true;
  applyTheme(prefersDark ? "dark" : "light");
}

if (prefersDarkQuery) {
  const handlePrefersChange = (event) => {
    let savedTheme = null;
    try {
      savedTheme = localStorage.getItem(THEME_KEY);
    } catch (error) {
      console.warn("No es pot llegir la preferència de tema", error);
    }
    if (!savedTheme) {
      applyTheme(event.matches ? "dark" : "light");
    }
  };

  if (typeof prefersDarkQuery.addEventListener === "function") {
    prefersDarkQuery.addEventListener("change", handlePrefersChange);
  } else if (typeof prefersDarkQuery.addListener === "function") {
    prefersDarkQuery.addListener(handlePrefersChange);
  }
}

if (themeToggleBtn) {
  themeToggleBtn.addEventListener("click", () => {
    const nextTheme = activeTheme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
    try {
      localStorage.setItem(THEME_KEY, nextTheme);
    } catch (error) {
      console.warn("No es pot guardar la preferència de tema", error);
    }
  });
}

function openQuickInfo() {
  if (!quickInfoPopup) return;
  quickInfoPopup.classList.remove("hidden");
  quickInfoPopup.setAttribute("aria-hidden", "false");
  if (quickInfoBtn) {
    quickInfoBtn.setAttribute("aria-expanded", "true");
  }
  if (quickInfoClose) {
    quickInfoClose.focus();
  } else {
    quickInfoPopup.focus();
  }
}

function closeQuickInfo() {
  if (!quickInfoPopup) return;
  quickInfoPopup.classList.add("hidden");
  quickInfoPopup.setAttribute("aria-hidden", "true");
  if (quickInfoBtn) {
    quickInfoBtn.setAttribute("aria-expanded", "false");
    quickInfoBtn.focus();
  }
}

function resizeCanvas() {
  const rect = wrapper.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

function toCanvasCoords(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function createGear({ x, y, radius }) {
  const baseTeeth = Math.max(6, Math.round(radius / 4) * 2);
  const gear = {
    id: `gear_${gearCounter++}`,
    x,
    y,
    radius,
    numTeeth: baseTeeth,
    module: radius / baseTeeth,
    rpm: null,
    direction: "clockwise",
    angle: 0,
    connections: [],
    effectiveRpm: null,
    effectiveDir: null,
    conflict: false,
  };
  gears.push(gear);
  updateAutoConnections();
  propagateRpm();
}

function getGearAt({ x, y }) {
  return (
    gears
      .slice()
      .reverse()
      .find((gear) => Math.hypot(gear.x - x, gear.y - y) <= gear.radius + 8) || null
  );
}

function ensureConnection(a, b, type) {
  if (!a.connections.some((c) => c.id === b.id && c.type === type)) {
    a.connections.push({ id: b.id, type });
  }
  if (!b.connections.some((c) => c.id === a.id && c.type === type)) {
    b.connections.push({ id: a.id, type });
  }
}

function detachGear(gear) {
  gears.forEach((g) => {
    g.connections = g.connections.filter((conn) => conn.id !== gear.id);
  });
}

function updateAutoConnections() {
  gears.forEach((gear) => {
    gear.connections = gear.connections.filter((conn) => conn.type !== "mesh");
  });

  for (let i = 0; i < gears.length; i += 1) {
    for (let j = i + 1; j < gears.length; j += 1) {
      const g1 = gears[i];
      const g2 = gears[j];
      const dx = g1.x - g2.x;
      const dy = g1.y - g2.y;
      const distance = Math.hypot(dx, dy);
      const expected = g1.radius + g2.radius;
      if (distance > 0 && Math.abs(distance - expected) <= 8) {
        ensureConnection(g1, g2, "mesh");
      }
    }
  }
}

function propagateRpm() {
  const queue = [];
  gears.forEach((gear) => {
    gear.effectiveRpm = gear.rpm != null ? Number(gear.rpm) : null;
    gear.effectiveDir = gear.rpm != null ? (gear.direction === "clockwise" ? 1 : -1) : null;
    gear.conflict = false;
    if (gear.effectiveRpm != null && !Number.isNaN(gear.effectiveRpm)) {
      queue.push(gear);
    }
  });

  while (queue.length > 0) {
    const gear = queue.shift();
    const baseRpm = gear.effectiveRpm ?? 0;
    const baseDir = gear.effectiveDir ?? 1;
    gear.connections.forEach((conn) => {
      const neighbor = gears.find((g) => g.id === conn.id);
      if (!neighbor) return;
      const ratio = gear.numTeeth / neighbor.numTeeth;
      const directionFactor = conn.type === "mesh" ? -1 : 1;
      const computedRpm = baseRpm * ratio;
      const computedDir = baseDir * directionFactor;

      if (neighbor.effectiveRpm == null) {
        neighbor.effectiveRpm = computedRpm;
        neighbor.effectiveDir = computedDir;
        queue.push(neighbor);
      } else {
        if (Math.abs(neighbor.effectiveRpm - computedRpm) > 0.5) {
          neighbor.conflict = true;
        }
      }
    });
  }
}

function openEditor(gear) {
  selectedGear = gear;
  editor.classList.remove("hidden");
  const wrapperRect = wrapper.getBoundingClientRect();
  const left = Math.min(Math.max(gear.x + 16, 12), wrapperRect.width - 260);
  const top = Math.min(Math.max(gear.y - 20, 12), wrapperRect.height - 220);
  editor.style.left = `${left}px`;
  editor.style.top = `${top}px`;
  teethInput.value = gear.numTeeth;
  rpmInput.value = gear.rpm != null ? gear.rpm : "";
  directionButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.direction === gear.direction);
  });
}

function closeEditor() {
  editor.classList.add("hidden");
  selectedGear = null;
}

canvas.addEventListener("mousedown", (event) => {
  if (event.button !== 0) return;
  const point = toCanvasCoords(event);
  const gear = getGearAt(point);
  dragMoved = false;

  if (gear && !drawing) {
    draggingGear = gear;
    dragOffset = { x: point.x - gear.x, y: point.y - gear.y };
    return;
  }

  drawing = true;
  drawingStart = point;
  previewRadius = 0;
  closeEditor();
});

canvas.addEventListener("mousemove", (event) => {
  const point = toCanvasCoords(event);
  hoveredGear = getGearAt(point);

  if (drawing && drawingStart) {
    previewRadius = Math.max(10, Math.hypot(point.x - drawingStart.x, point.y - drawingStart.y));
    return;
  }

  if (draggingGear) {
    dragMoved = true;
    draggingGear.x = point.x - dragOffset.x;
    draggingGear.y = point.y - dragOffset.y;
    updateAutoConnections();
    propagateRpm();
  }
});

canvas.addEventListener("mouseup", (event) => {
  if (event.button !== 0) return;
  const point = toCanvasCoords(event);

  if (draggingGear) {
    const wasDragged = dragMoved;
    const gear = draggingGear;
    draggingGear = null;
    dragOffset = { x: 0, y: 0 };
    updateAutoConnections();
    propagateRpm();

    if (!wasDragged) {
      if (chainMode) {
        handleChainSelection(gear);
      } else {
        openEditor(gear);
      }
    }
    return;
  }

  if (drawing) {
    drawing = false;
    const radius = Math.max(16, previewRadius);
    if (radius >= 16) {
      createGear({ x: drawingStart.x, y: drawingStart.y, radius });
    }
    drawingStart = null;
    previewRadius = 0;
  }
});

canvas.addEventListener("mouseleave", () => {
  if (draggingGear) {
    draggingGear = null;
    dragOffset = { x: 0, y: 0 };
  }
  drawing = false;
  drawingStart = null;
  previewRadius = 0;
  hoveredGear = null;
});

function handleChainSelection(gear) {
  if (!chainSelection) {
    chainSelection = gear;
  } else if (chainSelection.id !== gear.id) {
    ensureConnection(chainSelection, gear, "chain");
    chainSelection = null;
    propagateRpm();
  } else {
    chainSelection = null;
  }
}

teethInput.addEventListener("change", () => {
  if (!selectedGear) return;
  const value = Math.max(4, Number.parseInt(teethInput.value, 10));
  if (Number.isNaN(value)) return;
  selectedGear.numTeeth = value;
  const targetRadius = Math.max(16, selectedGear.module * selectedGear.numTeeth);
  selectedGear.radius = targetRadius;
  updateAutoConnections();
  propagateRpm();
});

rpmInput.addEventListener("input", () => {
  if (!selectedGear) return;
  const value = rpmInput.value.trim();
  if (value === "") {
    selectedGear.rpm = null;
  } else {
    const numeric = Number.parseFloat(value);
    selectedGear.rpm = Number.isNaN(numeric) ? null : numeric;
  }
  propagateRpm();
});

directionButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (!selectedGear) return;
    selectedGear.direction = button.dataset.direction;
    directionButtons.forEach((btn) => btn.classList.toggle("active", btn === button));
    propagateRpm();
  });
});

deleteBtn.addEventListener("click", () => {
  if (!selectedGear) return;
  const target = selectedGear;
  closeEditor();
  detachGear(target);
  gears = gears.filter((g) => g.id !== target.id);
  updateAutoConnections();
  propagateRpm();
});

closeEditorBtn.addEventListener("click", closeEditor);

if (quickInfoBtn && quickInfoPopup) {
  quickInfoBtn.addEventListener("click", () => {
    const isHidden = quickInfoPopup.classList.contains("hidden");
    if (isHidden) {
      openQuickInfo();
    } else {
      closeQuickInfo();
    }
  });
}

if (quickInfoClose) {
  quickInfoClose.addEventListener("click", closeQuickInfo);
}

if (quickInfoPopup) {
  quickInfoPopup.addEventListener("click", (event) => {
    if (event.target === quickInfoPopup) {
      closeQuickInfo();
    }
  });
}

clearAllBtn.addEventListener("click", () => {
  gears = [];
  chainSelection = null;
  closeEditor();
  updateAutoConnections();
  propagateRpm();
});

chainModeBtn.addEventListener("click", () => {
  chainMode = !chainMode;
  chainSelection = null;
  chainModeBtn.classList.toggle("active", chainMode);
});

toggleSimBtn.addEventListener("click", () => {
  simulationRunning = !simulationRunning;
  toggleSimBtn.textContent = simulationRunning ? "Atura simulació" : "Inicia simulació";
  toggleSimBtn.classList.toggle("active", simulationRunning);
});

function drawConnections() {
  ctx.save();
  ctx.lineWidth = 2;
  gears.forEach((gear) => {
    gear.connections.forEach((conn) => {
      const neighbor = gears.find((g) => g.id === conn.id);
      if (!neighbor) return;
      if (gear.id > neighbor.id) return;
      ctx.beginPath();
      if (conn.type === "mesh") {
        ctx.setLineDash([]);
        ctx.strokeStyle = "rgba(79, 195, 247, 0.35)";
      } else {
        ctx.setLineDash([8, 6]);
        ctx.strokeStyle = "rgba(255, 184, 108, 0.65)";
      }
      ctx.moveTo(gear.x, gear.y);
      ctx.lineTo(neighbor.x, neighbor.y);
      ctx.stroke();

      const midX = (gear.x + neighbor.x) / 2;
      const midY = (gear.y + neighbor.y) / 2;
      const ratio = gear.numTeeth / neighbor.numTeeth;
      const ratioText = `${gear.numTeeth} : ${neighbor.numTeeth} = ${ratio.toFixed(2)} : 1`;
      ctx.save();
      ctx.translate(midX, midY - 10);
      ctx.fillStyle = "rgba(6, 9, 15, 0.85)";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
      ctx.lineWidth = 2;
      const paddingX = 10;
      const paddingY = 6;
      ctx.font = "12px 'Inter', sans-serif";
      const textWidth = ctx.measureText(ratioText).width;
      const rectX = -textWidth / 2 - paddingX;
      const rectY = -paddingY - 8;
      const rectWidth = textWidth + paddingX * 2;
      const rectHeight = 22;
      const radius = 12;
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(rectX, rectY, rectWidth, rectHeight, radius);
      } else {
        const r = Math.min(radius, rectWidth / 2, rectHeight / 2);
        ctx.moveTo(rectX + r, rectY);
        ctx.lineTo(rectX + rectWidth - r, rectY);
        ctx.quadraticCurveTo(rectX + rectWidth, rectY, rectX + rectWidth, rectY + r);
        ctx.lineTo(rectX + rectWidth, rectY + rectHeight - r);
        ctx.quadraticCurveTo(rectX + rectWidth, rectY + rectHeight, rectX + rectWidth - r, rectY + rectHeight);
        ctx.lineTo(rectX + r, rectY + rectHeight);
        ctx.quadraticCurveTo(rectX, rectY + rectHeight, rectX, rectY + rectHeight - r);
        ctx.lineTo(rectX, rectY + r);
        ctx.quadraticCurveTo(rectX, rectY, rectX + r, rectY);
      }
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#f5f7fb";
      ctx.fillText(ratioText, -textWidth / 2, 6);
      ctx.restore();
    });
  });
  ctx.restore();
}

function drawGear(gear) {
  ctx.save();
  const highlight = gear === hoveredGear || gear === selectedGear || gear === chainSelection;
  const fillGradient = ctx.createRadialGradient(gear.x - gear.radius * 0.3, gear.y - gear.radius * 0.3, gear.radius * 0.2, gear.x, gear.y, gear.radius * 1.2);
  fillGradient.addColorStop(0, "rgba(79, 195, 247, 0.35)");
  fillGradient.addColorStop(1, "rgba(20, 26, 40, 0.95)");
  ctx.fillStyle = fillGradient;
  ctx.strokeStyle = highlight ? "rgba(255, 184, 108, 0.85)" : "rgba(255, 255, 255, 0.28)";
  ctx.lineWidth = highlight ? 3 : 2;

  ctx.beginPath();
  ctx.arc(gear.x, gear.y, gear.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
  ctx.lineWidth = 1.2;
  for (let i = 0; i < gear.numTeeth; i += 1) {
    const angle = (i / gear.numTeeth) * Math.PI * 2 + gear.angle;
    const inner = gear.radius - 4;
    const outer = gear.radius + 6;
    const x1 = gear.x + Math.cos(angle) * inner;
    const y1 = gear.y + Math.sin(angle) * inner;
    const x2 = gear.x + Math.cos(angle) * outer;
    const y2 = gear.y + Math.sin(angle) * outer;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.restore();

  ctx.beginPath();
  ctx.strokeStyle = "#ff5c5c";
  ctx.lineWidth = 2.5;
  const pointerX = gear.x + Math.cos(gear.angle) * gear.radius;
  const pointerY = gear.y + Math.sin(gear.angle) * gear.radius;
  ctx.moveTo(gear.x, gear.y);
  ctx.lineTo(pointerX, pointerY);
  ctx.stroke();

  ctx.beginPath();
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.arc(gear.x, gear.y, 4, 0, Math.PI * 2);
  ctx.fill();

  const rpmDisplay = gear.effectiveRpm != null ? `${gear.effectiveRpm.toFixed(1)} rpm` : "-";
  const directionSymbol = gear.effectiveDir == null ? "" : gear.effectiveDir > 0 ? "\u27F6" : "\u27F5";
  const conflictText = gear.conflict ? "!" : "";
  const label = `${gear.numTeeth} dents • ${rpmDisplay} ${directionSymbol} ${conflictText}`.trim();

  ctx.font = "12px 'Inter', sans-serif";
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.textAlign = "center";
  ctx.fillText(label, gear.x, gear.y + gear.radius + 18);

  ctx.restore();
}

function drawPreview() {
  if (drawing && drawingStart && previewRadius > 0) {
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(drawingStart.x, drawingStart.y, previewRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  if (chainMode && chainSelection && hoveredGear && hoveredGear.id !== chainSelection.id) {
    ctx.save();
    ctx.setLineDash([8, 4]);
    ctx.strokeStyle = "rgba(255, 184, 108, 0.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(chainSelection.x, chainSelection.y);
    ctx.lineTo(hoveredGear.x, hoveredGear.y);
    ctx.stroke();
    ctx.restore();
  }
}

function update(delta) {
  propagateRpm();
  if (simulationRunning) {
    gears.forEach((gear) => {
      const rpm = gear.effectiveRpm ?? 0;
      const direction = gear.effectiveDir ?? (gear.direction === "clockwise" ? 1 : -1);
      const angularVelocity = (rpm * Math.PI * 2) / 60 * direction;
      gear.angle += angularVelocity * delta;
    });
  }
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawConnections();
  gears.forEach((gear) => drawGear(gear));
  drawPreview();
}

function loop(time) {
  const delta = (time - lastTime) / 1000;
  lastTime = time;
  update(delta);
  render();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (quickInfoPopup && !quickInfoPopup.classList.contains("hidden")) {
      closeQuickInfo();
      return;
    }
    if (chainMode) {
      chainMode = false;
      chainSelection = null;
      chainModeBtn.classList.remove("active");
    }
    closeEditor();
  }
});
