const $ = (s)=>document.querySelector(s);
const $$ = (s)=>Array.from(document.querySelectorAll(s));

// Storage
const store = {
  key: 'prestamista.v2',
  get(){ try { return JSON.parse(localStorage.getItem(this.key)) || { loans: [], tpl: null } } catch { return { loans: [], tpl: null } } },
  set(d){ localStorage.setItem(this.key, JSON.stringify(d)); }
};
let state = store.get();
let selectedLoanId = null;
let sigDataUrl = null;

// Utils
const fmt = (n, mon='ARS') => new Intl.NumberFormat('es-AR', {style:'currency', currency:mon}).format(n||0);
const uid = ()=> Math.random().toString(36).slice(2,9);

function calcPlan({ monto, interes, cuotas, fechaInicio, metodo }){
  const plan = []; let saldo = +monto; const i = (+interes/100);
  const cuotaFija = metodo==='frances' ? (saldo * i) / (1 - Math.pow(1 + i, -cuotas)) : null;
  for (let k=1;k<=cuotas;k++){
    const fec = dayjs(fechaInicio).add(k-1,'month');
    let interesCuota, amort, cuota;
    if (metodo==='frances'){ interesCuota = saldo * i; amort = cuotaFija - interesCuota; cuota = cuotaFija; }
    else { interesCuota = monto * i; amort = monto / cuotas; cuota = interesCuota + amort; }
    saldo = Math.max(0, saldo - amort);
    plan.push({ n:k, fecha:fec.format('YYYY-MM-DD'), interes:+interesCuota.toFixed(2), amort:+amort.toFixed(2), cuota:+cuota.toFixed(2), saldo:+saldo.toFixed(2) });
  }
  return plan;
}

function estadoPrestamo(loan){
  if (loan.cancelado) return { code:'cancelado', label:'Cancelado', cls:'bg-emerald-100 text-emerald-800' };
  const pagos = loan.pagos||[]; const plan = loan.plan||[]; const pagadas = pagos.length;
  if (pagadas>=plan.length && plan.length>0) return { code:'cancelado', label:'Cancelado', cls:'bg-emerald-100 text-emerald-800' };
  const idx = Math.min(pagadas, plan.length-1); const prox = plan[idx];
  if (!prox) return { code:'en_curso', label:'En curso', cls:'bg-slate-100 text-slate-800' };
  const gracia = Number(loan.gracia||0); const hoy = dayjs().startOf('day');
  const vto = dayjs(prox.fecha).date(loan.diaVto||dayjs(loan.fechaInicio).date()); const limite = vto.add(gracia,'day');
  if (hoy.isSame(vto)||hoy.isBefore(vto)) return { code:'en_tiempo', label:'En tiempo', cls:'bg-blue-100 text-blue-800' };
  if (hoy.isAfter(vto) && (hoy.isBefore(limite)||hoy.isSame(limite))) return { code:'mora_leve', label:'Mora leve', cls:'bg-yellow-100 text-yellow-800' };
  return { code:'mora_grave', label:'Mora grave', cls:'bg-red-100 text-red-800' };
}

function renderKPIs(){
  const totalPrestado = state.loans.reduce((a,l)=>a+Number(l.monto||0),0);
  const totalCobrado = state.loans.reduce((a,l)=>a+(l.pagos||[]).reduce((s,p)=>s+Number(p.monto||0),0),0);
  const enMora = state.loans.filter(l=>['mora_leve','mora_grave'].includes(estadoPrestamo(l).code));
  const totalMora = enMora.reduce((a,l)=>a+Number(l.monto||0),0);
  const tasa = state.loans.length? (enMora.length/state.loans.length*100):0;
  $('#kpiPrestado').textContent = fmt(totalPrestado);
  $('#kpiCobrado').textContent = fmt(totalCobrado);
  $('#kpiMora').textContent = fmt(totalMora);
  $('#kpiTasa').textContent = `${tasa.toFixed(1)}%`;
}

function renderLoans(){
  const q = ($('#search').value||'').toLowerCase(); const f = $('#filtroEstado').value; const tbody = $('#loansBody');
  tbody.innerHTML='';
  state.loans
    .filter(l => l.clienteNombre.toLowerCase().includes(q) || String(l.clienteDni||'').includes(q))
    .map(l => ({ l, est: estadoPrestamo(l) }))
    .filter(x => !f || x.est.code===f)
    .forEach(({l, est})=>{
      const pagos = l.pagos||[]; const plan = l.plan||[]; const pagadas = pagos.length; const prox = plan[Math.min(pagadas, plan.length-1)];
      const tr = document.createElement('tr');
      const whatsappLink = l.clienteTel ? `https://wa.me/${l.clienteTel.replace(/[^0-9]/g,'')}?text=${encodeURIComponent('Hola '+l.clienteNombre+', te recuerdo tu cuota del préstamo. Vence el '+ (prox? dayjs(prox.fecha).format('DD/MM/YYYY'):'-') +'.')}` : '#';
      tr.innerHTML = `
        <td class="p-2 font-medium">${l.clienteNombre}<div class="text-xs text-slate-500">DNI ${l.clienteDni||'-'}</div></td>
        <td class="p-2">${fmt(l.monto, l.moneda)}</td>
        <td class="p-2">${plan[0]? fmt(plan[0].cuota, l.moneda): '-'}</td>
        <td class="p-2">${pagadas} / ${plan.length||'-'}</td>
        <td class="p-2">${prox? dayjs(prox.fecha).format('DD/MM/YYYY'): '-'}</td>
        <td class="p-2"><span class="px-2 py-1 rounded ${est.cls}">${est.label}</span></td>
        <td class="p-2 flex flex-wrap gap-2">
          <button class="px-2 py-1 rounded border text-xs" data-act="pagar" data-id="${l.id}">Pago</button>
          <button class="px-2 py-1 rounded border text-xs" data-act="ver" data-id="${l.id}">Ver</button>
          <button class="px-2 py-1 rounded border text-xs" data-act="editar" data-id="${l.id}">Editar</button>
          <a class="px-2 py-1 rounded border text-xs" href="${whatsappLink}" target="_blank" rel="noopener">WhatsApp</a>
          <button class="px-2 py-1 rounded border text-xs text-red-700" data-act="borrar" data-id="${l.id}">Borrar</button>
        </td>`;
      tbody.appendChild(tr);
    });
}

function fillForm(l){
  $('#loanId').value = l.id||'';
  $('#clienteNombre').value = l.clienteNombre||'';
  $('#clienteDni').value = l.clienteDni||'';
  $('#clienteTel').value = l.clienteTel||'';
  $('#clienteEmail').value = l.clienteEmail||'';
  $('#clienteDom').value = l.clienteDom||'';
  $('#moneda').value = l.moneda||'ARS';
  $('#monto').value = l.monto||'';
  $('#interes').value = l.interes||'';
  $('#cuotas').value = l.cuotas||'';
  $('#fechaInicio').value = l.fechaInicio||'';
  $('#diaVto').value = l.diaVto||'';
  $('#gracia').value = l.gracia||3;
  $('#punitorio').value = l.punitorio||0;
  $('#metodo').value = l.metodo||'frances';
  $('#notas').value = l.notas||'';
}

function formToLoan(){
  return {
    id: $('#loanId').value || uid(),
    clienteNombre: $('#clienteNombre').value.trim(),
    clienteDni: $('#clienteDni').value.trim(),
    clienteTel: $('#clienteTel').value.trim(),
    clienteEmail: $('#clienteEmail').value.trim(),
    clienteDom: $('#clienteDom').value.trim(),
    moneda: $('#moneda').value,
    monto: Number($('#monto').value),
    interes: Number($('#interes').value),
    cuotas: Number($('#cuotas').value),
    fechaInicio: $('#fechaInicio').value,
    diaVto: Number($('#diaVto').value) || undefined,
    gracia: Number($('#gracia').value)||0,
    punitorio: Number($('#punitorio').value)||0,
    metodo: $('#metodo').value,
    notas: $('#notas').value.trim(),
  };
}

function upsertLoan(l){
  const idx = state.loans.findIndex(x=>x.id===l.id);
  if (idx>=0) state.loans[idx]=l; else state.loans.push(l);
  store.set(state); renderKPIs(); renderLoans();
}

function mostrarPlan(plan, moneda){
  const tbody = $('#tablaPlan'); tbody.innerHTML='';
  plan.forEach(r=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="p-2">${r.n}</td>
      <td class="p-2">${dayjs(r.fecha).format('DD/MM/YYYY')}</td>
      <td class="p-2 text-right">${fmt(r.interes, moneda)}</td>
      <td class="p-2 text-right">${fmt(r.amort, moneda)}</td>
      <td class="p-2 text-right">${fmt(r.cuota, moneda)}</td>
      <td class="p-2 text-right">${fmt(r.saldo, moneda)}</td>`;
    tbody.appendChild(tr);
  });
  $('#simulacion').classList.remove('hidden');
}

// Template helpers
async function loadTemplate(){
  if (state.tpl) return state.tpl;
  const resp = await fetch('/assets/contract_template.txt');
  const txt = await resp.text();
  state.tpl = txt; store.set(state);
  return state.tpl;
}
function saveTemplate(txt){ state.tpl = txt; store.set(state); }
function applyTemplate(tpl, data){
  return tpl.replace(/\{\{(\w+)\}\}/g, (_,k)=> (data[k]!==undefined? String(data[k]) : ''));
}

// PDF Generators
function genContratoPDF(l, tpl, prestamista){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:'pt', format:'a4' });
  const margin = 48; let y = margin;
  doc.setFont('times','bold'); doc.setFontSize(16);
  doc.text('CONTRATO DE PRÉSTAMO DE DINERO', margin, y); y+=24;
  doc.setFont('times','normal'); doc.setFontSize(11);
  const data = {
    prestamista_nombre: prestamista.nombre||'',
    prestamista_dni: prestamista.dni||'',
    prestamista_dom: prestamista.dom||'',
    deudor_nombre: l.clienteNombre||'',
    deudor_dni: l.clienteDni||'',
    deudor_dom: l.clienteDom||'',
    monto: fmt(l.monto, l.moneda),
    moneda: l.moneda,
    interes: l.interes,
    metodo: l.metodo==='frances'?'Francés (cuota fija)':'Interés simple',
    cuotas: l.cuotas,
    fecha_inicio: dayjs(l.fechaInicio).format('DD/MM/YYYY'),
    dia_vto: l.diaVto||dayjs(l.fechaInicio).date(),
    gracia: l.gracia||0,
    punitorio: l.punitorio||0,
    notas: l.notas||'-'
  };
  const cuerpo = applyTemplate(tpl, data);
  const lines = doc.splitTextToSize(cuerpo, 595 - margin*2);
  lines.forEach(line=>{ doc.text(line, margin, y); y+=16; if (y>780){ doc.addPage(); y=margin; }});
  y+=16; doc.text('Plan de pagos (resumen):', margin, y); y+=12;
  const plan = l.plan || calcPlan(l);
  (plan.slice(0,12)).forEach(r=>{
    doc.text(`${r.n}. ${dayjs(r.fecha).format('DD/MM/YYYY')} — Cuota: ${fmt(r.cuota,l.moneda)} — Saldo: ${fmt(r.saldo,l.moneda)}`, margin, y);
    y+=14; if (y>780){ doc.addPage(); y=margin; }
  });
  y+=16; doc.text('Firmas:', margin, y); y+=24;
  doc.text('Deudor: _______________________   Aclaración: ________________   DNI: ___________', margin, y); y+=24;
  doc.text('Prestamista: __________________   Aclaración: ________________   DNI: ___________', margin, y); y+=24;
  if (sigDataUrl){ try { doc.addImage(sigDataUrl,'PNG', 595 - margin - 180, y-60, 160, 50); doc.text('Firma digital del deudor', 595 - margin - 180, y); } catch(e){} }
  doc.save(`Contrato_${l.clienteNombre.replace(/\s+/g,'_')}.pdf`);
}

function genReciboPDF(l, pago){
  const { jsPDF } = window.jspdf; const doc = new jsPDF({ unit:'pt', format:'a5' });
  const margin = 36; let y = margin;
  doc.setFont('times','bold'); doc.setFontSize(14); doc.text('RECIBO DE PAGO', margin, y); y+=22;
  doc.setFont('times','normal'); doc.setFontSize(11);
  doc.text(`De: ${l.clienteNombre} (DNI ${l.clienteDni||'-'})`, margin, y); y+=16;
  doc.text(`Por: ${fmt(pago.monto, l.moneda)} — Fecha: ${dayjs(pago.fecha).format('DD/MM/YYYY')}`, margin, y); y+=16;
  doc.text(`Préstamo: ${fmt(l.monto, l.moneda)} | Interés ${l.interes}% | ${l.cuotas} cuotas`, margin, y); y+=16;
  doc.text(`Observaciones: ${pago.obs||'-'}`, margin, y); y+=24;
  doc.text('Firma: ____________________________', margin, y); y+=40;
  doc.save(`Recibo_${l.clienteNombre.replace(/\s+/g,'_')}_${dayjs(pago.fecha).format('YYYYMMDD')}.pdf`);
}

// .ics reminder
function downloadICS(loan){
  const plan = loan.plan || calcPlan(loan);
  const nextIdx = (loan.pagos||[]).length;
  const cuota = plan[nextIdx];
  if (!cuota){ alert('No hay próxima cuota.'); return; }
  const dt = dayjs(cuota.fecha).date(loan.diaVto||dayjs(loan.fechaInicio).date());
  const dtstart = dt.format('YYYYMMDDT090000'); // 9am local
  const dtend = dt.add(30,'minute').format('YYYYMMDDT093000');
  const summary = `Vencimiento cuota #${cuota.n} — ${loan.clienteNombre}`;
  const body = [
    'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Prestamista Pro//ES',
    'BEGIN:VEVENT',
    `UID:${loan.id}-${cuota.n}@prestamista.pro`,
    `DTSTAMP:${dayjs().utc().format('YYYYMMDDTHHmmss')}Z`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:Monto: ${fmt(cuota.cuota, loan.moneda)}\\nCliente: ${loan.clienteNombre}`,
    'END:VEVENT','END:VCALENDAR'
  ].join('\\r\\n');
  const blob = new Blob([body], {type:'text/calendar'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `cuota_${loan.clienteNombre.replace(/\s+/g,'_')}_${cuota.n}.ics`; a.click();
}

// UI events
$('#btnCalcular').addEventListener('click', ()=>{ const l=formToLoan(); l.plan=calcPlan(l); mostrarPlan(l.plan,l.moneda); });
$('#btnGuardar').addEventListener('click', ()=>{
  const l=formToLoan();
  if (!l.clienteNombre || !l.monto || !l.interes || !l.cuotas || !l.fechaInicio){ alert('Completá los campos obligatorios.'); return; }
  l.plan=calcPlan(l); l.pagos = state.loans.find(x=>x.id===l.id)?.pagos || []; upsertLoan(l); alert('Préstamo guardado');
});
$('#btnNuevo').addEventListener('click', ()=>{ fillForm({moneda:'ARS', metodo:'frances', gracia:3}); $('#simulacion').classList.add('hidden'); });

$('#loansBody').addEventListener('click', (e)=>{
  const btn = e.target.closest('button,a'); if (!btn) return;
  const id = btn.dataset.id; const act = btn.dataset.act;
  if (btn.tagName==='A') return; // allow WhatsApp link
  const loan = state.loans.find(x=>x.id===id); if (!loan) return;
  if (act==='editar'){ fillForm(loan); mostrarPlan(loan.plan||[], loan.moneda); window.scrollTo({top:0,behavior:'smooth'}); }
  if (act==='borrar'){ if(confirm('¿Eliminar préstamo?')){ state.loans = state.loans.filter(x=>x.id!==id); store.set(state); renderKPIs(); renderLoans(); } }
  if (act==='ver'){ const prox = (loan.plan||[])[Math.min((loan.pagos||[]).length, (loan.plan||[]).length-1)]; const resumen = `Cliente: ${loan.clienteNombre}\nMonto: ${fmt(loan.monto, loan.moneda)}\nCuotas: ${loan.cuotas}\nInterés: ${loan.interes}% mensual\nPróximo vto: ${prox? dayjs(prox.fecha).format('DD/MM/YYYY'):'-'}\nNotas: ${loan.notas||'-'}`; alert(resumen); }
  if (act==='pagar'){ openPagoModal(loan); }
});

$('#search').addEventListener('input', renderLoans);
$('#filtroEstado').addEventListener('change', renderLoans);

$('#btnContrato').addEventListener('click', async ()=>{
  const l=formToLoan();
  if (!l.clienteNombre || !l.monto || !l.interes || !l.cuotas || !l.fechaInicio){ alert('Completá los campos obligatorios.'); return; }
  l.plan = calcPlan(l);
  const tpl = await loadTemplate();
  const users = JSON.parse(localStorage.getItem('prestamista.users')||'[]');
  const sess = JSON.parse(localStorage.getItem('prestamista.session')||'{}');
  const me = users.find(u=>u.email===sess?.email)?.settings || { prestamista_nombre:'', prestamista_dni:'', prestamista_dom:'' };
  genContratoPDF(l, tpl, { nombre: me.prestamista_nombre, dni: me.prestamista_dni, dom: me.prestamista_dom });
});

$('#btnEditarPlantilla').addEventListener('click', async ()=>{
  const tpl = await loadTemplate();
  $('#tplText').value = tpl;
  $('#modalTpl').classList.remove('hidden');
});
$('#closeTpl').addEventListener('click', ()=> $('#modalTpl').classList.add('hidden'));
$('#btnTplSave').addEventListener('click', ()=>{ saveTemplate($('#tplText').value); alert('Plantilla guardada'); $('#modalTpl').classList.add('hidden'); });
$('#btnTplReset').addEventListener('click', async ()=>{ const resp = await fetch('/assets/contract_template.txt'); const txt = await resp.text(); $('#tplText').value = txt; });

$('#btnRenegociar').addEventListener('click', ()=>{
  const l = formToLoan();
  const nuevoInteres = prompt('Nuevo interés mensual (%)', l.interes);
  const cuotasRestantes = prompt('Cuotas restantes (recalcular plan desde la próxima)', Math.max(1, l.cuotas - (state.loans.find(x=>x.id===l.id)?.pagos||[]).length));
  if (nuevoInteres===null || cuotasRestantes===null) return;
  const pagas = (state.loans.find(x=>x.id===l.id)?.pagos||[]).length || 0;
  const plan = l.plan || calcPlan(l);
  const saldo = plan[plan.length-1]?.saldo || l.monto;
  const restante = saldo; // simplificado
  const nuevo = {
    ...l,
    interes: Number(nuevoInteres),
    cuotas: Number(cuotasRestantes),
    fechaInicio: dayjs().format('YYYY-MM-DD'),
    monto: restante,
  };
  nuevo.plan = calcPlan(nuevo);
  fillForm(nuevo);
  mostrarPlan(nuevo.plan, nuevo.moneda);
  alert('Renegociación simulada. Guardá para aplicar.');
});

$('#btnRecordatorio').addEventListener('click', ()=>{
  const l = formToLoan();
  if (!l.clienteNombre || !l.cuotas || !l.fechaInicio){ alert('Completá cliente, cuotas y fecha.'); return; }
  l.plan = calcPlan(l);
  downloadICS(l);
});

// Modal pago
function openPagoModal(loan){
  selectedLoanId = loan.id;
  $('#pagoFecha').value = dayjs().format('YYYY-MM-DD');
  $('#pagoMonto').value = loan.plan?.[0]?.cuota || '';
  $('#pagoObs').value = '';
  $('#modal').classList.remove('hidden');
}
$('#closeModal').addEventListener('click', ()=>$('#modal').classList.add('hidden'));
$('#btnGuardarPago').addEventListener('click', ()=>{
  const loan = state.loans.find(x=>x.id===selectedLoanId); if (!loan) return;
  loan.pagos = loan.pagos||[];
  loan.pagos.push({ fecha: $('#pagoFecha').value, monto: Number($('#pagoMonto').value||0), obs: $('#pagoObs').value||'' });
  if ((loan.pagos||[]).length >= (loan.plan||[]).length) loan.cancelado = true;
  upsertLoan(loan);
  $('#modal').classList.add('hidden');
});
$('#btnRecibo').addEventListener('click', ()=>{
  const loan = state.loans.find(x=>x.id===selectedLoanId); if (!loan) return;
  const pago = { fecha: $('#pagoFecha').value, monto: Number($('#pagoMonto').value||0), obs: $('#pagoObs').value||'' };
  genReciboPDF(loan, pago);
});

// Signature canvas
const canvas = document.getElementById('signaturePad'); const ctx = canvas.getContext('2d'); let drawing=false; let last={x:0,y:0};
function getPos(e){ const r=canvas.getBoundingClientRect(); const x=(e.touches? e.touches[0].clientX:e.clientX)-r.left; const y=(e.touches? e.touches[0].clientY:e.clientY)-r.top; return {x,y}; }
function start(e){ drawing=true; last=getPos(e); }
function move(e){ if(!drawing) return; e.preventDefault(); const p=getPos(e); ctx.lineWidth=2; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(last.x,last.y); ctx.lineTo(p.x,p.y); ctx.stroke(); last=p; }
function end(){ drawing=false; }
canvas.addEventListener('mousedown',start); canvas.addEventListener('mousemove',move); window.addEventListener('mouseup',end);
canvas.addEventListener('touchstart',start,{passive:false}); canvas.addEventListener('touchmove',move,{passive:false}); canvas.addEventListener('touchend',end);
$('#btnClearSig').addEventListener('click',()=>{ ctx.clearRect(0,0,canvas.width,canvas.height); sigDataUrl=null; $('#sigStatus').textContent='Firma borrada.'; });
$('#btnUseSig').addEventListener('click',()=>{ sigDataUrl = canvas.toDataURL('image/png'); $('#sigStatus').textContent='La firma se insertará en el próximo contrato.'; });

// Init
function init(){
  function resizeCanvas(){ const w = canvas.clientWidth; const h = canvas.clientHeight; const data = ctx.getImageData(0,0,canvas.width||1,canvas.height||1); canvas.width=w; canvas.height=h; try{ ctx.putImageData(data,0,0);}catch{} }
  new ResizeObserver(resizeCanvas).observe(canvas);
  renderKPIs(); renderLoans();
  fillForm({ moneda:'ARS', metodo:'frances', gracia:3, fechaInicio: dayjs().format('YYYY-MM-DD') });
}
init();
