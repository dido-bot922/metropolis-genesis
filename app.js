const canvas = document.getElementById('cityCanvas');
const ctx = canvas.getContext('2d');
const COLS = 34, ROWS = 24;
let cell = 30, ox = 0, oy = 0, zoom = 1, tool = 'inspect';
let paused = false, speed = 1, heat = false, drag = false, lastCell = null, toastTimer = null;

const state = {
  money: 24800,
  pop: 24,
  jobs: 18,
  happiness: 78,
  traffic: 12,
  pollution: 8,
  power: 100,
  water: 100,
  day: 1,
  hour: 8,
  weather: 'Céu limpo',
  nextEventDay: 3,
};

const grid = Array.from({ length: ROWS }, () =>
  Array.from({ length: COLS }, () => ({ type: 'empty', level: 0, age: 0 }))
);

const agents = [];
const colors = {
  residential: '#397da5',
  commercial: '#b17b3b',
  industrial: '#975394',
  road: '#36444d',
  school: '#4b83bc',
  clinic: '#b64d7d',
  park: '#3f9368',
  police: '#7258aa',
};

const costs = {
  road: 120,
  residential: 25,
  commercial: 30,
  industrial: 35,
  school: 1200,
  clinic: 1600,
  park: 500,
  police: 1000,
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function seedCity() {
  [[16,12],[17,12],[18,12],[19,12],[20,12],[21,12],[22,12],[23,12],[24,12],[16,13],[16,14],[16,15],[16,16],[20,13],[20,14],[20,15],[20,16]].forEach(([x,y]) => grid[y][x].type = 'road');
  [[14,10],[15,10],[14,11],[15,11],[14,16],[15,16],[17,10],[18,10],[19,10]].forEach(([x,y]) => grid[y][x] = { type: 'residential', level: 1, age: 1 });
  [[22,10],[23,10],[22,11]].forEach(([x,y]) => grid[y][x] = { type: 'commercial', level: 1, age: 1 });
  [[22,15],[23,15]].forEach(([x,y]) => grid[y][x] = { type: 'industrial', level: 1, age: 1 });
}
seedCity();

function resize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cell = Math.min(34, (rect.height - 50) / ROWS) * zoom;
  ox = (rect.width - COLS * cell) / 2;
  oy = (rect.height - 25 - ROWS * cell) / 2;
}
window.addEventListener('resize', resize);
resize();

function roadAt(x, y) {
  return x >= 0 && y >= 0 && x < COLS && y < ROWS && grid[y][x].type === 'road';
}

function nearbyRoad(x, y) {
  for (let yy = -1; yy <= 1; yy++) {
    for (let xx = -1; xx <= 1; xx++) {
      if (roadAt(x + xx, y + yy)) return true;
    }
  }
  return false;
}

function serviceCoverage(type) {
  let coverage = 0;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (grid[y][x].type === type) {
        coverage += 1;
      }
    }
  }
  return coverage;
}

function posFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.floor((e.clientX - rect.left - ox) / cell),
    y: Math.floor((e.clientY - rect.top - oy) / cell),
  };
}

function draw() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const night = Math.max(0, (state.hour - 18) / 7) + Math.max(0, (7 - state.hour) / 7);

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = night > 0.4 ? '#102129' : '#1c3531';
  ctx.fillRect(0, 0, w, h);

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const c = grid[y][x];
      const px = ox + x * cell;
      const py = oy + y * cell;

      ctx.fillStyle = heat && c.type === 'road'
        ? `rgba(230, ${Math.max(35, 170 - state.traffic * 3)}, 60, .7)`
        : c.type === 'empty' ? '#20413d' : '#1b3937';
      ctx.fillRect(px + 1, py + 1, cell - 2, cell - 2);

      if (c.type === 'road') {
        ctx.fillStyle = '#3c4b51';
        ctx.fillRect(px, py, cell, cell);
        ctx.strokeStyle = '#b9ad72';
        ctx.setLineDash([5, 6]);
        ctx.beginPath();
        ctx.moveTo(px + cell / 2, py + 2);
        ctx.lineTo(px + cell / 2, py + cell - 2);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (c.type !== 'empty') {
        drawBuilding(px, py, c);
      } else {
        ctx.fillStyle = '#1b4b42';
        ctx.globalAlpha = 0.45;
        ctx.fillRect(px + 4, py + 4, cell - 8, cell - 8);
        ctx.globalAlpha = 1;
      }
    }
  }

  ctx.strokeStyle = '#83ad9a22';
  ctx.lineWidth = 2;
  for (let y = 0; y <= ROWS; y++) {
    ctx.beginPath();
    ctx.moveTo(ox, oy + y * cell);
    ctx.lineTo(ox + COLS * cell, oy + y * cell);
    ctx.stroke();
  }
  for (let x = 0; x <= COLS; x++) {
    ctx.beginPath();
    ctx.moveTo(ox + x * cell, oy);
    ctx.lineTo(ox + x * cell, oy + ROWS * cell);
    ctx.stroke();
  }

  drawAgents();
  if (night > 0.2) {
    ctx.fillStyle = `rgba(5,12,29, ${Math.min(0.55, night * 0.5)})`;
    ctx.fillRect(0, 0, w, h);
  }
}

function drawBuilding(px, py, c) {
  const col = colors[c.type] || '#71818b';
  const pad = cell * 0.13;
  const h = cell * (0.42 + c.level * 0.12);

  ctx.fillStyle = col + '55';
  ctx.fillRect(px + pad, py + cell - h - pad, cell - pad * 2, h);
  ctx.fillStyle = col;
  ctx.fillRect(px + pad + 2, py + cell - h - pad + 2, cell - pad * 2 - 4, h - 2);

  ctx.fillStyle = '#d8e6df88';
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < Math.min(4, c.level + 1); j++) {
      ctx.fillRect(px + pad + 5 + i * 6, py + cell - h + 7 + j * 7, 3, 3);
    }
  }

  if (c.type === 'park') {
    ctx.fillStyle = '#73d18b';
    ctx.beginPath();
    ctx.arc(px + cell / 2, py + cell * 0.48, cell * 0.22, 0, Math.PI * 2);
    ctx.fill();
  }

  if (['school', 'clinic', 'police'].includes(c.type)) {
    ctx.fillStyle = '#f4e5b4';
    ctx.font = `${cell * 0.32}px Arial`;
    ctx.textAlign = 'center';
    const icon = c.type === 'clinic' ? '✚' : c.type === 'school' ? '✧' : '◆';
    ctx.fillText(icon, px + cell / 2, py + cell * 0.62);
  }
}

function drawAgents() {
  agents.forEach((a) => {
    const px = ox + a.x * cell + cell / 2;
    const py = oy + a.y * cell + cell / 2;
    ctx.fillStyle = a.kind === 'worker' ? '#f1b36e' : '#80d7cb';
    ctx.beginPath();
    ctx.arc(px, py, Math.max(2, cell * 0.09), 0, Math.PI * 2);
    ctx.fill();
  });
}

function rebuildAgents() {
  agents.length = 0;
  const homeTiles = [];
  const jobTiles = [];

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const c = grid[y][x];
      if (c.type === 'residential') {
        for (let i = 0; i < Math.max(1, c.level * 2); i++) homeTiles.push({ x, y });
      }
      if (['commercial', 'industrial'].includes(c.type)) {
        for (let i = 0; i < Math.max(1, c.level * 2); i++) jobTiles.push({ x, y });
      }
    }
  }

  const targetCount = clamp(Math.max(8, state.pop), 8, 120);
  for (let i = 0; i < targetCount; i++) {
    const home = homeTiles[i % Math.max(1, homeTiles.length)] || { x: 15, y: 10 };
    const job = jobTiles[i % Math.max(1, jobTiles.length)] || { x: 20, y: 12 };
    agents.push({
      id: i,
      kind: 'worker',
      home,
      job,
      x: home.x + 0.5,
      y: home.y + 0.5,
      phase: Math.random() * 2,
    });
  }
}

function updateAgents(dt) {
  if (paused) return;
  agents.forEach((a) => {
    a.phase = (a.phase + dt * 0.00035 * speed) % 2;
    const target = a.phase < 1 ? a.job : a.home;
    a.x += (target.x + 0.5 - a.x) * dt * 0.0012 * speed;
    a.y += (target.y + 0.5 - a.y) * dt * 0.0012 * speed;
  });
}

function act(x, y) {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return;
  const c = grid[y][x];

  if (tool === 'inspect') {
    showInspect(c, x, y);
    return;
  }

  if (tool === 'bulldoze') {
    if (c.type !== 'empty') {
      grid[y][x] = { type: 'empty', level: 0, age: 0 };
      state.money += 80;
      notify('Terreno liberado · +$80');
      updateMetrics();
    }
    return;
  }

  const cost = costs[tool] || 0;
  if (state.money < cost) {
    notify('Orçamento insuficiente');
    return;
  }

  if (tool === 'road') {
    if (c.type !== 'empty' && c.type !== 'road') {
      notify('Remova o prédio antes de construir');
      return;
    }
  } else if (c.type !== 'empty') {
    notify('Esse terreno já está ocupado');
    return;
  }

  grid[y][x] = { type: tool, level: 1, age: 0 };
  state.money -= cost;

  const label = {
    road: 'Estrada construída',
    residential: 'Zona residencial criada',
    commercial: 'Zona comercial criada',
    industrial: 'Zona industrial criada',
    school: 'Escola inaugurada',
    clinic: 'Clínica instalada',
    park: 'Parque construído',
    police: 'Segurança construída',
  };

  notify(label[tool] || 'Construção concluída');
  updateMetrics();
}

function setTool(t) {
  tool = t;
  document.querySelectorAll('.tool, .service').forEach((b) => {
    b.classList.toggle('active', b.dataset.tool === t);
  });

  const labels = {
    inspect: 'Selecione uma ferramenta',
    road: 'Construir estrada',
    residential: 'Pintar zona residencial',
    commercial: 'Pintar zona comercial',
    industrial: 'Pintar zona industrial',
    bulldoze: 'Demolir',
    school: 'Posicionar escola',
    clinic: 'Posicionar clínica',
    park: 'Posicionar parque',
    police: 'Posicionar segurança',
  };

  document.getElementById('toolLabel').textContent = labels[t] || 'Selecione uma ferramenta';
}

function showInspect(c, x, y) {
  const card = document.getElementById('inspectCard');
  card.classList.remove('hidden');

  const title = c.type === 'empty' ? 'Terreno vazio' : c.type === 'road' ? 'Estrada local' : c.type.charAt(0).toUpperCase() + c.type.slice(1);
  document.getElementById('inspectTitle').textContent = title;

  const text = c.type === 'empty'
    ? `Setor ${x + 1}-${y + 1}. Construa perto de estradas.`
    : `Nível ${c.level || 1} · Idade ${c.age || 0} dias · ${nearbyRoad(x, y) ? 'conectado à rede' : 'sem acesso viário'}.`;

  document.getElementById('inspectText').textContent = text;
}

function notify(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1700);
}

function updateMetrics() {
  const counts = { residential: 0, commercial: 0, industrial: 0, road: 0, park: 0, school: 0, clinic: 0, police: 0 };
  let totalConnected = 0;

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const c = grid[y][x];
      if (c.type in counts) counts[c.type] += 1;
      if (c.type === 'residential' && nearbyRoad(x, y)) totalConnected += 1;
    }
  }

  const schoolBoost = serviceCoverage('school') * 2;
  const clinicBoost = serviceCoverage('clinic') * 1.5;
  const parkBoost = serviceCoverage('park') * 1.8;
  const policeBoost = serviceCoverage('police') * 1.2;

  state.pop = clamp(20 + counts.residential * 4 + Math.floor((state.day - 1) * 2) + totalConnected * 2 + schoolBoost + clinicBoost, 0, 200);
  state.jobs = 12 + counts.commercial * 5 + counts.industrial * 7 + parkBoost;
  state.traffic = clamp(Math.floor(counts.road * 1.7 + state.pop / 5), 5, 98);
  state.power = clamp(100 - counts.residential * 2 - counts.commercial * 3 - counts.industrial * 4 + policeBoost, 35, 100);
  state.water = clamp(100 - counts.residential * 2 - counts.commercial * 2 + schoolBoost, 40, 100);
  state.pollution = clamp(8 + counts.industrial * 3 - counts.park * 2 + Math.max(0, counts.road - 30), 0, 90);
  state.happiness = clamp(76 - Math.floor(state.pollution / 4) - (state.traffic > 60 ? 10 : 0) + Math.min(12, counts.park * 2) + Math.min(8, counts.school * 1.5) + Math.min(8, counts.clinic * 1.1) + Math.min(5, counts.police), 20, 99);

  document.getElementById('money').textContent = '$ ' + Math.floor(state.money).toLocaleString('pt-BR');
  document.getElementById('population').textContent = state.pop;
  document.getElementById('jobs').textContent = `${Math.min(state.jobs, state.pop)} / ${state.pop}`;
  document.getElementById('happiness').textContent = state.happiness + '%';
  document.getElementById('traffic').textContent = state.traffic + '%';
  document.getElementById('pollution').textContent = '● ' + state.pollution + '%';
  document.getElementById('power').textContent = '● ' + state.power + '%';
  document.getElementById('water').textContent = '● ' + state.water + '%';
  document.getElementById('income').textContent = '$ ' + Math.floor(200 + state.pop * 5) + ' /dia';

  const trafficState = document.getElementById('trafficState');
  trafficState.textContent = state.traffic < 35 ? 'fluido' : state.traffic < 65 ? 'moderado' : 'congestionado';
  trafficState.className = state.traffic < 65 ? 'positive' : '';

  const demandValues = [
    clamp(60 + state.pop % 25, 0, 95),
    clamp(30 + counts.commercial * 8, 0, 90),
    clamp(25 + counts.industrial * 7, 0, 90),
  ];

  ['res', 'com', 'ind'].forEach((key, index) => {
    document.getElementById(key + 'Demand').textContent = demandValues[index] + '%';
    document.getElementById(key + 'Bar').style.width = demandValues[index] + '%';
  });

  document.getElementById('dateLabel').textContent = `Dia ${state.day} · ${String(Math.floor(state.hour)).padStart(2, '0')}:00`;
  rebuildAgents();
}

function dailyTick() {
  const nowCounts = { residential: 0, commercial: 0, industrial: 0, park: 0, school: 0, clinic: 0, police: 0 };
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const c = grid[y][x];
      if (c.type in nowCounts) nowCounts[c.type] += 1;
      if (['residential', 'commercial', 'industrial'].includes(c.type) && nearbyRoad(x, y)) {
        c.age += 1;
        if (c.age > 2 && c.level < 4 && Math.random() < 0.35) c.level += 1;
      }
    }
  }

  state.money += 200 + state.pop * 5;
  state.day += 1;

  if (state.day >= state.nextEventDay) {
    const events = [
      { label: 'Festival no parque', text: 'A felicidade subiu temporariamente.', mod: 6 },
      { label: 'Congestionamento', text: 'Mais veículos estão circulando.', mod: -5 },
      { label: 'Investimento regional', text: 'A cidade recebeu um subsídio.', mod: 1200 },
      { label: 'Fome de serviços', text: 'Falta cobertura de infraestrutura.', mod: -4 },
    ];
    const event = events[Math.floor(Math.random() * events.length)];
    if (event.mod > 100) {
      state.money += event.mod;
    } else if (event.mod < 0) {
      state.happiness = clamp(state.happiness + event.mod, 0, 100);
    } else {
      state.happiness = clamp(state.happiness + event.mod, 0, 100);
    }
    notify(`${event.label} · ${event.text}`);
    state.nextEventDay += 3 + Math.floor(Math.random() * 3);
  }

  updateMetrics();
}

function tick(timestamp) {
  if (!tick.last) tick.last = timestamp;
  const dt = timestamp - tick.last;
  tick.last = timestamp;

  if (!paused) {
    state.hour += 0.025 * speed;
    if (state.hour >= 24) {
      state.hour = 0;
      dailyTick();
    }
  }

  updateAgents(dt);
  draw();
  requestAnimationFrame(tick);
}

canvas.addEventListener('pointerdown', (e) => {
  drag = true;
  canvas.setPointerCapture(e.pointerId);
  const p = posFromEvent(e);
  lastCell = p;
  act(p.x, p.y);
});

canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const p = posFromEvent(e);
  if (!lastCell || p.x !== lastCell.x || p.y !== lastCell.y) {
    lastCell = p;
    act(p.x, p.y);
  }
});

['pointerup', 'pointercancel', 'pointerleave'].forEach((eventName) => {
  canvas.addEventListener(eventName, () => {
    drag = false;
    lastCell = null;
  });
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoom = clamp(zoom + (e.deltaY < 0 ? 0.08 : -0.08), 0.7, 1.6);
  resize();
}, { passive: false });

canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  setTool('inspect');
});

document.querySelectorAll('[data-tool]').forEach((button) => {
  button.addEventListener('click', () => setTool(button.dataset.tool));
});

document.getElementById('closeInspect').addEventListener('click', () => {
  document.getElementById('inspectCard').classList.add('hidden');
});

document.getElementById('pauseBtn').addEventListener('click', () => {
  paused = !paused;
  document.getElementById('pauseBtn').textContent = paused ? '▶' : 'Ⅱ';
});

document.querySelectorAll('.speed').forEach((button) => {
  button.addEventListener('click', () => {
    speed = Number(button.dataset.speed);
    document.querySelectorAll('.speed').forEach((b) => b.classList.remove('active'));
    button.classList.add('active');
  });
});

document.getElementById('heatBtn').addEventListener('click', () => {
  heat = !heat;
  document.getElementById('heatBtn').textContent = heat ? '⌁ Ocultar tráfego' : '⌁ Mostrar tráfego';
});

document.getElementById('saveBtn').addEventListener('click', () => {
  localStorage.metropolisGenesis = JSON.stringify({ state, grid });
  notify('Cidade salva neste navegador');
});

document.getElementById('loadBtn').addEventListener('click', () => {
  try {
    const saved = JSON.parse(localStorage.metropolisGenesis);
    Object.assign(state, saved.state);
    saved.grid.forEach((row, y) => row.forEach((cellData, x) => { grid[y][x] = cellData; }));
    updateMetrics();
    notify('Cidade carregada');
  } catch (error) {
    notify('Nenhum salvamento encontrado');
  }
});

document.getElementById('helpBtn').addEventListener('click', () => {
  notify('V inspeção · R estrada · 1/2/3 zonas · B demolir · roda zoom · espaço pausa');
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    document.getElementById('pauseBtn').click();
  }

  const map = {
    v: 'inspect',
    r: 'road',
    '1': 'residential',
    '2': 'commercial',
    '3': 'industrial',
    b: 'bulldoze',
  };

  const nextTool = map[e.key.toLowerCase()];
  if (nextTool) setTool(nextTool);
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

updateMetrics();
requestAnimationFrame(tick);
