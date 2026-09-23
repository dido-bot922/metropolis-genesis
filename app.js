const canvas = document.getElementById('cityCanvas');
const ctx = canvas.getContext('2d');
const COLS = 34;
const ROWS = 24;
let cell = 30;
let ox = 0;
let oy = 0;
let tool = 'inspect';
let paused = false;
let speed = 1;
let heat = false;
let drag = false;
let lastCell = null;
let toastTimer = null;

const state = {
  money: 24800,
  pop: 24,
  jobs: 18,
  happiness: 78,
  traffic: 12,
  pollution: 8,
  day: 1,
  hour: 8,
  weather: 'Céu limpo',
};

const grid = Array.from({ length: ROWS }, () =>
  Array.from({ length: COLS }, () => ({ type: 'empty', level: 0 }))
);

[[16,12],[17,12],[18,12],[19,12],[20,12],[21,12],[22,12],[23,12],[24,12],[16,13],[16,14],[16,15],[16,16],[20,13],[20,14],[20,15],[20,16]].forEach(([x,y]) => grid[y][x].type = 'road');
[[14,10],[15,10],[14,11],[15,11],[14,16],[15,16],[17,10],[18,10],[19,10]].forEach(([x,y]) => grid[y][x] = { type: 'residential', level: 1 });
[[22,10],[23,10],[22,11]].forEach(([x,y]) => grid[y][x] = { type: 'commercial', level: 1 });
[[22,15],[23,15]].forEach(([x,y]) => grid[y][x] = { type: 'industrial', level: 1 });

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

function resize() {
  const r = canvas.getBoundingClientRect();
  const d = window.devicePixelRatio || 1;
  canvas.width = r.width * d;
  canvas.height = r.height * d;
  ctx.setTransform(d, 0, 0, d, 0, 0);
  cell = Math.min(34, (r.height - 50) / ROWS);
  ox = (r.width - COLS * cell) / 2;
  oy = (r.height - 25 - ROWS * cell) / 2;
}

window.addEventListener('resize', resize);
resize();

function draw() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;

  ctx.clearRect(0, 0, w, h);
  const night = Math.max(0, (state.hour - 18) / 7) + Math.max(0, (7 - state.hour) / 7);

  ctx.fillStyle = night > 0.4 ? '#102129' : '#1c3531';
  ctx.fillRect(0, 0, w, h);

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const cellData = grid[y][x];
      const px = ox + x * cell;
      const py = oy + y * cell;

      ctx.fillStyle = heat && cellData.type === 'road'
        ? `rgba(230, ${Math.max(35, 170 - state.traffic * 3)}, 60, .65)`
        : (cellData.type === 'empty' ? '#20413d' : '#1b3937');
      ctx.fillRect(px + 1, py + 1, cell - 2, cell - 2);

      if (cellData.type === 'road') {
        ctx.fillStyle = '#3c4b51';
        ctx.fillRect(px, py, cell, cell);
        ctx.strokeStyle = '#b9ad72';
        ctx.setLineDash([5, 6]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px + cell / 2, py + 2);
        ctx.lineTo(px + cell / 2, py + cell - 2);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (cellData.type !== 'empty') {
        drawBuilding(px, py, cellData);
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

  drawVehicles();

  if (night > 0.2) {
    ctx.fillStyle = `rgba(5,12,29, ${Math.min(0.55, night * 0.5)})`;
    ctx.fillRect(0, 0, w, h);
  }
}

function drawBuilding(px, py, c) {
  const col = colors[c.type];
  const pad = cell * 0.13;
  const h = cell * (0.42 + c.level * 0.12);

  ctx.fillStyle = col + '55';
  ctx.fillRect(px + pad, py + cell - h - pad, cell - pad * 2, h);
  ctx.fillStyle = col;
  ctx.fillRect(px + pad + 2, py + cell - h - pad + 2, cell - pad * 2 - 4, h - 2);

  ctx.fillStyle = '#d8e6df88';
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < Math.min(3, c.level + 1); j++) {
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

function drawVehicles() {
  const t = Date.now() / 700;
  const vehicleCount = Math.min(18, state.traffic + 4);

  for (let i = 0; i < vehicleCount; i++) {
    const x = (i * 7.3 + t * (0.15 + i % 3 * 0.04)) % COLS;
    const y = (i * 5 + 2) % ROWS;
    if (grid[y] && grid[y][Math.floor(x)] && grid[y][Math.floor(x)].type === 'road') {
      ctx.fillStyle = i % 3 ? '#e7a866' : '#77c6d6';
      ctx.beginPath();
      ctx.arc(ox + x * cell + cell / 2, oy + y * cell + cell / 2, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function pos(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.floor((e.clientX - rect.left - ox) / cell),
    y: Math.floor((e.clientY - rect.top - oy) / cell),
  };
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
      grid[y][x] = { type: 'empty', level: 0 };
      state.money += 80;
      notify('Terreno liberado · +$80');
    }
    return;
  }

  const costMap = {
    road: 120,
    school: 1200,
    clinic: 1600,
    police: 1000,
    park: 500,
    residential: 25,
    commercial: 30,
    industrial: 35,
  };

  const cost = costMap[tool] || 0;

  if (state.money < cost) {
    notify('Orçamento insuficiente');
    return;
  }

  if (c.type !== 'empty' && tool !== 'road') {
    notify('Esse terreno já está ocupado');
    return;
  }

  grid[y][x] = { type: tool, level: 1 };
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
  update();
}

canvas.addEventListener('pointerdown', (e) => {
  drag = true;
  canvas.setPointerCapture(e.pointerId);
  const p = pos(e);
  lastCell = p;
  act(p.x, p.y);
});

canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const p = pos(e);
  if (!lastCell || p.x !== lastCell.x || p.y !== lastCell.y) {
    lastCell = p;
    act(p.x, p.y);
  }
});

canvas.addEventListener('pointerup', () => { drag = false; lastCell = null; });
canvas.addEventListener('pointerleave', () => { drag = false; lastCell = null; });
canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  setTool('inspect');
});

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

document.querySelectorAll('[data-tool]').forEach((b) => {
  b.addEventListener('click', () => {
    setTool(b.dataset.tool);
  });
});

function showInspect(c, x, y) {
  const card = document.getElementById('inspectCard');
  card.classList.remove('hidden');

  const title = c.type === 'empty' ? 'Terreno vazio' : c.type === 'road' ? 'Estrada local' : c.type.charAt(0).toUpperCase() + c.type.slice(1);
  document.getElementById('inspectTitle').textContent = title;

  const text = c.type === 'empty'
    ? `Setor ${x + 1}-${y + 1}. Selecione uma ferramenta para transformar o terreno.`
    : `Nível ${c.level || 1} · Clique em Demolir para remover esta construção.`;

  document.getElementById('inspectText').textContent = text;
}

document.getElementById('closeInspect').addEventListener('click', () => {
  document.getElementById('inspectCard').classList.add('hidden');
});

function notify(message) {
  const t = document.getElementById('toast');
  t.textContent = message;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1700);
}

function update() {
  const counts = { residential: 0, commercial: 0, industrial: 0, road: 0 };

  grid.flat().forEach((c) => {
    if (c.type in counts) counts[c.type] = (counts[c.type] || 0) + 1;
  });

  state.pop = Math.max(0, 20 + counts.residential * 4 + Math.floor((state.day - 1) * 2));
  state.jobs = 12 + counts.commercial * 5 + counts.industrial * 7;
  state.traffic = Math.min(98, Math.max(5, Math.floor(counts.road * 1.7 + state.pop / 5)));
  state.happiness = Math.max(35, Math.min(99, 80 - Math.floor(state.pollution / 3) - (state.traffic > 60 ? 10 : 0)));

  document.getElementById('money').textContent = '$ ' + Math.floor(state.money).toLocaleString('pt-BR');
  document.getElementById('population').textContent = state.pop;
  document.getElementById('jobs').textContent = `${Math.min(state.jobs, state.pop)} / ${state.pop}`;
  document.getElementById('happiness').textContent = state.happiness + '%';
  document.getElementById('traffic').textContent = state.traffic + '%';

  const trafficState = document.getElementById('trafficState');
  trafficState.textContent = state.traffic < 35 ? 'fluido' : state.traffic < 65 ? 'moderado' : 'congestionado';
  trafficState.className = state.traffic < 65 ? 'positive' : '';

  document.getElementById('income').textContent = '$ ' + Math.floor(200 + state.pop * 5) + ' /dia';

  const demandValues = [
    Math.min(95, 62 + state.pop % 20),
    Math.min(90, 30 + counts.commercial * 8),
    Math.min(90, 25 + counts.industrial * 7),
  ];

  ['res', 'com', 'ind'].forEach((v, i) => {
    document.getElementById(v + 'Demand').textContent = demandValues[i] + '%';
    document.getElementById(v + 'Bar').style.width = demandValues[i] + '%';
  });

  document.getElementById('pollution').textContent = '● ' + state.pollution + '%';
  document.getElementById('dateLabel').textContent = `Dia ${state.day} · ${String(Math.floor(state.hour)).padStart(2, '0')}:00`;
}

function tick() {
  if (!paused) {
    state.hour += 0.025 * speed;
    if (state.hour >= 24) {
      state.hour = 0;
      state.day += 1;
      state.money += 200 + state.pop * 5;
      state.pollution = Math.min(90, state.pollution + (grid.flat().filter((c) => c.type === 'industrial').length ? 1 : 0));
      update();
    }
  }

  draw();
  requestAnimationFrame(tick);
}

document.getElementById('pauseBtn').addEventListener('click', () => {
  paused = !paused;
  document.getElementById('pauseBtn').textContent = paused ? '▶' : 'Ⅱ';
});

document.querySelectorAll('.speed').forEach((b) => {
  b.addEventListener('click', () => {
    speed = Number(b.dataset.speed);
    document.querySelectorAll('.speed').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
  });
});

document.getElementById('heatBtn').addEventListener('click', () => {
  heat = !heat;
  document.getElementById('heatBtn').textContent = heat ? '⌁ Ocultar tráfego' : '⌁ Mostrar tráfego';
});

document.getElementById('saveBtn').addEventListener('click', () => {
  localStorage.metropolis = JSON.stringify({ state, grid });
  notify('Cidade salva neste navegador');
});

document.getElementById('loadBtn').addEventListener('click', () => {
  try {
    const saved = JSON.parse(localStorage.metropolis);
    Object.assign(state, saved.state);
    saved.grid.forEach((row, y) => row.forEach((c, x) => { grid[y][x] = c; }));
    update();
    notify('Cidade carregada');
  } catch (error) {
    notify('Nenhum salvamento encontrado');
  }
});

document.getElementById('helpBtn').addEventListener('click', () => {
  notify('Atalhos: V inspeção · R estrada · 1/2/3 zonas · B demolir · Espaço pausa');
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

update();
tick();
