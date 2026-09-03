import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requestedId = process.argv[2] || "digital-analytics-practitioners";
const sourceDir = join(root, "workshops", requestedId);
const outputDir = join(root, "dist", requestedId);
const workshop = JSON.parse(await readFile(join(sourceDir, "workshop.json"), "utf8"));

const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const jsonForScript = (value) => JSON.stringify(value).replaceAll("</script", "<\\/script");

function validate() {
  const total = workshop.run_of_show.reduce((sum, block) => sum + block.minutes, 0);
  if (total !== workshop.duration_minutes) {
    throw new Error(`Run of show is ${total} minutes; expected ${workshop.duration_minutes}.`);
  }
  const sequential = workshop.run_of_show.every((block, index, blocks) =>
    block.start === blocks.slice(0, index).reduce((sum, item) => sum + item.minutes, 0));
  if (!sequential) throw new Error("Run-of-show start times aren't sequential.");
  for (const [label, items] of [["block", workshop.run_of_show], ["slide", workshop.slides], ["action", workshop.actions]]) {
    const ids = items.map((item) => item.id);
    if (new Set(ids).size !== ids.length) throw new Error(`Duplicate ${label} ID.`);
  }
  const blockIds = new Set(workshop.run_of_show.map((block) => block.id));
  for (const slide of workshop.slides) {
    if (!blockIds.has(slide.block_id)) throw new Error(`Slide ${slide.id} has unknown block ${slide.block_id}.`);
    if (Array.isArray(slide.points) && slide.kind !== "inventory" && slide.points.length > 3) {
      throw new Error(`Slide ${slide.id} has more than three points.`);
    }
  }
  for (const station of workshop.run_of_show.filter((block) => block.mode === "hands-on" || block.mode === "optional")) {
    if (!station.done_when) throw new Error(`${station.id} needs a done_when line.`);
  }
}

validate();
await mkdir(outputDir, { recursive: true });

const readingCss = `
:root{--ink:#151821;--muted:#5f6675;--line:#dfe3ec;--paper:#fff;--wash:#f4f6fb;--accent:#3157d5;--action:#d96f18;--ok:#08785d;color-scheme:light dark}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--wash);color:var(--ink);font:16px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}a{color:var(--accent)}button,input,select{font:inherit}.page{max-width:1120px;margin:auto;padding:44px 28px 80px}.hero{background:#101529;color:#fff;padding:54px;border-radius:22px;margin-bottom:28px}.hero .eyebrow,.eyebrow{text-transform:uppercase;letter-spacing:.14em;font-size:12px;font-weight:750;color:#7895ff}.hero h1{font-size:clamp(40px,7vw,74px);line-height:1;margin:12px 0 18px;max-width:14ch}.hero p{font-size:20px;color:#c9d1e7;max-width:64ch}.grid{display:grid;gap:16px}.grid.cards{grid-template-columns:repeat(auto-fit,minmax(210px,1fr))}.card,.panel{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:22px}.card h2,.card h3,.panel h2,.panel h3{margin-top:0}.card p{color:var(--muted)}.button{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:9px;padding:11px 16px;background:var(--accent);color:#fff;text-decoration:none;font-weight:700;cursor:pointer}.button.secondary{background:#e8ecf8;color:#1c2b57}.meta{display:flex;gap:10px;flex-wrap:wrap;margin:20px 0}.chip{border:1px solid var(--line);background:var(--paper);padding:5px 10px;border-radius:999px;font-size:13px}.timeline{width:100%;border-collapse:collapse;background:var(--paper);border-radius:14px;overflow:hidden}.timeline th,.timeline td{text-align:left;padding:11px 13px;border-bottom:1px solid var(--line);vertical-align:top}.timeline th{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}.timeline tr:last-child td{border-bottom:0}.mode{font-size:12px;text-transform:uppercase;letter-spacing:.07em;color:var(--accent)}.station{border-left:5px solid var(--action)}.done{background:#e8f6f1;border:1px solid #bfe4d7;border-radius:9px;padding:12px 14px;color:#075a47}.note{background:#fff4e9;border:1px solid #ffd5ad;border-radius:9px;padding:12px 14px}.worksheet{width:100%;border-collapse:collapse}.worksheet th,.worksheet td{border:1px solid var(--line);padding:10px;text-align:left;vertical-align:top}.worksheet th{background:var(--wash)}.note-field{width:100%;min-width:150px;min-height:52px;border:1px dashed var(--line);border-radius:8px;padding:9px 10px;font:inherit;font-size:14px;color:var(--ink);background:var(--paper);resize:vertical;overflow:hidden}.note-field:focus{outline:2px solid var(--accent);outline-offset:1px;border-style:solid}.note-field::placeholder{color:var(--muted);opacity:.75}.notes-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:22px}#note-status{font-size:13px;color:#c9d1e7}.station .note-field{margin-top:6px}@media print{.notes-bar{display:none}.note-field{border:1px solid #999;resize:none}}.prop{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px}.talk-block{display:grid;grid-template-columns:120px minmax(0,1fr);gap:20px;padding:24px 0;border-top:1px solid var(--line)}.talk-block time{font-weight:800;font-size:18px}.slide-note{padding:14px 0}.slide-note h3{margin:0 0 6px}.slide-note p{margin:0;color:var(--muted)}.cut{color:#9a4200;background:#fff1e5;border-radius:7px;padding:7px 9px;margin-top:8px}@media(max-width:700px){.hero{padding:30px}.talk-block{grid-template-columns:1fr}.page{padding:22px 14px 60px}.timeline{font-size:14px}}@media(prefers-color-scheme:dark){:root{--ink:#edf0f7;--muted:#aab1c0;--line:#343b49;--paper:#171b24;--wash:#0e1118;--accent:#8ea5ff;--action:#ffac62}.button.secondary{background:#2a3140;color:#eef2ff}.done{background:#0d372e;border-color:#1a6553;color:#c8f5e6}.note,.cut{background:#3b2818;border-color:#76502e;color:#ffd9b8}.hero{background:#151b32}}
`;

function shell(title, body, extraHead = "") {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>${readingCss}</style>${extraHead}</head><body>${body}</body></html>`;
}

function renderHub() {
  const cards = [
    ["slides.html", "Slides", "Presenter deck for the room"],
    ["app.html", "To-do app", "Working app and instrumentation console"],
    ["guide.html", "Participant guide", "Tracking-plan worksheet and stations"],
    ["talk-track.html", "Talk track", "Timing, demo steps, and recovery notes"]
  ].map(([href, title, text]) => `<article class="card"><h2>${title}</h2><p>${text}</p><a class="button" href="${href}">Open ${title}</a></article>`).join("");
  const rows = workshop.run_of_show.map((block) => `<tr><td>${formatClock(block.start)}</td><td>${escapeHtml(block.title)}</td><td>${block.minutes} min</td><td><span class="mode">${escapeHtml(block.mode)}</span></td></tr>`).join("");
  return shell(workshop.title, `<main class="page"><header class="hero"><div class="eyebrow">${escapeHtml(workshop.audience)} · ${workshop.duration_minutes} minutes</div><h1>${escapeHtml(workshop.title)}</h1><p>${escapeHtml(workshop.subtitle)}</p><div class="meta">${workshop.outcomes.map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join("")}</div></header><section class="grid cards">${cards}</section><section class="panel" style="margin-top:28px"><h2>Run of show</h2><table class="timeline"><thead><tr><th>Start</th><th>Block</th><th>Time</th><th>Mode</th></tr></thead><tbody>${rows}</tbody></table></section><section class="panel" style="margin-top:28px"><h2>Do this before you arrive</h2><p>Station 3 asks you to create an Amplitude project. Sorting that out in advance is the difference between spending the hands-on hour on measurement decisions and spending it on account access.</p><ol><li><b>Check you can create a project.</b> In Amplitude, open Settings → Organization → Projects and confirm you see a Create Project button. If you don't, ask your admin today or plan to pair with a colleague.</li><li><b>Note whether your account is US or EU.</b> You'll select the region when you connect the app, and a mismatch silently sends events to the wrong endpoint.</li><li><b>Allow the workshop page through your ad blocker.</b> Blockers commonly stop <code>cdn.amplitude.com</code> and <code>api2.amplitude.com</code>, which makes the app look broken when it isn't.</li></ol><h3>Bring</h3><ul>${workshop.materials.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul><p class="note"><b>Presenter:</b> keep a standby project API key on hand for anyone still blocked at Station 3, pair before the break rather than during it, and test the venue network against the SDK and event endpoint on arrival.</p></section></main>`);
}

function formatClock(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}:${String(mins).padStart(2, "0")}`;
}

const blockFor = (slide) => workshop.run_of_show.find((block) => block.id === slide.block_id);

// The hub QR is a supplied asset. Inlined as a data URI so the deck is still one
// self-contained file, and simply absent if nobody has dropped the file in yet.
const qrPath = join(sourceDir, "assets", "hub-qr.png");
const qrDataUri = await readFile(qrPath)
  .then((bytes) => `data:image/png;base64,${bytes.toString("base64")}`)
  .catch(() => null);
if (!qrDataUri) console.warn(`No QR asset at ${qrPath} — the cover slide will render without one.`);

function hubQr() {
  if (!qrDataUri) return "";
  return `<figure class="cover-qr"><img src="${qrDataUri}" alt="QR code linking to ${escapeHtml(workshop.hub_url)}"><figcaption>Scan to open the hub</figcaption></figure>`;
}

// Slides that ask the room to open the hub carry the code beside the URL.
function withQr(slide, inner, variant) {
  const qr = slide.qr ? hubQr() : "";
  return qr ? `<div class="qr-row ${variant}">${inner}${qr}</div>` : inner;
}

// Interactive panel for the identity slide. Practitioners consistently expect
// pre-login activity to be lost, so the panel lets the room watch it attach.
function identityLab() {
  return `<div class="lab" data-interactive>
    <div class="lab-controls">
      <button type="button" data-lab="event">Add an event</button>
      <button type="button" data-lab="signin">Sign in</button>
      <label class="lab-switch"><input type="checkbox" data-lab="setuser" checked><span>Set a user ID on sign-in</span></label>
      <button type="button" data-lab="reset" class="ghost">Reset</button>
    </div>
    <div class="lab-lanes">
      <div class="lane" data-lane="device"><b>device_id · a91f4c</b><div class="chips"></div></div>
      <div class="lane" data-lane="user"><b data-user-label>user_id · not set</b><div class="chips"></div></div>
    </div>
    <p class="lab-verdict" data-lab-verdict></p>
  </div>`;
}

function slideBody(slide) {
  const title = escapeHtml(slide.title);
  if (slide.kind === "cover") {
    return withQr(slide, `<div class="cover-inner"><div class="deck-eyebrow">${escapeHtml(slide.act)}</div><h1>${title}</h1><p>${escapeHtml(slide.subtitle || "")}</p><div class="url">${escapeHtml(workshop.hub_url)}</div></div>`, "qr-cover");
  }
  if (slide.kind === "divider") return withQr(slide, `<div class="divider"><div class="deck-eyebrow">${escapeHtml(slide.act)}</div><h1>${title}</h1><div class="pills">${slide.points.map((p) => `<span>${escapeHtml(p)}</span>`).join("")}</div><div class="url">${escapeHtml(workshop.hub_url)}</div></div>`, "qr-divider");
  if (slide.kind === "break") return `<header><div class="deck-eyebrow">${escapeHtml(slide.act)}</div><h2>${title}</h2></header><div class="break-body"><div class="break-time">05:00</div>${pointList(slide.points)}<div class="url">${escapeHtml(workshop.hub_url)}</div></div>`;
  if (slide.kind === "station") {
    const block = blockFor(slide);
    return `<header><div class="deck-eyebrow">Your turn · ${block.minutes} min${block.mode === "optional" ? " · optional" : ""}</div><div class="station-title"><span>${block.station}</span><h2>${title}</h2></div></header><div class="station-grid">${pointList(slide.points)}<aside><b>Done when</b><p>${escapeHtml(block.done_when)}</p></aside></div>`;
  }
  if (slide.kind === "identity-lab") return `<header><div class="deck-eyebrow">${escapeHtml(slide.act)}</div><h2>${title}</h2></header>${identityLab()}`;
  if (slide.kind === "cards") return `<header><div class="deck-eyebrow">${escapeHtml(slide.act)}</div><h2>${title}</h2></header><div class="slide-cards">${slide.points.map((p) => `<article><div class="card-label">${escapeHtml(p.label)}</div><h3>${escapeHtml(p.title)}</h3><p>${escapeHtml(p.body)}</p></article>`).join("")}</div>`;
  if (slide.kind === "flow") return `<header><div class="deck-eyebrow">${escapeHtml(slide.act)}</div><h2>${title}</h2></header><div class="flow">${slide.points.map((p, index) => `<div class="node"><span>${index + 1}</span>${escapeHtml(p)}</div>${index < slide.points.length - 1 ? '<div class="arrow">→</div>' : ""}`).join("")}</div><p class="caption">${escapeHtml(slide.caption || "")}</p>`;
  if (slide.kind === "inventory") return `<header><div class="deck-eyebrow">${escapeHtml(slide.act)}</div><h2>${title}</h2></header><div class="inventory">${workshop.actions.map((a) => `<div>${escapeHtml(a.user_action)}</div>`).join("")}</div>`;
  return `<header><div class="deck-eyebrow">${escapeHtml(slide.act)}</div><h2>${title}</h2></header>${pointList(slide.points || [])}`;
}

function pointList(points) {
  return `<ol class="big-points">${points.map((point) => `<li>${escapeHtml(typeof point === "string" ? point : point.title)}</li>`).join("")}</ol>`;
}

function renderSlides() {
  const slideHtml = workshop.slides.map((slide, index) => `<section class="slide${slide.kind === "station" ? " exercise" : ""}" data-id="${escapeHtml(slide.id)}" data-act="${escapeHtml(slide.act)}" data-block="${escapeHtml(slide.block_id)}" data-title="${escapeHtml(slide.title)}" aria-hidden="${index === 0 ? "false" : "true"}">${slideBody(slide)}</section>`).join("");
  const jump = workshop.slides.map((slide, index) => `<button type="button" data-jump="${index}"><span>${String(index + 1).padStart(2, "0")}</span>${escapeHtml(slide.title)}</button>`).join("");
  const blockEnds = Object.fromEntries(workshop.run_of_show.map((block) => [block.id, block.start + block.minutes]));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(workshop.title)} · Slides</title><style>${slideCss}</style></head><body><div id="viewport"><main id="stage">${slideHtml}<div id="rail"></div><div id="stamp"></div></main></div><button id="fs" type="button" aria-label="Enter full screen">⛶ <span>Full screen</span></button><button id="jump-open" type="button">Jump</button><div id="timer">00:00</div><dialog id="jump"><div class="jump-head"><b>Jump to slide</b><button type="button" id="jump-close">Close</button></div><div class="jump-list">${jump}</div></dialog><script>const SLIDES=[...document.querySelectorAll('.slide')],BLOCK_END=${jsonForScript(blockEnds)};let current=0,start=Date.now();const stage=document.querySelector('#stage'),stamp=document.querySelector('#stamp'),rail=document.querySelector('#rail'),timer=document.querySelector('#timer');function fit(){stage.style.transform='scale('+Math.min(innerWidth/1280,innerHeight/720)+')'}function show(n,replace){current=Math.max(0,Math.min(SLIDES.length-1,n));SLIDES.forEach((s,i)=>{s.classList.toggle('on',i===current);s.setAttribute('aria-hidden',i===current?'false':'true')});stamp.textContent=(current+1)+' / '+SLIDES.length+' · '+SLIDES[current].dataset.act;[...rail.children].forEach((t,i)=>{t.classList.toggle('now',i===current);t.classList.toggle('seen',i<current)});const hash='#'+SLIDES[current].dataset.id;if(location.hash!==hash)history[replace?'replaceState':'pushState'](null,'',hash)}function fromHash(){const id=decodeURIComponent(location.hash.slice(1));const i=SLIDES.findIndex(s=>s.dataset.id===id);show(i<0?0:i,true)}SLIDES.forEach((_,i)=>rail.insertAdjacentHTML('beforeend','<i></i>'));addEventListener('resize',fit);addEventListener('hashchange',fromHash);addEventListener('keydown',e=>{if(e.key===' '&&e.target.closest&&e.target.closest('[data-interactive]'))return;if(['ArrowRight','PageDown',' '].includes(e.key)){e.preventDefault();show(current+1)}if(['ArrowLeft','PageUp'].includes(e.key)){e.preventDefault();show(current-1)}if(e.key==='f'||e.key==='F')toggleFs();if(e.key==='o'||e.key==='O')document.querySelector('#jump').showModal();if(e.key==='r'||e.key==='R')start=Date.now()});document.querySelector('#stage').addEventListener('click',e=>{if(e.target.closest('[data-interactive]'))return;show(current+1)});function toggleFs(){document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen()}document.querySelector('#fs').onclick=e=>{e.stopPropagation();toggleFs()};document.addEventListener('fullscreenchange',()=>{document.querySelector('#fs span').textContent=document.fullscreenElement?'Exit full screen':'Full screen'});document.querySelector('#jump-open').onclick=()=>document.querySelector('#jump').showModal();document.querySelector('#jump-close').onclick=()=>document.querySelector('#jump').close();document.querySelectorAll('[data-jump]').forEach(b=>b.onclick=()=>{show(+b.dataset.jump);document.querySelector('#jump').close()});setInterval(()=>{const sec=Math.floor((Date.now()-start)/1000),min=Math.floor(sec/60);timer.textContent=String(min).padStart(2,'0')+':'+String(sec%60).padStart(2,'0')+' / '+String(BLOCK_END[SLIDES[current].dataset.block]).padStart(2,'0')+':00';timer.classList.toggle('late',min>BLOCK_END[SLIDES[current].dataset.block])},1000);
const lab=document.querySelector('.lab');
if(lab){
  const USER='analyst-7f3';
  let events=[],signedIn=false;
  const setUser=()=>lab.querySelector('[data-lab=setuser]').checked;
  function renderLab(){
    const mapped=signedIn&&setUser();
    const lanes={device:[],user:[]};
    events.forEach((e,i)=>lanes[mapped&&e.afterSignIn?'user':'device'].push('Event '+(i+1)));
    for(const name of ['device','user']){
      lab.querySelector('[data-lane='+name+'] .chips').innerHTML=lanes[name].map(label=>'<span class="chip">'+label+'</span>').join('')||'<i>no events</i>';
    }
    lab.querySelector('[data-user-label]').textContent='user_id · '+(mapped?USER:'not set');
    lab.classList.toggle('resolved',mapped);
    lab.querySelector('[data-lab=signin]').textContent=signedIn?'Sign out':'Sign in';
    const early=events.filter(e=>!e.afterSignIn).length;
    const verdict=lab.querySelector('[data-lab-verdict]');
    if(!signedIn)verdict.textContent=events.length?events.length+' events on an anonymous device. One person, no account yet.':'Add an event to start an anonymous session.';
    else if(mapped)verdict.textContent='All '+events.length+' events resolve to '+USER+', including the '+early+' from before sign-in. This is the identifier Braze matches on.';
    else verdict.textContent='Signed in, but '+events.length+' events still sit on the device. Analytics never learns who this is, and the Braze cohort has nobody to match.';
  }
  lab.addEventListener('click',e=>{
    const action=e.target.closest('[data-lab]');if(!action)return;
    if(action.dataset.lab==='event')events.push({afterSignIn:signedIn});
    if(action.dataset.lab==='signin')signedIn=!signedIn;
    if(action.dataset.lab==='reset'){events=[];signedIn=false;lab.querySelector('[data-lab=setuser]').checked=true}
    renderLab();
  });
  lab.addEventListener('change',renderLab);
  renderLab();
}
fit();fromHash();</script></body></html>`;
}

const slideCss = `
:root{--bg:#070a11;--panel:#121826;--line:#293246;--text:#f4f6fb;--muted:#a6afc2;--accent:#6685ff;--signal:#2ed7a6;--action:#ff9d4d}*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}#viewport{position:fixed;inset:0;display:flex;align-items:center;justify-content:center}#stage{position:relative;width:1280px;height:720px;transform-origin:center;flex:none}.slide{position:absolute;inset:0;display:none;flex-direction:column;padding:58px 74px 76px;background:var(--bg)}.slide.on{display:flex}.deck-eyebrow{text-transform:uppercase;letter-spacing:.15em;font-size:13px;font-weight:800;color:var(--accent)}h1,h2,h3,p{margin-top:0}h1{font-size:84px;line-height:.98;letter-spacing:-.045em;max-width:12ch;margin:16px 0 22px}h2{font-size:49px;line-height:1.05;letter-spacing:-.025em;margin:16px 0 0;max-width:22ch}.cover-inner,.divider{flex:1;display:flex;flex-direction:column;justify-content:center}.qr-row{flex:1;display:flex;align-items:center;gap:54px}.qr-row .cover-inner,.qr-row .divider{flex:1;min-width:0}.qr-row h1{font-size:68px;max-width:14ch}.qr-divider .pills{margin-top:24px}.cover-qr{margin:0;flex:none;width:296px;text-align:center}.cover-qr img{width:296px;height:296px;display:block;box-sizing:border-box;background:#fff;padding:13px;border-radius:16px}.cover-qr figcaption{margin-top:15px;font:17px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--signal)}.cover-inner p{font-size:28px;line-height:1.35;color:var(--muted);max-width:44ch}.url{margin-top:28px;font:18px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--signal)}.pills{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px}.pills span{border:1px solid var(--line);border-radius:999px;padding:9px 14px;color:var(--muted)}.big-points{list-style:none;padding:0;margin:52px 0 0;display:grid;gap:24px;counter-reset:p}.big-points li{position:relative;padding:0 0 22px 58px;border-bottom:1px solid var(--line);font-size:29px;line-height:1.3;color:var(--muted)}.big-points li:before{counter-increment:p;content:counter(p);position:absolute;left:0;top:2px;color:var(--signal);font:18px ui-monospace,SFMono-Regular,Menlo,monospace}.slide-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:48px}.slide-cards article{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:24px;min-height:230px}.card-label{text-transform:uppercase;letter-spacing:.12em;color:var(--signal);font-size:12px;font-weight:800}.slide-cards h3{font-size:27px;margin:22px 0 12px}.slide-cards p{font-size:20px;line-height:1.4;color:var(--muted)}.flow{display:flex;align-items:center;justify-content:center;gap:18px;flex:1}.node{width:270px;min-height:150px;display:flex;flex-direction:column;justify-content:center;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:24px;font-size:24px;line-height:1.25}.node span{font:13px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--signal);margin-bottom:14px}.arrow{font-size:40px;color:var(--accent)}.caption{font-size:19px;color:var(--muted);margin:0 auto 20px;text-align:center}.exercise{background:linear-gradient(180deg,#171008,var(--bg) 64%)}.station-title{display:flex;gap:20px;align-items:baseline;margin-top:16px}.station-title span{font-size:56px;font-weight:900;color:var(--action)}.station-title h2{margin:0}.station-grid{display:grid;grid-template-columns:1.4fr .8fr;gap:42px;align-items:center;flex:1}.station-grid .big-points{margin-top:24px}.station-grid aside{background:#2a1b0e;border:1px solid #68401d;border-radius:13px;padding:23px}.station-grid aside b{color:var(--action);text-transform:uppercase;letter-spacing:.1em;font-size:12px}.station-grid aside p{font-size:20px;line-height:1.4;margin:12px 0 0}.inventory{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:42px}.inventory div{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:20px;font-size:20px}.break-body{display:grid;grid-template-columns:.75fr 1.25fr;align-items:center;gap:50px;flex:1}.break-time{font:86px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--signal)}.lab{display:grid;gap:20px;margin-top:32px;flex:1;align-content:start}.lab-controls{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.lab-controls button{background:var(--accent);color:#08122e;border:0;border-radius:10px;padding:13px 18px;font:700 19px Inter,ui-sans-serif,system-ui,sans-serif;cursor:pointer}.lab-controls button.ghost{background:transparent;border:1px solid var(--line);color:var(--muted)}.lab-switch{display:flex;align-items:center;gap:9px;color:var(--muted);font-size:18px;cursor:pointer;margin-left:auto}.lab-switch input{width:20px;height:20px;accent-color:var(--signal)}.lab-lanes{display:grid;grid-template-columns:1fr 1fr;gap:16px}.lane{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;min-height:196px;align-content:start}.lane b{display:block;font:13px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted);margin-bottom:14px}.lane[data-lane=user] b{color:var(--signal)}.chips{display:flex;flex-wrap:wrap;gap:8px}.chips .chip{background:#1d2740;border:1px solid #35426a;border-radius:999px;padding:7px 13px;font-size:17px}.chips i{color:#5b6580;font-style:normal;font-size:17px}.lab.resolved .lane[data-lane=user]{background:#0f2a24;border-color:var(--signal)}.lab-verdict{font-size:22px;line-height:1.35;color:var(--text);margin:0;min-height:62px;max-width:60ch}#rail{position:absolute;left:74px;right:74px;bottom:28px;display:flex;gap:3px;height:12px;align-items:flex-end}#rail i{height:3px;flex:1;background:var(--line)}#rail i.seen{background:#46526b}#rail i.now{height:11px;background:var(--signal)}#stamp{position:absolute;right:74px;bottom:47px;color:#69758b;font:11px ui-monospace,SFMono-Regular,Menlo,monospace;text-transform:uppercase;letter-spacing:.08em}#fs,#jump-open,#timer{position:fixed;z-index:5;top:12px;border:1px solid var(--line);border-radius:8px;background:var(--panel);color:var(--muted);padding:7px 10px;font:11px ui-monospace,SFMono-Regular,Menlo,monospace;opacity:.45;cursor:pointer}#fs:hover,#jump-open:hover{opacity:1}#fs{left:12px}#jump-open{left:132px}#timer{right:12px;opacity:.8}.late{color:#ff9d4d!important;border-color:#ff9d4d!important}dialog{width:min(720px,90vw);max-height:80vh;background:var(--panel);color:var(--text);border:1px solid var(--line);border-radius:14px;padding:18px}.jump-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}.jump-head button,.jump-list button{background:#0d121d;color:var(--text);border:1px solid var(--line);border-radius:8px;padding:10px;cursor:pointer}.jump-list{display:grid;grid-template-columns:1fr 1fr;gap:7px;overflow:auto}.jump-list button{text-align:left}.jump-list button span{color:var(--signal);margin-right:10px}@media print{@page{size:1280px 720px;margin:0}html,body{overflow:visible}.slide{position:relative;display:flex!important;page-break-after:always}.slide[aria-hidden="true"]{display:flex!important}#fs,#jump-open,#timer,#rail,#stamp{display:none!important}}
`;

function noteField(id, placeholder, rows = 2) {
  return `<textarea class="note-field" data-note="${escapeHtml(id)}" rows="${rows}" placeholder="${escapeHtml(placeholder)}" aria-label="${escapeHtml(placeholder)}"></textarea>`;
}

// Notes live in this browser only. Nothing is sent anywhere, and the guide says so
// rather than letting somebody assume a server has their work.
const notesScript = (workshopId) => `<script>
(() => {
  const KEY = 'workshop-notes:${workshopId}';
  const fields = [...document.querySelectorAll('[data-note]')];
  const status = document.querySelector('#note-status');
  const report = (text) => { if (status) status.textContent = text; };
  const grow = (el) => { el.style.height = 'auto'; el.style.height = Math.max(el.scrollHeight, 52) + 'px'; };
  let store = {};
  try { store = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { store = {}; }

  fields.forEach((el) => {
    const saved = store[el.dataset.note];
    if (typeof saved === 'string') el.value = saved;
    grow(el);
  });
  const filled = () => fields.filter((el) => el.value.trim()).length;
  report(filled() ? filled() + ' notes restored from this browser' : 'Notes save in this browser as you type');

  let timer;
  document.addEventListener('input', (event) => {
    const el = event.target.closest && event.target.closest('[data-note]');
    if (!el) return;
    grow(el);
    store[el.dataset.note] = el.value;
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(store));
        report('Saved ' + new Date().toLocaleTimeString() + ' · ' + filled() + ' notes');
      } catch (e) {
        report("This browser won't save notes. Copy anything you want to keep before you close the tab.");
      }
    }, 250);
  });

  const clear = document.querySelector('#clear-notes');
  if (clear) clear.addEventListener('click', () => {
    if (!confirm('Clear every note on this page? This cannot be undone.')) return;
    store = {};
    try { localStorage.removeItem(KEY); } catch (e) {}
    fields.forEach((el) => { el.value = ''; grow(el); });
    report('Notes cleared');
  });

  const copy = document.querySelector('#copy-notes');
  if (copy) copy.addEventListener('click', async () => {
    const text = fields.filter((el) => el.value.trim())
      .map((el) => '## ' + (el.getAttribute('aria-label') || el.dataset.note) + ' [' + el.dataset.note + ']\\n' + el.value.trim())
      .join('\\n\\n');
    if (!text) { report('Nothing written down yet'); return; }
    try { await navigator.clipboard.writeText(text); report('Notes copied to the clipboard'); }
    catch (e) { report('Copy failed. Select the fields and copy manually.'); }
  });
})();
</script>`;

function renderGuide() {
  const stationSections = workshop.run_of_show.filter((b) => b.mode === "hands-on" || b.mode === "optional").map((station) => {
    const instructions = {
      "station-1": ["Read the action inventory and the question each event is supposed to answer.", "Before you open the app, write the event name you would use for each action.", "Now open the app's Instrumentation panel and compare your names with the plan it shipped with.", "Fix the names in the app, and untick any action you decided not to track at all."],
      "station-2": ["Work through the property chips on each event in the app.", "Tick the context that event's question actually needs, and untick what you can't justify.", "Fix any property whose type is wrong.", "Sort out the user properties: person context on the person, occurrence context on the event.", "Record a type and an example for every property you keep."],
      "station-3": ["Create a blank Amplitude project.", "Open the app's Connection panel.", "Paste the project API key and select its region.", "Leave Session Replay ticked, and add a Web Experiment deployment key only if you have one.", "Connect, complete your profile, and send user properties.", "Read the Wire entries in the Activity panel: that's what left the browser, replay ID and session included."],
      "station-4": ["Perform at least three different actions.", "Compare each Activity payload with the plan.", "Search Amplitude for the generated analyst ID.", "Confirm event names, property names, and property types."],
      "station-5": ["Choose one question from the plan.", "Build an Event Segmentation or Funnel chart.", "State what the workshop-sized sample can't support."]
    }[station.id];
    return `<section class="panel station" id="${station.id}" style="margin-top:24px"><div class="eyebrow">Station ${station.station} · ${station.minutes} min${station.mode === "optional" ? " · optional" : ""}</div><h2>${escapeHtml(station.title.replace(/^Station \d+: /, ""))}</h2><ol>${instructions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol><p class="done"><b>Done when:</b> ${escapeHtml(station.done_when)}</p>${station.id === "station-4" ? '<p class="note"><b>If an event is missing:</b> check the app response, browser network request, ad blocker, API key, and US/EU region in that order.</p>' : ""}${noteField(`${station.id}.notes`, `Notes from station ${station.station}`, 3)}</section>`;
  }).join("");
  const auditRows = workshop.actions.map((action) => `<tr><td><b>${escapeHtml(action.user_action)}</b><br><small>${escapeHtml(action.question)}</small></td><td><code>${escapeHtml(action.shipped.event_name)}</code><br>${action.shipped.properties.map((p) => `<code class="prop">${escapeHtml(p.name)}: ${escapeHtml(p.type)}</code>`).join("<br>")}</td><td>${noteField(`${action.id}.problem`, "What's wrong with it")}</td><td>${noteField(`${action.id}.name`, "Your event name")}</td></tr>`).join("");
  const referenceRows = workshop.actions.map((action) => `<tr><td>${escapeHtml(action.user_action)}</td><td><code>${escapeHtml(action.event_name)}</code></td><td>${action.properties.map((p) => `<code class="prop">${escapeHtml(p.name)}: ${escapeHtml(p.type)}</code>`).join("<br>")}</td></tr>`).join("");
  const userProps = workshop.user_properties.map((p) => `<li><code>${escapeHtml(p.name)}</code> · ${escapeHtml(p.type)} · example: ${escapeHtml(p.example)}</li>`).join("");
  return shell(`${workshop.title} · Participant guide`, `<main class="page"><header class="hero"><div class="eyebrow">Participant guide · ${workshop.duration_minutes} minutes</div><h1>${escapeHtml(workshop.title)}</h1><p>Use this page during the second hour. The app works before it is connected, so make the tracking decisions first.</p><p><a class="button" href="app.html">Open the to-do app</a> <a class="button secondary" href="index.html">Workshop hub</a></p><div class="notes-bar"><span id="note-status">Notes save in this browser as you type</span><button id="copy-notes" class="button secondary" type="button">Copy my notes</button><button id="clear-notes" class="button secondary" type="button">Clear notes</button></div></header><section class="panel"><h2>Audit the plan you inherited</h2><p class="note">The app arrives already instrumented. Somebody set it up in a hurry, and the plan has problems in it — wrong names, missing context, properties that can't answer the question they were added for, and a couple of things that are fine as they are. Your job is to work out which is which.</p><p>Write your own event name for each action <b>before</b> you read the middle column, then note what's wrong with what shipped. You don't need an event for every action.</p><table class="worksheet"><thead><tr><th>User action and question</th><th>As shipped</th><th>What's wrong with it</th><th>Your event name</th></tr></thead><tbody>${auditRows}</tbody></table><h3>User properties as shipped</h3><p>The app sends ${workshop.shipped_user_properties.map((p) => `<code>${escapeHtml(p.name)}</code>`).join(", ")} with the Identify call. Decide which of those describe the person, which describe the latest action and belong on an event instead, and what's missing.</p>${noteField("user-properties.notes", "Your user property plan", 3)}</section>${stationSections}<details class="panel" style="margin-top:24px"><summary><b>Reference plan</b> · this is the answer, so open it when your table has finished Station 2</summary><p>One defensible version of the plan, for comparison and for you to take away. Yours doesn't have to match it — but if it differs, you should be able to say why.</p><table class="worksheet"><thead><tr><th>User action</th><th>Reference event</th><th>Reference properties</th></tr></thead><tbody>${referenceRows}</tbody></table><h3>Reference user properties</h3><ul>${userProps}</ul><p class="note">Task text is deliberately absent. Task length supports the exercise questions without collecting the content a person typed.</p><h3>Counting conventions</h3><ul><li><code>list_size</code> is measured after the change, so a create counts the new task and a delete excludes the removed one.</li><li><code>task_position</code> is the position in the list as displayed, so it reflects what the person actually clicked when a filter is active.</li><li><code>entry_method</code> distinguishes pressing Enter in the field from clicking Add task.</li></ul></details><section class="panel" style="margin-top:24px"><h2>Recovery</h2><ul><li><b>Notes disappeared:</b> they're kept in this browser on this device, so a different browser, a private window, or cleared site data starts you blank. Use Copy my notes to take them with you.</li><li><b>No project permission:</b> pair with someone who can create a project and use different generated user IDs.</li><li><b>SDK won't load:</b> disable the ad blocker for the workshop page or pair with another attendee.</li><li><b>Session Replay didn't attach:</b> the Activity panel says so and analytics carries on regardless. Blockers stop the replay plugin more often than the analytics SDK. Replays also take a few minutes to appear, and need a session with some activity in it.</li><li><b>Web Experiment was rejected:</b> that key needs to be a client-side deployment key from this project. Leave the field empty if you don't have one — nothing else depends on it.</li><li><b>Connected to the wrong region:</b> disconnect, choose the project's US or EU region, and reconnect.</li><li><b>Events haven't appeared:</b> use the generated user ID in User Lookup and wait briefly before changing anything.</li></ul></section></main>${notesScript(workshop.id)}`);
}

function renderTalkTrack() {
  const blocks = workshop.run_of_show.map((block) => {
    const slideNotes = workshop.slides.filter((slide) => slide.block_id === block.id).map((slide) => `<article class="slide-note"><h3><a href="slides.html#${encodeURIComponent(slide.id)}">${escapeHtml(slide.title)}</a></h3><p>${escapeHtml(slide.notes)}</p>${slide.notes.includes("CUT:") ? `<div class="cut">This slide contains a cut instruction. Use it before shortening hands-on time.</div>` : ""}</article>`).join("");
    return `<section class="talk-block" id="${block.id}"><time>${formatClock(block.start)}–${formatClock(block.start + block.minutes)}</time><div><div class="eyebrow">${escapeHtml(block.mode)} · ${block.minutes} min</div><h2>${escapeHtml(block.title)}</h2>${slideNotes}${block.done_when ? `<p class="done"><b>Room done when:</b> ${escapeHtml(block.done_when)}</p>` : ""}</div></section>`;
  }).join("");
  const references = workshop.references.map((item) => `<li><a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a></li>`).join("");
  // The answer key lives here and not in the guide. Attendees should find these
  // themselves; the presenter needs them to steer a table that's stuck.
  const flawed = workshop.actions.filter((action) => action.shipped.flaws.length);
  const clean = workshop.actions.filter((action) => !action.shipped.flaws.length);
  const answerKey = `<section class="panel" style="margin-top:28px"><h2>Answer key: what's wrong with the shipped plan</h2><p>Don't hand this out and don't walk the room through it. Use it to ask the question that gets a stuck table unstuck, and to confirm a catch when somebody finds one.</p><table class="worksheet"><thead><tr><th>Action</th><th>As shipped</th><th>Problems</th><th>Should be</th></tr></thead><tbody>${flawed.map((action) => `<tr><td>${escapeHtml(action.user_action)}</td><td><code>${escapeHtml(action.shipped.event_name)}</code></td><td><ul style="margin:0;padding-left:18px">${action.shipped.flaws.map((flaw) => `<li>${escapeHtml(flaw)}</li>`).join("")}</ul></td><td><code>${escapeHtml(action.event_name)}</code><br>${action.properties.map((p) => `<code class="prop">${escapeHtml(p.name)}: ${escapeHtml(p.type)}</code>`).join("<br>")}</td></tr>`).join("")}</tbody></table><h3>User properties</h3><ul>${workshop.shipped_user_property_flaws.map((flaw) => `<li>${escapeHtml(flaw)}</li>`).join("")}</ul><p class="note"><b>Already correct:</b> ${clean.map((action) => `${escapeHtml(action.user_action.toLowerCase())} (<code>${escapeHtml(action.event_name)}</code>)`).join(" and ")}. Leaving these alone is part of the exercise — if a table "fixes" everything, ask them what was wrong with these two.</p><p class="note"><b>The one to make sure the room sees:</b> the filter event bakes its value into the name, so Amplitude fills up with <code>Filter Changed - all</code>, <code>Filter Changed - active</code>, and <code>Filter Changed - completed</code> instead of one event you can group. It's the most visible mistake in Station 4 and the most common one in real taxonomies.</p></section>`;
  return shell(`${workshop.title} · Talk track`, `<main class="page"><header class="hero"><div class="eyebrow">Presenter notes · floor, not script</div><h1>${escapeHtml(workshop.title)}</h1><p>The first hour can shed demo detail. The hands-on hour keeps its full 60 minutes. Open each slide title to jump the deck to that point.</p><p><a class="button" href="slides.html">Open slides</a> <a class="button secondary" href="index.html">Workshop hub</a></p></header><section class="panel"><h2>Pre-flight</h2><ul><li>Open the prepared Amplitude project, funnel, replay, Journeys chart, cohort, Braze segment, guide, and experiment.</li><li>Test project creation permissions in the attendee account.</li><li>Load the app through the venue network and send one event to a throwaway project.</li><li>Keep the slides, talk track, app, and Amplitude in separate tabs.</li><li>Have an offline copy of the pack. The app still demonstrates payloads if Amplitude is unavailable.</li><li>Send the pre-work on the hub the day before, and bring a standby project API key for anyone blocked at Station 3.</li><li>If you want the room to see Web Experiment working, bring a client-side deployment key with a running web experiment on it. Without one the field stays empty and Station 3 is unaffected.</li><li>Have every demo tab open and logged in before the room fills. Five surfaces in 34 minutes leaves no room for a cold start.</li></ul><p class="note"><b>Hard gate at 0:38.</b> Move to the data model whatever is unfinished in the speed run. Each demo carries a CUT line; use it. The hands-on hour does not absorb demo overrun, and Station 5 is the only buffer left after that. If the room is already behind at 0:22, the Braze block is the one to cut to a screenshot walk — it depends on a configured destination and is the least actionable step for this audience.</p><h3>Presenter references</h3><ul>${references}</ul></section>${answerKey}${blocks}</main>`);
}

await writeFile(join(outputDir, "index.html"), renderHub());
await writeFile(join(outputDir, "slides.html"), renderSlides());
await writeFile(join(outputDir, "guide.html"), renderGuide());
await writeFile(join(outputDir, "talk-track.html"), renderTalkTrack());
// Each property the app can offer: the ones the shipped plan sends, then the ones
// it should have sent. `on` is the shipped default, so the app starts wrong and the
// attendee's ticks and type choices are the correction.
function propertyPool(shipped, reference) {
  const names = [...new Set([...shipped.map((p) => p.name), ...reference.map((p) => p.name)])];
  return names.map((name) => {
    const asShipped = shipped.find((p) => p.name === name);
    const asReference = reference.find((p) => p.name === name);
    const types = [...new Set([asShipped, asReference].filter(Boolean).map((p) => p.type))];
    return { name, type: (asShipped || asReference).type, types, on: Boolean(asShipped) };
  });
}

const appTemplate = await readFile(join(sourceDir, "app.template.html"), "utf8");
// The app gets only what it renders. Slides and presenter notes have no business in
// a page the room has open for an hour, and neither do the reference event names —
// they're the answer to the exercise the attendee is working on.
const appData = {
  id: workshop.id,
  title: workshop.title,
  actions: workshop.actions.map((action) => ({
    id: action.id,
    user_action: action.user_action,
    question: action.question,
    event_name: action.shipped.event_name,
    properties: propertyPool(action.shipped.properties, action.properties)
  })),
  user_properties: propertyPool(workshop.shipped_user_properties, workshop.user_properties)
};
await writeFile(join(outputDir, "app.html"), appTemplate.replace("__WORKSHOP_DATA__", jsonForScript(appData)));
console.log(`Built ${workshop.id} in ${outputDir}`);
