let ctx=null, master=null, active=new Map();
const $=id=>document.getElementById(id);
const stage=$("stage"), instrument=$("instrument"), info=$("instrumentInfo");

const specs={
 piano:["ピアノ","鍵盤をタップ。強く押すほど音量が上がります。"],
 acoustic:["アコースティックギター","弦をタップすると単音。上下にスワイプするとストロークになります。"],
 electric:["エレキギター","弦をタップ／スワイプ。短い連打にも対応します。"],
 bass:["ベース","4本の弦をタップ。低音域で鳴ります。"],
 violin:["ヴァイオリン","指板をタップして単音。長押しでサステインします。"],
 cello:["チェロ","低音域の弦をタップ。長押し対応。"],
 clarinet:["クラリネット","音域パッドをタップ。長押しで音を伸ばせます。"],
 sax:["サックス","音域パッドをタップ。長押し対応。"],
 oboe:["オーボエ","音域パッドをタップ。長押し対応。"],
 bassoon:["ファゴット","低音域の音をタップ。長押し対応。"],
 trumpet:["トランペット","音域パッドをタップ。長押し対応。"],
 horn:["ホルン","音域パッドをタップ。長押し対応。"],
 cajon:["カホン","本体の上部・中央・下部を本物のように叩き分けます。"]
};

function audioOn(){
 if(!ctx){
   ctx=new (window.AudioContext||window.webkitAudioContext)();
   master=ctx.createGain(); master.gain.value=+$("master").value; master.connect(ctx.destination);
 }
 if(ctx.state==="suspended")ctx.resume();
}
$("audioBtn").onclick=()=>{audioOn();$("audioBtn").textContent="🔊 音は有効です"};

$("master").oninput=e=>{if(master)master.gain.value=+e.target.value};

function midiFreq(m){return 440*Math.pow(2,(m-69)/12)}
function pressure(ev){
 const p=ev.pressure;
 if(p && p>0 && p<=1)return Math.max(.04,Math.min(1,p));
 return .55;
}
function synth(freq,vel,dur=1,type="piano"){
 audioOn();
 const now=ctx.currentTime;
 const out=ctx.createGain(); out.gain.setValueAtTime(.0001,now);
 out.connect(master);
 const osc=ctx.createOscillator();
 const osc2=ctx.createOscillator();
 const g2=ctx.createGain();
 osc.frequency.value=freq; osc2.frequency.value=freq;
 osc.type= type==="piano"?"triangle": type==="electric"?"sawtooth":"sine";
 osc2.type="sine"; osc2.detune.value=7; g2.gain.value=type==="piano"?.18:.08;
 osc.connect(out);osc2.connect(g2);g2.connect(out);
 const filter=ctx.createBiquadFilter(); filter.type="lowpass";
 filter.frequency.value= type==="piano"?5000: type==="electric"?4200:2600;
 out.disconnect();osc.disconnect();osc2.disconnect();out.connect(filter);g2.disconnect();g2.connect(filter);filter.connect(master);
 const attack=type==="piano"?.004:.025, release=type==="piano"?.45:.25;
 out.gain.exponentialRampToValueAtTime(Math.max(.0002,vel),now+attack);
 out.gain.exponentialRampToValueAtTime(Math.max(.0002,vel*.55),now+Math.min(.18,dur*.3));
 out.gain.exponentialRampToValueAtTime(.0001,now+dur+release);
 osc.start(now);osc2.start(now);
 osc.stop(now+dur+release+.05);osc2.stop(now+dur+release+.05);
 return {stop:()=>{try{osc.stop()}catch{};try{osc2.stop()}catch{}}};
}
function play(midi,ev,type=instrument.value,dur=.8){
 const v=pressure(ev);
 const f=midiFreq(midi);
 return synth(f,v,dur,type);
}
function bind(el,down,move,up){
 el.addEventListener("pointerdown",e=>{e.preventDefault();el.setPointerCapture?.(e.pointerId);down(e)});
 if(move)el.addEventListener("pointermove",e=>{if(active.has(e.pointerId)){e.preventDefault();move(e)}});
 el.addEventListener("pointerup",e=>{e.preventDefault();up?.(e);active.delete(e.pointerId)});
 el.addEventListener("pointercancel",e=>{up?.(e);active.delete(e.pointerId)});
}
function clear(){stage.innerHTML=""}

const pianoNotes=[60,62,64,65,67,69,71,72,74,76,77,79,81,83,84];
function renderPiano(){
 const wrap=document.createElement("div");wrap.className="piano";
 pianoNotes.forEach((m,i)=>{const b=document.createElement("div");b.className="key";b.textContent=["C","D","E","F","G","A","B"][m%12]||"";bind(b,e=>{active.set(e.pointerId,play(m,e,instrument.value,1.1))},null,e=>{active.get(e.pointerId)?.stop?.()});wrap.append(b)});
 stage.append(wrap);
}
const stringMaps={
 acoustic:[64,59,55,50,45,40],
 electric:[64,59,55,50,45,40],
 bass:[43,38,33,28]
};
function renderStrings(){
 const wrap=document.createElement("div");wrap.className="guitar";
 stringMaps[instrument.value].forEach((m,i)=>{
   const s=document.createElement("div");s.className="string";s.innerHTML=`弦${i+1} <i></i>`;
   let last=0;
   bind(s,e=>{
     last=e.clientY;active.set(e.pointerId,play(m,e,instrument.value,.8));
   },e=>{
     if(Math.abs(e.clientY-last)>18){
       const step=e.clientY<last?7:-7; play(m+step,e,instrument.value,.5);last=e.clientY;
     }
   },e=>{active.get(e.pointerId)?.stop?.()});
   wrap.append(s);
 });
 stage.append(wrap);
}
function renderCajon(){
 const c=document.createElement("div");c.className="cajon";
 [["高音",76,"top"],["スラップ",62,"slap"],["低音",48,"bass"],["ゴースト",55,"ghost"]].forEach(([name,m,cl])=>{
   const z=document.createElement("div");z.className="czone";z.textContent=name;z.dataset.cl=cl;
   bind(z,e=>play(m,e,"cajon",cl==="ghost"?.12:.35));c.append(z);
 });
 stage.append(c);
}
function renderMelody(){
 const wrap=document.createElement("div");wrap.className="melody";
 const base={violin:60,cello:48,clarinet:60,sax:55,oboe:60,bassoon:43,trumpet:60,horn:55}[instrument.value]||60;
 for(let i=0;i<16;i++){
   const n=document.createElement("div");n.className="pad note";n.textContent=["C","D","E","F","G","A","B","C","D","E","F","G","A","B","C","D"][i];
   bind(n,e=>{active.set(e.pointerId,play(base+[0,2,4,5,7,9,11,12,14,16,17,19,21,23,24,26][i],e,instrument.value,1.5))},null,e=>active.get(e.pointerId)?.stop?.());
   wrap.append(n);
 }
 stage.append(wrap);
}
function render(){
 clear(); info.textContent=specs[instrument.value][0]+"： "+specs[instrument.value][1];
 if(instrument.value==="piano")renderPiano();
 else if(["acoustic","electric","bass"].includes(instrument.value))renderStrings();
 else if(instrument.value==="cajon")renderCajon();
 else renderMelody();
}
instrument.onchange=render; render();

