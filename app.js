const canvas = document.getElementById('cityCanvas');
const ctx = canvas.getContext('2d');
const COLS = 34, ROWS = 24;
let cell = 30, ox = 0, oy = 0, zoom = 1, tool = 'inspect';
let paused = false, speed = 1, heat = false, drag = false, lastCell = null, toastTimer;
const state = { money: 24800, pop: 24, jobs: 18, happiness: 78, traffic: 12, pollution: 8, power: 100, water: 100, day: 1, hour: 8, weather: 'Céu limpo', events: [] };
const grid = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => ({ type: 'empty', level: 0, age: 0 })));
const agents = [];
const colors = { residential:'#397da5', commercial:'#b17b3b', industrial:'#975394', school:'#4b83bc', clinic:'#b64d7d', park:'#3f9368', police:'#7258aa' };
const costs = { road:120, residential:25, commercial:30, industrial:35, school:1200, clinic:1600, park:500, police:1000 };

function seed() {
  [[16,12],[17,12],[18,12],[19,12],[20,12],[21,12],[22,12],[23,12],[24,12],[16,13],[16,14],[16,15],[16,16],[20,13],[20,14],[20,15],[20,16]].forEach(([x,y]) => grid[y][x].type='road');
  [[14,10],[15,10],[14,11],[15,11],[14,16],[15,16],[17,10],[18,10],[19,10]].forEach(([x,y]) => grid[y][x]={type:'residential',level:1,age:1});
  [[22,10],[23,10],[22,11]].forEach(([x,y]) => grid[y][x]={type:'commercial',level:1,age:1});
  [[22,15],[23,15]].forEach(([x,y]) => grid[y][x]={type:'industrial',level:1,age:1});
}
seed();

function resize() {
  const r = canvas.getBoundingClientRect(), d = devicePixelRatio || 1;
  canvas.width = r.width*d; canvas.height = r.height*d; ctx.setTransform(d,0,0,d,0,0);
  cell = Math.min(34, (r.height-50)/ROWS) * zoom;
  ox = (r.width-COLS*cell)/2; oy = (r.height-25-ROWS*cell)/2;
}
window.addEventListener('resize', resize); resize();

function screenToCell(e) { const r=canvas.getBoundingClientRect(); return { x:Math.floor((e.clientX-r.left-ox)/cell), y:Math.floor((e.clientY-r.top-oy)/cell) }; }
function roadAt(x,y) { return x>=0&&y>=0&&x<COLS&&y<ROWS&&grid[y][x].type==='road'; }
function nearbyRoad(x,y) { for(let yy=-1;yy<=1;yy++) for(let xx=-1;xx<=1;xx++) if(roadAt(x+xx,y+yy)) return true; return false; }

function draw() {
  const w=canvas.clientWidth,h=canvas.clientHeight, night=Math.max(0,(state.hour-18)/7)+Math.max(0,(7-state.hour)/7);
  ctx.clearRect(0,0,w,h); ctx.fillStyle=night>.4?'#102129':'#1c3531'; ctx.fillRect(0,0,w,h);
  for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++) {
    const c=grid[y][x], px=ox+x*cell, py=oy+y*cell;
    ctx.fillStyle=c.type==='road'&&heat?`rgba(230,${Math.max(35,170-state.traffic*3)},60,.7)`:c.type==='empty'?'#20413d':'#1b3937'; ctx.fillRect(px+1,py+1,cell-2,cell-2);
    if(c.type==='road') { ctx.fillStyle='#3c4b51';ctx.fillRect(px,py,cell,cell);ctx.strokeStyle='#b9ad72';ctx.setLineDash([5,6]);ctx.beginPath();ctx.moveTo(px+cell/2,py+2);ctx.lineTo(px+cell/2,py+cell-2);ctx.stroke();ctx.setLineDash([]); }
    else if(c.type!=='empty') drawBuilding(px,py,c);
    else { ctx.fillStyle='#1b4b42';ctx.globalAlpha=.45;ctx.fillRect(px+4,py+4,cell-8,cell-8);ctx.globalAlpha=1; }
  }
  ctx.strokeStyle='#83ad9a22';ctx.lineWidth=2;
  for(let y=0;y<=ROWS;y++){ctx.beginPath();ctx.moveTo(ox,oy+y*cell);ctx.lineTo(ox+COLS*cell,oy+y*cell);ctx.stroke();}
  for(let x=0;x<=COLS;x++){ctx.beginPath();ctx.moveTo(ox+x*cell,oy);ctx.lineTo(ox+x*cell,oy+ROWS*cell);ctx.stroke();}
  drawAgents(); if(night>.2){ctx.fillStyle=`rgba(5,12,29,${Math.min(.55,night*.5)})`;ctx.fillRect(0,0,w,h);}
}
function drawBuilding(px,py,c) {
  const col=colors[c.type]||'#71818b', pad=cell*.13, h=cell*(.42+c.level*.12);
  ctx.fillStyle=col+'55';ctx.fillRect(px+pad,py+cell-h-pad,cell-pad*2,h);ctx.fillStyle=col;ctx.fillRect(px+pad+2,py+cell-h-pad+2,cell-pad*2-4,h-2);
  ctx.fillStyle='#d8e6df88';for(let i=0;i<3;i++)for(let j=0;j<Math.min(4,c.level+1);j++)ctx.fillRect(px+pad+5+i*6,py+cell-h+7+j*7,3,3);
  if(c.type==='park'){ctx.fillStyle='#73d18b';ctx.beginPath();ctx.arc(px+cell/2,py+cell*.48,cell*.22,0,Math.PI*2);ctx.fill();}
  if(['school','clinic','police'].includes(c.type)){ctx.fillStyle='#f4e5b4';ctx.font=`${cell*.32}px Arial`;ctx.textAlign='center';ctx.fillText(c.type==='clinic'?'✚':c.type==='school'?'✧':'◆',px+cell/2,py+cell*.62);}
}
function drawAgents(){ agents.forEach(a=>{const px=ox+a.x*cell+cell/2,py=oy+a.y*cell+cell/2;ctx.fillStyle=a.kind==='worker'?'#f1b36e':'#80d7cb';ctx.beginPath();ctx.arc(px,py,Math.max(2,cell*.09),0,Math.PI*2);ctx.fill();}); }

function rebuildAgents(){
  agents.length=0; const homes=[], jobs=[];
  grid.forEach((row,y)=>row.forEach((c,x)=>{ if(c.type==='residential') for(let i=0;i<c.level*2;i++) homes.push({x,y}); if(['commercial','industrial'].includes(c.type)) for(let i=0;i<c.level*2;i++) jobs.push({x,y}); }));
  const count=Math.min(70,Math.max(8,state.pop));
  for(let i=0;i<count;i++){const h=homes[i%Math.max(1,homes.length)]||{x:15,y:10},j=jobs[i%Math.max(1,jobs.length)]||{x:20,y:12};agents.push({home:h,job:j,x:h.x,y:h.y,phase:Math.random(),kind:'worker'});}
}
function updateAgents(dt){ if(paused)return; agents.forEach(a=>{a.phase=(a.phase+dt*.00035*speed)%2;const target=a.phase<1?a.job:a.home;a.x+=(target.x-a.x)*dt*.0012*speed;a.y+=(target.y-a.y)*dt*.0012*speed;}); }

function act(x,y){ if(x<0||y<0||x>=COLS||y>=ROWS)return; const c=grid[y][x];
  if(tool==='inspect'){showInspect(c,x,y);return;}
  if(tool==='bulldoze'){if(c.type!=='empty'){grid[y][x]={type:'empty',level:0,age:0};state.money+=80;notify('Terreno liberado · +$80');update();}return;}
  const cost=costs[tool]||0; if(state.money<cost){notify('Orçamento insuficiente');return;}
  if(tool==='road'&&c.type!=='empty'&&c.type!=='road'){notify('Remova o prédio antes de construir');return;}
  if(tool!=='road'&&c.type!=='empty'){notify('Esse terreno já está ocupado');return;}
  grid[y][x]={type:tool,level:1,age:0};state.money-=cost;notify(({road:'Estrada construída',residential:'Zona residencial criada',commercial:'Zona comercial criada',industrial:'Zona industrial criada',school:'Escola inaugurada',clinic:'Clínica instalada',park:'Parque construído',police:'Segurança construída'})[tool]);update();
}

function setTool(t){tool=t;document.querySelectorAll('.tool,.service').forEach(b=>b.classList.toggle('active',b.dataset.tool===t));const labels={inspect:'Selecione uma ferramenta',road:'Construir estrada',residential:'Pintar zona residencial',commercial:'Pintar zona comercial',industrial:'Pintar zona industrial',bulldoze:'Demolir',school:'Posicionar escola',clinic:'Posicionar clínica',park:'Posicionar parque',police:'Posicionar segurança'};document.getElementById('toolLabel').textContent=labels[t];}
function showInspect(c,x,y){document.getElementById('inspectCard').classList.remove('hidden');document.getElementById('inspectTitle').textContent=c.type==='empty'?'Terreno vazio':c.type==='road'?'Estrada local':c.type.charAt(0).toUpperCase()+c.type.slice(1);document.getElementById('inspectText').textContent=c.type==='empty'?`Setor ${x+1}-${y+1}. Construa perto de estradas.`:`Nível ${c.level||1} · Idade ${c.age||0} dias · ${nearbyRoad(x,y)?'conectado à rede':'sem acesso viário'}.`;}
function notify(s){const t=document.getElementById('toast');t.textContent=s;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),1700);}

function update(){
  const count={residential:0,commercial:0,industrial:0,road:0,school:0,clinic:0,park:0,police:0};grid.flat().forEach(c=>count[c.type]=(count[c.type]||0)+1);
  const access=grid.flat().filter((c,i)=>c.type==='residential'&&nearbyRoad(i%COLS,Math.floor(i/COLS))).length;
  state.pop=Math.max(0,20+count.residential*4+Math.floor((state.day-1)*2)+access*2);
  state.jobs=12+count.commercial*5+count.industrial*7; state.traffic=Math.min(98,Math.max(5,Math.floor(count.road*1.7+state.pop/5)));
  state.power=Math.max(45,100-count.residential*2-count.commercial*3-count.industrial*4);state.water=Math.max(40,100-count.residential*2-count.commercial*2);
  state.pollution=Math.min(90,Math.max(0,8+count.industrial*3-count.park*2));
  state.happiness=Math.max(20,Math.min(99,76-Math.floor(state.pollution/4)-(state.traffic>60?10:0)+Math.min(12,count.park*2)+Math.min(5,count.school+count.clinic)));
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};set('money','$ '+Math.floor(state.money).toLocaleString('pt-BR'));set('population',state.pop);set('jobs',`${Math.min(state.jobs,state.pop)} / ${state.pop}`);set('happiness',state.happiness+'%');set('traffic',state.traffic+'%');set('income','$ '+Math.floor(200+state.pop*5)+' /dia');set('pollution','● '+state.pollution+'%');set('power','● '+state.power+'%');set('water','● '+state.water+'%');
  const ts=document.getElementById('trafficState');ts.textContent=state.traffic<35?'fluido':state.traffic<65?'moderado':'congestionado';ts.className=state.traffic<65?'positive':'';set('dateLabel',`Dia ${state.day} · ${String(Math.floor(state.hour)).padStart(2,'0')}:00`);rebuildAgents();
  [['res',Math.min(95,60+state.pop%25)],['com',Math.min(90,30+count.commercial*8)],['ind',Math.min(90,25+count.industrial*7)]].forEach(([v,n])=>{set(v+'Demand',n+'%');document.getElementById(v+'Bar').style.width=n+'%';});
}

function daily(){
  grid.flat().forEach(c=>{if(['residential','commercial','industrial'].includes(c.type)&&nearbyRoad(grid.flat().indexOf(c)%COLS,Math.floor(grid.flat().indexOf(c)/COLS))){c.age++;if(c.age>2&&c.level<4&&Math.random()<.35)c.level++;}});
  const balance=200+state.pop*5-count.industrial*0; state.money+=balance; state.day++; if(state.day%5===0) randomEvent(); update();
}
function randomEvent(){const events=[['Festival no parque','A felicidade subiu temporariamente.',3],['Alerta de congestionamento','Mais veículos estão circulando.',-4],['Investimento regional','A cidade recebeu um subsídio.',1200]];const e=events[Math.floor(Math.random()*events.length)];if(e[2]>50)state.money+=e[2];else state.happiness=Math.max(0,state.happiness+e[2]);notify(e[0]+' · '+e[1]);}
function tick(now){if(!tick.last)tick.last=now;const dt=now-tick.last;tick.last=now;if(!paused){state.hour+=.025*speed;if(state.hour>=24){state.hour=0;daily();}}updateAgents(dt);draw();requestAnimationFrame(tick);}

document.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.tool)));
canvas.addEventListener('pointerdown',e=>{drag=true;canvas.setPointerCapture(e.pointerId);const p=screenToCell(e);lastCell=p;act(p.x,p.y);});
canvas.addEventListener('pointermove',e=>{if(!drag)return;const p=screenToCell(e);if(!lastCell||p.x!==lastCell.x||p.y!==lastCell.y){lastCell=p;act(p.x,p.y);}});
['pointerup','pointercancel','pointerleave'].forEach(n=>canvas.addEventListener(n,()=>{drag=false;lastCell=null;}));
canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.7,Math.min(1.6,zoom+(e.deltaY<0?.08:-.08)));resize();},{passive:false});
canvas.addEventListener('contextmenu',e=>{e.preventDefault();setTool('inspect');});
document.getElementById('closeInspect').addEventListener('click',()=>document.getElementById('inspectCard').classList.add('hidden'));
document.getElementById('pauseBtn').addEventListener('click',()=>{paused=!paused;document.getElementById('pauseBtn').textContent=paused?'▶':'Ⅱ';});
document.querySelectorAll('.speed').forEach(b=>b.addEventListener('click',()=>{speed=+b.dataset.speed;document.querySelectorAll('.speed').forEach(x=>x.classList.remove('active'));b.classList.add('active');}));
document.getElementById('heatBtn').addEventListener('click',()=>{heat=!heat;document.getElementById('heatBtn').textContent=heat?'⌁ Ocultar tráfego':'⌁ Mostrar tráfego';});
document.getElementById('saveBtn').addEventListener('click',()=>{localStorage.metropolisGenesis=JSON.stringify({state,grid});notify('Cidade salva neste navegador');});
document.getElementById('loadBtn').addEventListener('click',()=>{try{const s=JSON.parse(localStorage.metropolisGenesis);Object.assign(state,s.state);s.grid.forEach((r,y)=>r.forEach((c,x)=>grid[y][x]=c));update();notify('Cidade carregada');}catch(e){notify('Nenhum salvamento encontrado');}});
document.getElementById('helpBtn').addEventListener('click',()=>notify('V inspeção · R estrada · 1/2/3 zonas · B demolir · roda zoom · espaço pausa'));
window.addEventListener('keydown',e=>{if(e.code==='Space'){e.preventDefault();document.getElementById('pauseBtn').click();}const k={v:'inspect',r:'road','1':'residential','2':'commercial','3':'industrial',b:'bulldoze'}[e.key.toLowerCase()];if(k)setTool(k);});
update();requestAnimationFrame(tick);
