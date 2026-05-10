import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { useUser } from "@clerk/clerk-react";
import { supabase } from "../lib/supabase.js";

/* ═══════════════════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════════════════ */
const RANKS = [
  "Bronze I","Bronze II","Bronze III","Silver I","Silver II","Silver III",
  "Gold I","Gold II","Gold III","Platinum I","Platinum II","Platinum III",
  "Diamond I","Diamond II","Diamond III","Champion I","Champion II","Champion III",
  "Grand Champion I","Grand Champion II","Grand Champion III","Supersonic Legend"
];
const TIER_COLORS = {
  Bronze:"#cd7f32",Silver:"#c0c0c0",Gold:"#ffd700",Platinum:"#4fc3f7",
  Diamond:"#29b6f6",Champion:"#ce93d8",Grand:"#ef9a9a",Supersonic:"#ff80ab"
};
const CARS = ["Octane","Fennec","Dominus","Breakout","Mantis","Nimbus","Endo","Venom","Zippy","Cyclone"];
const ADJS = ["Nitro","Cosmic","Phantom","Solar","Turbo","Rogue","Blaze","Neon","Apex","Storm","Hyper","Void"];
const DEMO_PLAYERS = [
  {id:1,name:"SkyBolt",rank:"Grand Champion I"},{id:2,name:"IcePeak",rank:"Champion III"},
  {id:3,name:"VortexX",rank:"Champion I"},{id:4,name:"NovaStar",rank:"Diamond III"},
  {id:5,name:"Phantom7",rank:"Diamond I"},{id:6,name:"ZeroG",rank:"Platinum III"},
  {id:7,name:"CrashLand",rank:"Gold II"},{id:8,name:"Rookie_RL",rank:"Silver I"},
];
const DEFAULT_SETTINGS = {
  gameMode:"2v2", earlyFormat:"BO3", finalsFormat:"BO5",
  finalsFrom:"SF", bracketType:"DE", maxTeams:8,
  deadline:"", goldenGoal:true,
};

/* ═══════════════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════════════ */
const rankSeed  = r => RANKS.indexOf(r)+1;
const pow2      = n => { let p=1; while(p<n) p*=2; return p; };
const teamName  = i => `${ADJS[i%ADJS.length]} ${CARS[Math.floor(i/ADJS.length)%CARS.length]}s`;
const rankTier  = r => r.startsWith("Grand")?"Grand":r.startsWith("Super")?"Supersonic":r.split(" ")[0];
const rankColor = r => TIER_COLORS[rankTier(r)]||"#aaa";
const pptFor    = mode => ({"1v1":1,"2v2":2,"3v3":3,"4v4":4}[mode]||2);

function formatCountdown(ms) {
  if(ms<=0) return "CLOSED";
  const d=Math.floor(ms/86400000),h=Math.floor((ms%86400000)/3600000),
        m=Math.floor((ms%3600000)/60000),s=Math.floor((ms%60000)/1000);
  if(d>0) return `${d}d ${h}h ${m}m`;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

function useCountdown(deadline) {
  const [rem,setRem] = useState(null);
  useEffect(()=>{
    if(!deadline){setRem(null);return;}
    const tick=()=>setRem(Math.max(0,new Date(deadline)-new Date()));
    tick(); const id=setInterval(tick,1000); return ()=>clearInterval(id);
  },[deadline]);
  return rem;
}

/* ═══════════════════════════════════════════════════════════════════
   SNAKE DRAFT
═══════════════════════════════════════════════════════════════════ */
function snakeDraft(players, settings) {
  const ppt=pptFor(settings.gameMode);
  const sorted=[...players].sort((a,b)=>b.seed-a.seed);
  if(ppt===1) {
    return { teams:sorted.map((p,i)=>({id:i,name:p.name,players:[p],combinedSeed:p.seed,seed:i+1})), wildcards:[] };
  }
  const n=sorted.length, numTeams=Math.floor(n/ppt), used=numTeams*ppt;
  const wildcards=sorted.slice(used), pool=sorted.slice(0,used);
  const teams=Array.from({length:numTeams},(_,i)=>({id:i,name:teamName(i),players:[],combinedSeed:0,seed:0}));
  let dir=1,ti=0;
  for(let i=0;i<pool.length;i++){
    teams[ti].players.push(pool[i]);
    if(dir===1){if(ti===numTeams-1)dir=-1;else ti++;}
    else{if(ti===0)dir=1;else ti--;}
  }
  teams.forEach(t=>{t.combinedSeed=t.players.reduce((s,p)=>s+p.seed,0);});
  teams.sort((a,b)=>b.combinedSeed-a.combinedSeed);
  teams.forEach((t,i)=>t.seed=i+1);
  return{teams,wildcards};
}

/* ═══════════════════════════════════════════════════════════════════
   BRACKET ENGINE
═══════════════════════════════════════════════════════════════════ */
function getFmt(roundLabel, settings) {
  const{earlyFormat:E,finalsFormat:F,finalsFrom:FF}=settings;
  const l=roundLabel.toLowerCase();
  if(l.includes("grand final")) return F;
  if(FF==="GF") return E;
  if(l.includes("final")) return F;
  if(FF==="Final") return E;
  if(l.includes("semi")||l.includes("sf")) return F;
  return E;
}

function mk(id,bracket,rn,rl,tA,tB,fmt="BO3"){
  const bye=Boolean((tA&&!tB)||(!tA&&tB)),auto=bye?(tA||tB):null;
  return{id,bracket,roundNum:rn,roundLabel:rl,teamA:tA||null,teamB:tB||null,
    winner:auto,loser:null,scoreA:0,scoreB:0,isComplete:!!auto,isBye:bye,format:fmt};
}

function propAll(M,F){
  let chg=true;
  while(chg){
    chg=false;
    for(const[id,m]of Object.entries(M)){
      if(m.isComplete&&F[id]){const f=F[id];if(f.w&&m.winner){const{id:nid,s}=f.w,k=s==="A"?"teamA":"teamB";if(M[nid]&&!M[nid][k]){M[nid]={...M[nid],[k]:m.winner};chg=true;}}}
      if(!m.isComplete&&((m.teamA&&!m.teamB)||(!m.teamA&&m.teamB))){
        const w=m.teamA||m.teamB;M[id]={...m,winner:w,isBye:true,isComplete:true};
        const f=F[id];if(f&&f.w){const{id:nid,s}=f.w,k=s==="A"?"teamA":"teamB";if(M[nid]&&!M[nid][k]){M[nid]={...M[nid],[k]:w};}}
        chg=true;
      }
    }
  }
}

function buildDE(teams,settings){
  const n=teams.length,bs=pow2(settings.maxTeams===0?n:Math.min(n,settings.maxTeams)),s=i=>i<n?teams[i]:null;
  const f=rl=>getFmt(rl,settings); let M={},F={};
  if(bs<=4){
    M={M1:mk("M1","WB",1,"WB Round 1",s(0),s(3),f("WB Round 1")),M2:mk("M2","WB",1,"WB Round 1",s(1),s(2),f("WB Round 1")),
       M3:mk("M3","WB",2,"WB Final",null,null,f("WB Final")),M4:mk("M4","LB",2,"LB Round 1",null,null,f("LB Round 1")),
       M5:mk("M5","LB",3,"LB Final",null,null,f("LB Final")),M6:mk("M6","GF",4,"Grand Final",null,null,f("Grand Final"))};
    F={M1:{w:{id:"M3",s:"A"},l:{id:"M4",s:"A"}},M2:{w:{id:"M3",s:"B"},l:{id:"M4",s:"B"}},
       M3:{w:{id:"M6",s:"A"},l:{id:"M5",s:"B"}},M4:{w:{id:"M5",s:"A"},l:null},
       M5:{w:{id:"M6",s:"B"},l:null},M6:{w:null,l:null}};
  } else {
    M={M1:mk("M1","WB",1,"WB Round 1",s(0),s(7),f("WB Round 1")),M2:mk("M2","WB",1,"WB Round 1",s(3),s(4),f("WB Round 1")),
       M3:mk("M3","WB",1,"WB Round 1",s(1),s(6),f("WB Round 1")),M4:mk("M4","WB",1,"WB Round 1",s(2),s(5),f("WB Round 1")),
       M5:mk("M5","WB",2,"WB Semis",null,null,f("WB Semis")),M6:mk("M6","WB",2,"WB Semis",null,null,f("WB Semis")),
       M7:mk("M7","WB",3,"WB Final",null,null,f("WB Final")),
       M8:mk("M8","LB",2,"LB Round 1",null,null,f("LB Round 1")),M9:mk("M9","LB",2,"LB Round 1",null,null,f("LB Round 1")),
       M10:mk("M10","LB",3,"LB Round 2",null,null,f("LB Round 2")),M11:mk("M11","LB",3,"LB Round 2",null,null,f("LB Round 2")),
       M12:mk("M12","LB",4,"LB Semis",null,null,f("LB Semis")),M13:mk("M13","LB",5,"LB Final",null,null,f("LB Final")),
       M14:mk("M14","GF",6,"Grand Final",null,null,f("Grand Final"))};
    F={M1:{w:{id:"M5",s:"A"},l:{id:"M8",s:"A"}},M2:{w:{id:"M5",s:"B"},l:{id:"M8",s:"B"}},
       M3:{w:{id:"M6",s:"A"},l:{id:"M9",s:"A"}},M4:{w:{id:"M6",s:"B"},l:{id:"M9",s:"B"}},
       M5:{w:{id:"M7",s:"A"},l:{id:"M11",s:"B"}},M6:{w:{id:"M7",s:"B"},l:{id:"M10",s:"B"}},
       M7:{w:{id:"M14",s:"A"},l:{id:"M13",s:"B"}},
       M8:{w:{id:"M10",s:"A"},l:null},M9:{w:{id:"M11",s:"A"},l:null},
       M10:{w:{id:"M12",s:"A"},l:null},M11:{w:{id:"M12",s:"B"},l:null},
       M12:{w:{id:"M13",s:"A"},l:null},M13:{w:{id:"M14",s:"B"},l:null},M14:{w:null,l:null}};
  }
  propAll(M,F); return{matches:M,flow:F,bracketSize:bs,type:"DE"};
}

function buildSE(teams,settings){
  const n=teams.length,bs=pow2(settings.maxTeams===0?n:Math.min(n,settings.maxTeams)),s=i=>i<n?teams[i]:null;
  const f=rl=>getFmt(rl,settings); let M={},F={};
  if(bs<=4){
    M={M1:mk("M1","WB",1,"Semi Finals",s(0),s(3),f("Semi Finals")),M2:mk("M2","WB",1,"Semi Finals",s(1),s(2),f("Semi Finals")),M3:mk("M3","GF",2,"Grand Final",null,null,f("Grand Final"))};
    F={M1:{w:{id:"M3",s:"A"},l:null},M2:{w:{id:"M3",s:"B"},l:null},M3:{w:null,l:null}};
  } else {
    M={M1:mk("M1","WB",1,"Quarter Finals",s(0),s(7),f("Quarter Finals")),M2:mk("M2","WB",1,"Quarter Finals",s(3),s(4),f("Quarter Finals")),
       M3:mk("M3","WB",1,"Quarter Finals",s(1),s(6),f("Quarter Finals")),M4:mk("M4","WB",1,"Quarter Finals",s(2),s(5),f("Quarter Finals")),
       M5:mk("M5","WB",2,"Semi Finals",null,null,f("Semi Finals")),M6:mk("M6","WB",2,"Semi Finals",null,null,f("Semi Finals")),
       M7:mk("M7","GF",3,"Grand Final",null,null,f("Grand Final"))};
    F={M1:{w:{id:"M5",s:"A"},l:null},M2:{w:{id:"M5",s:"B"},l:null},M3:{w:{id:"M6",s:"A"},l:null},M4:{w:{id:"M6",s:"B"},l:null},
       M5:{w:{id:"M7",s:"A"},l:null},M6:{w:{id:"M7",s:"B"},l:null},M7:{w:null,l:null}};
  }
  propAll(M,F); return{matches:M,flow:F,bracketSize:bs,type:"SE"};
}

function buildBracket(teams,settings){
  return settings.bracketType==="SE"?buildSE(teams,settings):buildDE(teams,settings);
}

function applyResult(bracket,mid,sA,sB){
  const{matches:M,flow:F}=bracket,m=M[mid];
  if(!m||m.isComplete)return bracket;
  const wA=sA>sB,winner=wA?m.teamA:m.teamB,loser=wA?m.teamB:m.teamA;
  const nM={...M,[mid]:{...m,scoreA:sA,scoreB:sB,winner,loser,isComplete:true}};
  const f=F[mid];
  if(f.w){const{id,s}=f.w;nM[id]={...nM[id],[s==="A"?"teamA":"teamB"]:winner};}
  if(f.l){const{id,s}=f.l;nM[id]={...nM[id],[s==="A"?"teamA":"teamB"]:loser};}
  propAll(nM,F); return{...bracket,matches:nM};
}

function pickFeatured(matches,round){
  const r=Object.values(matches).filter(m=>!m.isComplete&&!m.isBye&&m.teamA&&m.teamB&&m.roundNum===round);
  if(!r.length)return null;
  return r.sort((a,b)=>Math.abs(a.teamA.seed-a.teamB.seed)-Math.abs(b.teamA.seed-b.teamB.seed))[0];
}

function groupMatches(bracket){
  if(!bracket)return{WB:{},LB:{},GF:[]};
  const g={WB:{},LB:{},GF:[]};
  for(const m of Object.values(bracket.matches)){
    if(m.bracket==="GF"){g.GF.push(m);continue;}
    if(!g[m.bracket][m.roundLabel])g[m.bracket][m.roundLabel]=[];
    g[m.bracket][m.roundLabel].push(m);
  }
  return g;
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN TOURNAMENT APP
═══════════════════════════════════════════════════════════════════ */
export default function TournamentApp({ tournamentCode, isHost, initialData }) {
  const { user } = useUser();

  const [phase,setPhase]           = useState(initialData?.phase || "signup");
  const [players,setPlayers]       = useState(initialData?.players || []);
  const [teams,setTeams]           = useState(initialData?.teams || []);
  const [wildcards,setWildcards]   = useState(initialData?.wildcards || []);
  const [bracket,setBracket]       = useState(initialData?.bracket || null);
  const [modal,setModal]           = useState(null);
  const [sA,setSA]                 = useState("");
  const [sB,setSB]                 = useState("");
  const [featured,setFeatured]     = useState(initialData?.featured || null);
  const [upsets,setUpsets]         = useState(initialData?.upsets || []);
  const [resetWinner,setResetW]    = useState(initialData?.reset_winner || null);
  const [showReset,setShowReset]   = useState(false);
  const [showSettings,setShowSettings] = useState(false);
  const [showFAQ,setShowFAQ]       = useState(false);
  const [showSupport,setShowSupport] = useState(false);
  const [settings,setSettings]     = useState(initialData?.settings || DEFAULT_SETTINGS);
  const [form,setForm]             = useState({name:"",rank:"Diamond I",peak:""});
  const [spectCode]                = useState(initialData?.spect_code || "RL-"+Math.random().toString(36).substr(2,6).toUpperCase());
  const [copied,setCopied]         = useState(false);
  const [tName]                    = useState(initialData?.name || "Tournament");
  const saveTimer                  = useRef(null);

  // ── Save to Supabase (debounced, host only) ──────────────────────
  useEffect(()=>{
    if(!isHost||!tournamentCode) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async()=>{
      await supabase.from("tournaments").update({
        phase, players, teams, wildcards,
        bracket: bracket ? JSON.parse(JSON.stringify(bracket)) : null,
        upsets, reset_winner: resetWinner,
        featured: featured ? JSON.parse(JSON.stringify(featured)) : null,
        settings, spect_code: spectCode,
        updated_at: new Date().toISOString(),
      }).eq("code", tournamentCode);
    }, 600);
    return ()=>clearTimeout(saveTimer.current);
  },[phase,players,teams,wildcards,bracket,upsets,resetWinner,featured,settings]);

  // ── Real-time updates (spectators only) ─────────────────────────
  useEffect(()=>{
    if(isHost||!tournamentCode) return;
    const channel = supabase.channel(`t-${tournamentCode}`)
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"tournaments",filter:`code=eq.${tournamentCode}`},
        ({new:d})=>{
          setPhase(d.phase||"signup");
          setPlayers(d.players||[]);
          setTeams(d.teams||[]);
          setWildcards(d.wildcards||[]);
          setBracket(d.bracket||null);
          setUpsets(d.upsets||[]);
          setResetW(d.reset_winner||null);
          setFeatured(d.featured||null);
          setSettings(d.settings||DEFAULT_SETTINGS);
        })
      .subscribe();
    return ()=>supabase.removeChannel(channel);
  },[tournamentCode,isHost]);

  const gfId=bracket?Object.keys(bracket.flow).find(id=>!bracket.flow[id].w&&!bracket.flow[id].l):null;
  const currentRound=bracket?(()=>{
    const inc=Object.values(bracket.matches).filter(m=>!m.isComplete&&!m.isBye&&m.teamA&&m.teamB);
    if(!inc.length)return null;
    return Math.min(...inc.map(m=>m.roundNum));
  })():1;
  const deadlinePassed=settings.deadline&&new Date(settings.deadline)<=new Date();
  const signupsLocked=!!deadlinePassed;

  function addPlayer(){
    if(!form.name.trim()||signupsLocked||!isHost)return;
    setPlayers(p=>[...p,{id:Date.now(),name:form.name.trim(),rank:form.rank,peak:form.peak||null,seed:rankSeed(form.rank)}]);
    setForm({name:"",rank:"Diamond I",peak:""});
  }
  function loadDemo(){if(!isHost)return;setPlayers(DEMO_PLAYERS.map(p=>({...p,seed:rankSeed(p.rank)})));}
  function closeSignups(){
    if(!isHost)return;
    const min=pptFor(settings.gameMode)*2;
    if(players.length<min){alert(`Need at least ${min} players for ${settings.gameMode}!`);return;}
    const{teams:t,wildcards:w}=snakeDraft(players,settings);
    setTeams(t);setWildcards(w);setPhase("teams");
  }
  function renameTeam(id,name){
    if(!isHost)return;
    setTeams(p=>p.map(t=>t.id===id?{...t,name}:t));
    if(bracket){
      const nM={...bracket.matches};
      for(const[mid,m]of Object.entries(nM)){
        let nm={...m},c=false;
        if(m.teamA?.id===id){nm.teamA={...m.teamA,name};c=true;}
        if(m.teamB?.id===id){nm.teamB={...m.teamB,name};c=true;}
        if(m.winner?.id===id){nm.winner={...m.winner,name};c=true;}
        if(m.loser?.id===id){nm.loser={...m.loser,name};c=true;}
        if(c)nM[mid]=nm;
      }
      setBracket(b=>({...b,matches:nM}));
    }
  }
  function startTournament(){
    if(!isHost)return;
    const b=buildBracket(teams,settings);
    setBracket(b);setFeatured(pickFeatured(b.matches,1));setPhase("bracket");
  }
  function openModal(m){
    if(!isHost||m.isBye||m.isComplete||!m.teamA||!m.teamB)return;
    setModal(m);setSA("");setSB("");
  }
  function submitScore(){
    if(!modal||!isHost)return;
    const a=parseInt(sA),b=parseInt(sB);
    const max=modal.format==="BO7"?4:modal.format==="BO5"?3:modal.format==="BO1"?1:2;
    if(isNaN(a)||isNaN(b)||a===b)return;
    if(a!==max&&b!==max){alert(`One score must equal ${max} (${modal.format})`);return;}
    const m=bracket.matches[modal.id],wT=a>b?m.teamA:m.teamB,lT=a>b?m.teamB:m.teamA;
    if(wT.seed>lT.seed)setUpsets(u=>[...u,{id:modal.id,w:wT.name,l:lT.name,ws:wT.seed,ls:lT.seed,round:m.roundLabel}]);
    const nb=applyResult(bracket,modal.id,a,b);setBracket(nb);setModal(null);
    if(modal.id===gfId){
      const gf=nb.matches[gfId];
      if(gf.winner?.id===gf.teamB?.id&&!resetWinner&&bracket.type==="DE"){setShowReset(true);return;}
      setPhase("results");return;
    }
    const allDone=!Object.values(nb.matches).some(m=>!m.isComplete&&!m.isBye&&m.teamA&&m.teamB);
    if(allDone){setPhase("results");return;}
    const nr=Math.min(...Object.values(nb.matches).filter(m=>!m.isComplete&&!m.isBye&&m.teamA&&m.teamB).map(m=>m.roundNum));
    setFeatured(pickFeatured(nb.matches,nr));
  }
  function handleReset(slot){const gf=bracket.matches[gfId],w=slot==="A"?gf.teamA:gf.teamB;setResetW(w);setShowReset(false);setPhase("results");}
  function getStandings(){
    if(!bracket||!gfId)return null;
    const gf=bracket.matches[gfId];if(!gf?.isComplete)return null;
    const fw=resetWinner||gf.winner,fl=fw?.id===gf.teamA?.id?gf.teamB:gf.teamA;
    const lbf=bracket.type==="DE"?bracket.matches[bracket.bracketSize<=4?"M5":"M13"]:null;
    return{first:fw,second:fl,third:lbf?.loser||null};
  }
  function getMVP(){
    if(!bracket)return null;
    const w={};
    for(const m of Object.values(bracket.matches)){if(!m.isComplete||m.isBye||!m.winner)continue;w[m.winner.id]=(w[m.winner.id]||0)+1;}
    const top=Object.entries(w).sort(([,a],[,b])=>b-a)[0];
    return top?{team:teams.find(t=>t.id===parseInt(top[0])),wins:top[1]}:null;
  }

  function copyLink(){
    const url = `${window.location.origin}/t/${tournamentCode}`;
    navigator.clipboard.writeText(url).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);});
  }

  const groups=groupMatches(bracket),standings=getStandings(),mvp=getMVP();
  const phaseNames=["signup","teams","bracket","results"];

  return(
    <>
      <style>{CSS}</style>
      <div style={{minHeight:"100vh",background:"var(--bg)",backgroundImage:"radial-gradient(ellipse 80% 50% at 10% -10%,rgba(0,212,255,.07),transparent),radial-gradient(ellipse 60% 60% at 90% 110%,rgba(168,85,247,.07),transparent)"}}>

        {/* SPECTATOR BANNER */}
        {!isHost && (
          <div style={{background:"rgba(168,85,247,.1)",borderBottom:"1px solid rgba(168,85,247,.3)",padding:"8px 20px",display:"flex",alignItems:"center",justifyContent:"center",gap:10,fontSize:".82rem"}}>
            <span style={{color:"var(--purple)"}}>👁 You're watching as a spectator</span>
            <span style={{color:"var(--muted)"}}>·</span>
            <span style={{color:"var(--muted)"}}>Live updates enabled</span>
          </div>
        )}

        {/* NAV */}
        <nav style={{position:"sticky",top:0,zIndex:200,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 20px",background:"rgba(5,8,15,.9)",borderBottom:"1px solid var(--border)",backdropFilter:"blur(12px)",flexWrap:"wrap",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <Link to="/" style={{fontFamily:"Orbitron,sans-serif",fontSize:".8rem",fontWeight:900,color:"var(--cyan)",letterSpacing:1,textDecoration:"none"}}>🚀 Home</Link>
            <div style={{width:1,height:16,background:"var(--border)"}}/>
            <div style={{fontFamily:"Orbitron,sans-serif",fontSize:".78rem",fontWeight:700,color:"var(--text)"}}>{tName}</div>
            <div style={{fontFamily:"Orbitron,sans-serif",fontSize:".6rem",color:"var(--muted)",background:"var(--surf)",border:"1px solid var(--border)",borderRadius:5,padding:"2px 8px",letterSpacing:2}}>{tournamentCode}</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {/* Phase trail */}
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              {["Sign-Ups","Teams","Bracket","Results"].map((label,i)=>{
                const p=phaseNames[i],idx=phaseNames.indexOf(phase),active=phase===p,done=idx>i;
                return(
                  <div key={p} style={{display:"flex",alignItems:"center",gap:5}}>
                    <div style={{width:7,height:7,borderRadius:"50%",background:active?"var(--cyan)":done?"var(--green)":"var(--muted)",boxShadow:active?"0 0 8px var(--cyan)":"none"}}/>
                    <span style={{fontSize:".6rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".5px",color:active?"var(--cyan)":done?"var(--green)":"var(--muted)"}}>{label}</span>
                  </div>
                );
              })}
            </div>
            <button onClick={copyLink} style={{fontFamily:"Orbitron,sans-serif",fontSize:".6rem",fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",padding:"5px 10px",borderRadius:6,border:"1px solid rgba(0,212,255,.3)",background:copied?"rgba(0,255,136,.12)":"rgba(0,212,255,.07)",color:copied?"var(--green)":"var(--cyan)",cursor:"pointer"}}>
              {copied?"✓ Copied!":"🔗 Share"}
            </button>
            <button onClick={()=>setShowFAQ(true)} style={{fontFamily:"Orbitron,sans-serif",fontSize:".6rem",fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",padding:"5px 10px",borderRadius:6,border:"1px solid rgba(0,212,255,.3)",background:"rgba(0,212,255,.07)",color:"var(--cyan)",cursor:"pointer"}}>❓ FAQ</button>
            {isHost&&(phase==="signup"||phase==="teams")&&(
              <button onClick={()=>setShowSettings(true)} style={{fontFamily:"Orbitron,sans-serif",fontSize:".6rem",fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",padding:"5px 10px",borderRadius:6,border:"1px solid rgba(168,85,247,.4)",background:"rgba(168,85,247,.08)",color:"var(--purple)",cursor:"pointer"}}>⚙️ Settings</button>
            )}
          </div>
        </nav>

        <div style={{maxWidth:1200,margin:"0 auto",padding:"22px 18px 60px"}}>
          {phase==="signup"  && <SignupView  players={players} form={form} setForm={setForm} addPlayer={addPlayer} loadDemo={loadDemo} removePlayer={id=>setPlayers(p=>p.filter(x=>x.id!==id))} closeSignups={closeSignups} settings={settings} signupsLocked={signupsLocked} isHost={isHost} tournamentCode={tournamentCode}/>}
          {phase==="teams"   && <TeamsView   teams={teams} wildcards={wildcards} startTournament={startTournament} back={()=>setPhase("signup")} rename={renameTeam} settings={settings} isHost={isHost}/>}
          {phase==="bracket" && <BracketPhase groups={groups} featured={featured} spectCode={spectCode} currentRound={currentRound} upsets={upsets} openModal={openModal} bracket={bracket} settings={settings} isHost={isHost}/>}
          {phase==="results" && <ResultsView standings={standings} upsets={upsets} teams={teams} mvp={mvp} resetWinner={resetWinner} settings={settings}/>}
        </div>

        {modal&&isHost&&<ScoreModal match={modal} sA={sA} sB={sB} setSA={setSA} setSB={setSB} onSubmit={submitScore} onClose={()=>setModal(null)}/>}
        {showReset&&gfId&&isHost&&<ResetModal gf={bracket.matches[gfId]} onPick={handleReset}/>}
        {showSettings&&isHost&&<SettingsModal settings={settings} onChange={setSettings} onClose={()=>setShowSettings(false)}/>}
        {showFAQ&&<FAQModal onClose={()=>setShowFAQ(false)}/>}
        {showSupport&&<SupportModal onClose={()=>setShowSupport(false)}/>}
        <SupportButton onClick={()=>setShowSupport(true)}/>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   UI COMPONENTS (ToggleGroup, SettingSection, SettingsModal,
   Countdown, TeamCard, MatchCard, SlotRow, BracketSection,
   ScoreModal, ResetModal, SupportButton, SupportModal, FAQModal)
═══════════════════════════════════════════════════════════════════ */
function ToggleGroup({options,labels,value,onChange}){
  return(
    <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:4}}>
      {options.map((o,i)=>{
        const active=value===o;
        return(<button key={String(o)} onClick={()=>onChange(o)} style={{fontFamily:"Rajdhani,sans-serif",fontWeight:700,fontSize:".82rem",textTransform:"uppercase",padding:"6px 14px",borderRadius:7,border:`1px solid ${active?"var(--cyan)":"var(--border)"}`,background:active?"rgba(0,212,255,.12)":"transparent",color:active?"var(--cyan)":"var(--muted)",cursor:"pointer"}}>{labels?labels[i]:String(o)}</button>);
      })}
    </div>
  );
}

function SettingSection({icon,title,children}){
  return(<div style={{borderBottom:"1px solid var(--border)",paddingBottom:16,marginBottom:16}}><div style={{fontFamily:"Orbitron,sans-serif",fontSize:".72rem",fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",color:"var(--cyan)",marginBottom:10}}>{icon} {title}</div>{children}</div>);
}

function SettingsModal({settings,onChange,onClose}){
  const set=(k,v)=>onChange({...settings,[k]:v});
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.8)",backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:600,padding:18}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:28,maxWidth:560,width:"100%",maxHeight:"90vh",overflowY:"auto",position:"relative",boxShadow:"0 24px 80px rgba(0,0,0,.6)"}}>
        <button onClick={onClose} style={{position:"absolute",top:16,right:16,background:"none",border:"none",color:"var(--muted)",fontSize:"1rem",cursor:"pointer"}}>✕</button>
        <div style={{fontFamily:"Orbitron,sans-serif",fontSize:".6rem",color:"var(--purple)",letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:7}}>Advanced Settings</div>
        <div style={{fontFamily:"Orbitron,sans-serif",fontSize:"1.1rem",fontWeight:700,marginBottom:20}}>⚙️ Tournament Settings</div>
        <SettingSection icon="🎮" title="Game Mode"><ToggleGroup options={["1v1","2v2","3v3","4v4"]} value={settings.gameMode} onChange={v=>set("gameMode",v)}/><div style={{fontSize:".78rem",color:"var(--muted)",marginTop:6}}>{settings.gameMode==="1v1"?"Each player competes solo.":`Players paired ${settings.gameMode} via snake draft.`}</div></SettingSection>
        <SettingSection icon="🏆" title="Bracket Type"><ToggleGroup options={["DE","SE"]} labels={["Double Elimination","Single Elimination"]} value={settings.bracketType} onChange={v=>set("bracketType",v)}/><div style={{fontSize:".78rem",color:"var(--muted)",marginTop:6}}>{settings.bracketType==="DE"?"Teams get a second chance after one loss.":"One loss and you're out."}</div></SettingSection>
        <SettingSection icon="👥" title="Max Teams"><ToggleGroup options={[4,8,16,32,0]} labels={["4","8","16","32","No limit"]} value={settings.maxTeams} onChange={v=>set("maxTeams",v)}/></SettingSection>
        <SettingSection icon="📋" title="Early Round Format"><ToggleGroup options={["BO1","BO3","BO5","BO7"]} value={settings.earlyFormat} onChange={v=>set("earlyFormat",v)}/></SettingSection>
        <SettingSection icon="🔥" title="Finals Format"><ToggleGroup options={["BO3","BO5","BO7"]} value={settings.finalsFormat} onChange={v=>set("finalsFormat",v)}/><div style={{fontSize:".75rem",color:"var(--muted)",margin:"10px 0 6px",fontWeight:600,textTransform:"uppercase",letterSpacing:".4px"}}>Apply finals format from:</div><ToggleGroup options={["SF","Final","GF"]} labels={["Semi-Finals","Finals only","Grand Final only"]} value={settings.finalsFrom} onChange={v=>set("finalsFrom",v)}/></SettingSection>
        <SettingSection icon="⏱" title="Registration Deadline"><input type="datetime-local" value={settings.deadline} onChange={e=>set("deadline",e.target.value)} style={{background:"var(--surf)",border:"1px solid var(--border)",borderRadius:7,padding:"9px 13px",color:"var(--text)",fontFamily:"Rajdhani,sans-serif",fontSize:".9rem",width:"100%",colorScheme:"dark"}}/>{settings.deadline&&<div style={{fontSize:".8rem",color:"var(--muted)",marginTop:6}}>Locks: <strong style={{color:"var(--text)"}}>{new Date(settings.deadline).toLocaleString()}</strong></div>}{settings.deadline&&<button onClick={()=>set("deadline","")} style={{marginTop:6,fontFamily:"Rajdhani,sans-serif",fontWeight:700,fontSize:".78rem",textTransform:"uppercase",padding:"5px 12px",borderRadius:6,border:"1px solid var(--border)",background:"transparent",color:"var(--muted)",cursor:"pointer"}}>Clear</button>}</SettingSection>
        <SettingSection icon="⚡" title="Overtime Rules"><ToggleGroup options={[true,false]} labels={["Golden Goal (sudden death)","No overtime"]} value={settings.goldenGoal} onChange={v=>set("goldenGoal",v)}/></SettingSection>
        <button onClick={onClose} style={{fontFamily:"Rajdhani,sans-serif",fontWeight:800,fontSize:".9rem",textTransform:"uppercase",padding:"13px 18px",borderRadius:8,border:"none",cursor:"pointer",background:"linear-gradient(135deg,var(--cyan),#008ab8)",color:"#000",width:"100%",marginTop:4}}>Save Settings ✓</button>
      </div>
    </div>
  );
}

function Countdown({deadline}){
  const rem=useCountdown(deadline); if(rem===null)return null;
  const closed=rem<=0;
  return(<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:closed?"rgba(255,71,87,.08)":"rgba(0,212,255,.08)",border:`1px solid ${closed?"rgba(255,71,87,.3)":"rgba(0,212,255,.3)"}`,borderRadius:9,padding:"10px 16px",marginBottom:14}}><span style={{fontSize:".82rem",fontWeight:600,color:closed?"var(--red)":"var(--cyan)"}}>{closed?"🔒 Registration Closed":"⏱ Sign-ups close in"}</span>{!closed&&<span style={{fontFamily:"Orbitron,sans-serif",fontSize:"1.1rem",fontWeight:900,color:"var(--gold)"}}>{formatCountdown(rem)}</span>}</div>);
}

function TeamCard({t,onRename,isHost}){
  const[editing,setEditing]=useState(false);
  const[draft,setDraft]=useState(t.name);
  const ref=useRef(null);
  useEffect(()=>{if(editing&&ref.current)ref.current.focus();},[editing]);
  function save(){const v=draft.trim();if(v)onRename(t.id,v);else setDraft(t.name);setEditing(false);}
  return(
    <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:18,position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:"linear-gradient(90deg,var(--cyan),var(--purple))"}}/>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
        <span style={{fontFamily:"Orbitron,sans-serif",fontSize:".58rem",fontWeight:700,color:"var(--cyan)",background:"rgba(0,212,255,.1)",border:"1px solid rgba(0,212,255,.25)",borderRadius:4,padding:"2px 7px",letterSpacing:".8px",whiteSpace:"nowrap",flexShrink:0}}>SEED #{t.seed}</span>
        <div style={{display:"flex",alignItems:"center",gap:6,flex:1,minWidth:0}}>
          {editing&&isHost?(
            <div style={{display:"flex",alignItems:"center",gap:5,flex:1,minWidth:0}}>
              <input ref={ref} value={draft} maxLength={30} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")save();if(e.key==="Escape"){setDraft(t.name);setEditing(false);}}} onBlur={save} style={{background:"var(--surf)",border:"1px solid var(--cyan)",borderRadius:6,padding:"4px 8px",color:"var(--text)",fontFamily:"Orbitron,sans-serif",fontSize:".78rem",fontWeight:700,width:"100%",outline:"none"}}/>
              <button onMouseDown={e=>{e.preventDefault();save();}} style={{background:"var(--cyan)",border:"none",borderRadius:5,color:"#000",fontFamily:"Orbitron,sans-serif",fontSize:".6rem",fontWeight:900,padding:"4px 7px",cursor:"pointer",flexShrink:0}}>OK</button>
            </div>
          ):(
            <>
              <span style={{fontFamily:"Orbitron,sans-serif",fontSize:".82rem",fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{t.name}</span>
              {isHost&&<button onClick={()=>{setDraft(t.name);setEditing(true);}} style={{background:"none",border:"none",cursor:"pointer",color:"var(--muted)",fontSize:".9rem",padding:"2px 4px",borderRadius:4,flexShrink:0}}>✏️</button>}
            </>
          )}
        </div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12}}>
        {t.players.map(p=>(<div key={p.id} style={{display:"flex",alignItems:"center",gap:7}}><span style={{fontWeight:700,fontSize:".7rem",minWidth:85,color:rankColor(p.rank)}}>{p.rank}</span><span style={{fontWeight:600,fontSize:".88rem"}}>{p.name}</span></div>))}
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderTop:"1px solid var(--border)",paddingTop:9,fontSize:".76rem",color:"var(--muted)"}}>
        <span>Combined Seed</span>
        <strong style={{color:"var(--cyan)",fontFamily:"Orbitron,sans-serif",fontSize:".84rem"}}>{t.combinedSeed}</strong>
      </div>
    </div>
  );
}

function MatchCard({match:m,onClick,isGF,isHost}){
  const ready=isHost&&m.teamA&&m.teamB&&!m.isComplete&&!m.isBye;
  const borderColor=m.isComplete?"rgba(0,255,136,.18)":ready?"rgba(0,212,255,.4)":isGF?"rgba(255,215,0,.45)":"var(--border)";
  return(
    <div style={{background:"var(--surf)",border:`1px solid ${borderColor}`,borderRadius:9,padding:11,fontSize:".82rem",cursor:ready?"pointer":"default",boxShadow:isGF?"0 0 20px rgba(255,215,0,.1)":"none",...(m.isBye?{opacity:.55}:{})}} onClick={ready?onClick:undefined}>
      <div style={{fontFamily:"Orbitron,sans-serif",fontSize:".55rem",color:"var(--muted)",marginBottom:8}}>{m.id} · <span style={{color:"var(--purple)"}}>{m.format}</span></div>
      <SlotRow team={m.teamA} winner={m.winner} score={m.isComplete?m.scoreA:null}/>
      <div style={{textAlign:"center",fontSize:".62rem",color:"var(--muted)",padding:"1px 0"}}>vs</div>
      <SlotRow team={m.teamB} winner={m.winner} score={m.isComplete?m.scoreB:null} bye={m.isBye}/>
      {ready&&<div style={{fontSize:".62rem",color:"var(--cyan)",textAlign:"center",marginTop:6,opacity:.75}}>▶ Enter Score</div>}
      {m.isBye&&<div style={{fontSize:".58rem",color:"var(--green)",textAlign:"center",marginTop:5,letterSpacing:".8px",fontFamily:"Orbitron,sans-serif"}}>AUTO ADVANCE</div>}
    </div>
  );
}

function SlotRow({team,winner,score,bye}){
  const isW=team&&winner&&team.id===winner.id;
  if(!team)return<div style={{display:"flex",alignItems:"center",gap:6,padding:"3px 0",color:"var(--muted)",fontStyle:"italic",fontWeight:400}}>{bye?"BYE":"TBD"}</div>;
  return(<div style={{display:"flex",alignItems:"center",gap:6,padding:"3px 0",fontWeight:600,...(isW?{color:"var(--green)"}:{})}}><span style={{fontFamily:"Orbitron,sans-serif",fontSize:".58rem",color:"var(--muted)",minWidth:20}}>#{team.seed}</span><span style={{flex:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",fontSize:".82rem"}}>{team.name}</span>{score!=null&&<span style={{fontFamily:"Orbitron,sans-serif",fontWeight:900,fontSize:".95rem",color:"var(--cyan)"}}>{score}</span>}</div>);
}

function BracketSection({title,color,rounds,openModal,isHost}){
  const colors={wb:"var(--wb)",lb:"var(--lb)",gf:"var(--gf)"};
  const c=colors[color];
  return(
    <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:18}}>
      <div style={{fontFamily:"Orbitron,sans-serif",fontSize:".75rem",fontWeight:900,letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:14,color:c}}>{title}</div>
      <div style={{display:"flex",gap:12,overflowX:"auto",paddingBottom:5}}>
        {Object.entries(rounds).map(([label,matches])=>(
          <div key={label} style={{minWidth:180,display:"flex",flexDirection:"column",gap:9}}>
            <div style={{fontFamily:"Orbitron,sans-serif",fontSize:".58rem",fontWeight:700,letterSpacing:"1.2px",textTransform:"uppercase",textAlign:"center",padding:"4px 8px",borderRadius:4,marginBottom:2,color:c,background:`${c}12`,border:`1px solid ${c}30`}}>{label}</div>
            {matches.map(m=><MatchCard key={m.id} match={m} onClick={()=>openModal(m)} isHost={isHost}/>)}
          </div>
        ))}
      </div>
    </div>
  );
}

function ScoreModal({match:m,sA,sB,setSA,setSB,onSubmit,onClose}){
  const max=m.format==="BO7"?4:m.format==="BO5"?3:m.format==="BO1"?1:2;
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:500,padding:18}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:28,maxWidth:460,width:"100%",position:"relative",boxShadow:"0 24px 80px rgba(0,0,0,.5)"}}>
        <button onClick={onClose} style={{position:"absolute",top:16,right:16,background:"none",border:"none",color:"var(--muted)",fontSize:"1rem",cursor:"pointer"}}>✕</button>
        <div style={{fontFamily:"Orbitron,sans-serif",fontSize:".6rem",color:"var(--cyan)",letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:7}}>{m.roundLabel} · {m.format} · First to {max}</div>
        <div style={{fontFamily:"Orbitron,sans-serif",fontSize:"1.1rem",fontWeight:700,marginBottom:20}}>Enter Match Result</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:14,alignItems:"center",marginBottom:10}}>
          <div style={{display:"flex",flexDirection:"column",gap:9,textAlign:"center"}}><div style={{fontWeight:700,fontSize:".9rem"}}>#{m.teamA?.seed} {m.teamA?.name}</div><input style={{background:"var(--surf)",border:"2px solid var(--border)",borderRadius:10,padding:"12px 8px",color:"var(--text)",fontFamily:"Orbitron,sans-serif",fontSize:"2rem",fontWeight:900,textAlign:"center",width:"100%"}} type="number" min="0" max={max} placeholder="0" value={sA} onChange={e=>setSA(e.target.value)}/></div>
          <div style={{fontFamily:"Orbitron,sans-serif",fontSize:".85rem",color:"var(--orange)",textAlign:"center",fontWeight:700}}>VS</div>
          <div style={{display:"flex",flexDirection:"column",gap:9,textAlign:"center"}}><div style={{fontWeight:700,fontSize:".9rem"}}>#{m.teamB?.seed} {m.teamB?.name}</div><input style={{background:"var(--surf)",border:"2px solid var(--border)",borderRadius:10,padding:"12px 8px",color:"var(--text)",fontFamily:"Orbitron,sans-serif",fontSize:"2rem",fontWeight:900,textAlign:"center",width:"100%"}} type="number" min="0" max={max} placeholder="0" value={sB} onChange={e=>setSB(e.target.value)}/></div>
        </div>
        <p style={{textAlign:"center",color:"var(--muted)",fontSize:".8rem",marginBottom:16}}>Games won by each team (first to {max})</p>
        <div style={{display:"flex",gap:9}}>
          <button onClick={onClose} style={{flex:1,fontFamily:"Rajdhani,sans-serif",fontWeight:700,fontSize:".9rem",textTransform:"uppercase",padding:"10px",borderRadius:8,border:"1px solid var(--border)",background:"transparent",color:"var(--text)",cursor:"pointer"}}>Cancel</button>
          <button onClick={onSubmit} style={{flex:1,fontFamily:"Rajdhani,sans-serif",fontWeight:800,fontSize:".9rem",textTransform:"uppercase",padding:"10px",borderRadius:8,border:"none",background:"linear-gradient(135deg,var(--cyan),#008ab8)",color:"#000",cursor:"pointer"}}>Confirm ✓</button>
        </div>
      </div>
    </div>
  );
}

function ResetModal({gf,onPick}){
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.8)",backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:500,padding:18}}>
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:28,maxWidth:440,width:"100%",textAlign:"center",boxShadow:"0 24px 80px rgba(0,0,0,.5)"}}>
        <div style={{fontSize:"2.5rem",marginBottom:12}}>🔄</div>
        <div style={{fontFamily:"Orbitron,sans-serif",fontSize:"1.3rem",color:"var(--gold)",marginBottom:12,fontWeight:700}}>Bracket Reset!</div>
        <p style={{color:"var(--muted)",lineHeight:1.65,marginBottom:10,fontSize:".9rem"}}>The LB champion just won the Grand Final! One more game determines the true champion.</p>
        <p style={{fontWeight:700,marginBottom:20}}>Who won the reset match?</p>
        <div style={{display:"flex",gap:12}}>
          <button onClick={()=>onPick("A")} style={{flex:1,fontFamily:"Rajdhani,sans-serif",fontWeight:800,fontSize:".9rem",textTransform:"uppercase",padding:"14px 9px",borderRadius:8,border:"none",background:"linear-gradient(135deg,var(--cyan),#008ab8)",color:"#000",cursor:"pointer"}}>🏆 {gf.teamA?.name}</button>
          <button onClick={()=>onPick("B")} style={{flex:1,fontFamily:"Rajdhani,sans-serif",fontWeight:800,fontSize:".9rem",textTransform:"uppercase",padding:"14px 9px",borderRadius:8,border:"none",background:"linear-gradient(135deg,var(--cyan),#008ab8)",color:"#000",cursor:"pointer"}}>🏆 {gf.teamB?.name}</button>
        </div>
      </div>
    </div>
  );
}

function SupportButton({onClick}){
  return(<button onClick={onClick} style={{position:"fixed",bottom:24,right:24,zIndex:400,display:"flex",alignItems:"center",gap:7,fontFamily:"Orbitron,sans-serif",fontWeight:700,fontSize:".68rem",letterSpacing:"1px",textTransform:"uppercase",padding:"10px 16px",borderRadius:30,border:"1px solid rgba(145,70,255,.5)",background:"rgba(145,70,255,.15)",color:"#bf94ff",cursor:"pointer",backdropFilter:"blur(8px)",boxShadow:"0 4px 20px rgba(145,70,255,.25)"}}>💜 Support</button>);
}

function SupportModal({onClose}){
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:600,padding:18}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"var(--card)",border:"1px solid rgba(145,70,255,.3)",borderRadius:16,padding:32,maxWidth:400,width:"100%",position:"relative",boxShadow:"0 24px 80px rgba(0,0,0,.6)",textAlign:"center"}}>
        <button onClick={onClose} style={{position:"absolute",top:14,right:14,background:"none",border:"none",color:"var(--muted)",fontSize:"1rem",cursor:"pointer"}}>✕</button>
        <div style={{fontSize:"2.4rem",marginBottom:12}}>💜</div>
        <div style={{fontFamily:"Orbitron,sans-serif",fontSize:"1.1rem",fontWeight:900,marginBottom:8}}>Support This Project</div>
        <p style={{color:"var(--muted)",fontSize:".88rem",lineHeight:1.7,marginBottom:24}}>Built and maintained by <strong style={{color:"#bf94ff"}}>chilly7383</strong>. If you enjoy it, consider showing some support!</p>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <a href="https://www.twitch.tv/chilly7383" target="_blank" rel="noopener noreferrer" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,padding:"12px 20px",borderRadius:10,background:"rgba(145,70,255,.15)",border:"1px solid rgba(145,70,255,.4)",color:"#bf94ff",fontFamily:"Orbitron,sans-serif",fontWeight:700,fontSize:".8rem",letterSpacing:"1px",textTransform:"uppercase",textDecoration:"none"}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#bf94ff"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/></svg>
            Follow on Twitch
          </a>
          <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 20px",borderRadius:10,background:"rgba(255,255,255,.04)",border:"1px solid var(--border)",color:"var(--muted)",fontFamily:"Orbitron,sans-serif",fontWeight:700,fontSize:".75rem",letterSpacing:"1px",textTransform:"uppercase",justifyContent:"center"}}>💰 Donate link coming soon</div>
        </div>
        <p style={{color:"var(--muted)",fontSize:".75rem",marginTop:20,lineHeight:1.6}}>Even just watching in chat makes a difference. Thank you! 🚀</p>
      </div>
    </div>
  );
}

function FAQModal({onClose}){
  const[tab,setTab]=useState("faq");
  const faqs=[
    {q:"How do I register?",a:"Contact the host via stream chat or DM with your Rocket League gamertag and current rank. The host adds you before sign-ups close."},
    {q:"How does team balancing work?",a:"Players are sorted by rank then paired via snake draft — highest rank with lowest, second highest with second lowest. Every team gets a roughly equal combined skill level."},
    {q:"What is double elimination?",a:"You need to lose twice to be knocked out. After your first loss you drop into the Losers Bracket and get a second chance to reach the Grand Final."},
    {q:"How do I spectate a match?",a:"In Rocket League go to Play → Custom Games → Join Private Match and enter the spectator code shown on stream. You MUST join before the match starts."},
    {q:"What happens if my team no-shows?",a:"If your team doesn't join the lobby within 5 minutes your opponent gets a walkover win. Be online and ready before each round."},
    {q:"What is a bracket reset?",a:"In double elimination the Grand Final is WB champion vs LB champion. If the LB champion wins, a reset match is played since both now have 1 loss."},
    {q:"What format are matches played in?",a:"The host sets the format in Settings. Common formats are BO3 (first to 2) for early rounds and BO5 (first to 3) for finals."},
    {q:"What happens in overtime?",a:"If golden goal is enabled the first goal in overtime wins immediately. If disabled overtime plays like a normal extra period."},
  ];
  const steps=[
    {n:1,title:"Configure your settings first",body:"Click ⚙️ Settings before opening sign-ups. Set game mode, bracket type, match format, max teams, and optionally a registration deadline."},
    {n:2,title:"Collect registrations",body:"Share the tournament link or code with your community. For each player, enter their gamertag and rank in the Sign-Ups tab."},
    {n:3,title:"Close sign-ups and review teams",body:"Click 'Close Sign-Ups & Generate Teams'. Review the auto-balanced teams and rename any with the ✏️ button. Then click 'Generate Bracket'."},
    {n:4,title:"Set up lobbies in Rocket League",body:"For each match, one player creates a Private Match with a simple password. Share lobby details with both teams. For the Featured Match share the spectator code."},
    {n:5,title:"Run rounds simultaneously",body:"All matches in a round run at the same time. Call 'Go!' for all lobbies at once. The lobby schedule shows which match is in which lobby."},
    {n:6,title:"Enter scores as results come in",body:"Click on a match card in the bracket and enter the series score. The bracket updates instantly for all viewers."},
    {n:7,title:"Handle no-shows and drop-outs",body:"No-show after 5 min = walkover (enter 2-0 or 3-0 for opponent). If a player drops out use a wildcard sub if available and rename the team card."},
    {n:8,title:"Grand Final and bracket reset",body:"The Grand Final is WB vs LB champion. If LB wins a bracket reset is required. The app will prompt you automatically. Results page shows the full podium."},
  ];
  const btnStyle=(active)=>({fontFamily:"Orbitron,sans-serif",fontWeight:700,fontSize:".7rem",letterSpacing:"1px",textTransform:"uppercase",padding:"8px 18px",borderRadius:7,border:`1px solid ${active?"var(--cyan)":"var(--border)"}`,background:active?"rgba(0,212,255,.12)":"transparent",color:active?"var(--cyan)":"var(--muted)",cursor:"pointer"});
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.8)",backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:600,padding:18}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:28,maxWidth:680,width:"100%",maxHeight:"88vh",display:"flex",flexDirection:"column",position:"relative",boxShadow:"0 24px 80px rgba(0,0,0,.6)"}}>
        <button onClick={onClose} style={{position:"absolute",top:16,right:16,background:"none",border:"none",color:"var(--muted)",fontSize:"1rem",cursor:"pointer"}}>✕</button>
        <div style={{fontFamily:"Orbitron,sans-serif",fontSize:".6rem",color:"var(--cyan)",letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:6}}>Help Centre</div>
        <div style={{fontFamily:"Orbitron,sans-serif",fontSize:"1.15rem",fontWeight:700,marginBottom:16}}>❓ FAQ &amp; Host Guide</div>
        <div style={{display:"flex",gap:8,marginBottom:20,borderBottom:"1px solid var(--border)",paddingBottom:14}}>
          <button style={btnStyle(tab==="faq")} onClick={()=>setTab("faq")}>🎮 Players &amp; Spectators</button>
          <button style={btnStyle(tab==="host")} onClick={()=>setTab("host")}>🏆 Host Setup Guide</button>
        </div>
        <div style={{overflowY:"auto",flex:1,paddingRight:4}}>
          {tab==="faq"&&<div style={{display:"flex",flexDirection:"column",gap:10}}>{faqs.map((item,i)=><FAQItem key={i} q={item.q} a={item.a}/>)}</div>}
          {tab==="host"&&<div style={{display:"flex",flexDirection:"column",gap:12}}><div style={{background:"rgba(255,215,0,.06)",border:"1px solid rgba(255,215,0,.2)",borderRadius:8,padding:"10px 14px",fontSize:".82rem",color:"var(--gold)",marginBottom:4,lineHeight:1.6}}>💡 <strong>Before you go live:</strong> complete steps 1–3 first.</div>{steps.map(s=><StepItem key={s.n} n={s.n} title={s.title} body={s.body}/>)}</div>}
        </div>
      </div>
    </div>
  );
}

function FAQItem({q,a}){
  const[open,setOpen]=useState(false);
  return(<div style={{border:"1px solid var(--border)",borderRadius:9,overflow:"hidden",...(open?{borderColor:"rgba(0,212,255,.3)"}:{})}}><button onClick={()=>setOpen(o=>!o)} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"11px 14px",background:"none",border:"none",cursor:"pointer",textAlign:"left"}}><span style={{fontWeight:700,fontSize:".88rem",color:"var(--text)"}}>{q}</span><span style={{color:"var(--cyan)",fontSize:"1rem",flexShrink:0,transform:open?"rotate(180deg)":"rotate(0)",transition:"transform .2s"}}>▾</span></button>{open&&<div style={{padding:"0 14px 12px",fontSize:".85rem",color:"var(--muted)",lineHeight:1.7,borderTop:"1px solid var(--border)"}}><div style={{paddingTop:10}}>{a}</div></div>}</div>);
}

function StepItem({n,title,body}){
  return(<div style={{display:"flex",gap:14,padding:"14px",background:"var(--surf)",borderRadius:10,border:"1px solid var(--border)"}}><div style={{fontFamily:"Orbitron,sans-serif",fontSize:".9rem",fontWeight:900,color:"var(--cyan)",minWidth:28,paddingTop:2}}>{String(n).padStart(2,"0")}</div><div><div style={{fontWeight:700,fontSize:".9rem",marginBottom:5}}>{title}</div><div style={{fontSize:".82rem",color:"var(--muted)",lineHeight:1.7}}>{body}</div></div></div>);
}

/* ═══════════════════════════════════════════════════════════════════
   PHASE VIEWS
═══════════════════════════════════════════════════════════════════ */
const C={
  h1:{fontFamily:"Orbitron,sans-serif",fontSize:"clamp(1.3rem,2.5vw,1.9rem)",fontWeight:900,background:"linear-gradient(135deg,#fff 30%,var(--cyan))",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text",lineHeight:1.2,marginBottom:5},
  sub:{color:"var(--muted)",fontSize:".9rem",marginBottom:20},
  card:{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:18},
  ctitle:{fontFamily:"Orbitron,sans-serif",fontSize:".72rem",fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",color:"var(--cyan)",marginBottom:12},
  inp:{background:"var(--surf)",border:"1px solid var(--border)",borderRadius:7,padding:"9px 13px",color:"var(--text)",fontFamily:"Rajdhani,sans-serif",fontSize:".9rem",width:"100%"},
  pill:{background:"var(--cyan)",color:"#000",borderRadius:20,padding:"1px 8px",fontSize:".68rem",fontFamily:"Orbitron,sans-serif",fontWeight:700},
  prow:{display:"flex",alignItems:"center",gap:7,padding:"7px 10px",background:"var(--surf)",borderRadius:6},
  primaryBtn:{fontFamily:"Rajdhani,sans-serif",fontWeight:800,fontSize:".9rem",textTransform:"uppercase",letterSpacing:".5px",padding:"9px 18px",borderRadius:8,border:"none",cursor:"pointer",background:"linear-gradient(135deg,var(--cyan),#008ab8)",color:"#000",display:"inline-flex",alignItems:"center",gap:5},
  ghostBtn:{fontFamily:"Rajdhani,sans-serif",fontWeight:700,fontSize:".9rem",textTransform:"uppercase",padding:"9px 18px",borderRadius:8,border:"1px solid var(--border)",background:"transparent",color:"var(--text)",cursor:"pointer"},
};

function SignupView({players,form,setForm,addPlayer,loadDemo,removePlayer,closeSignups,settings,signupsLocked,isHost,tournamentCode}){
  const ppt=pptFor(settings.gameMode),min=ppt*2;
  const sorted=[...players].sort((a,b)=>b.seed-a.seed);
  const shareUrl=`${window.location.origin}/t/${tournamentCode}`;
  return(
    <div>
      <h1 style={C.h1}>Tournament Sign-Ups</h1>
      <p style={C.sub}>Mode: <strong style={{color:"var(--cyan)"}}>{settings.gameMode}</strong> · Bracket: <strong style={{color:"var(--cyan)"}}>{settings.bracketType==="DE"?"Double Elim":"Single Elim"}</strong> · Max Teams: <strong style={{color:"var(--cyan)"}}>{settings.maxTeams===0?"No limit":settings.maxTeams}</strong></p>
      {/* Share link box */}
      <div style={{background:"rgba(0,212,255,.06)",border:"1px solid rgba(0,212,255,.2)",borderRadius:9,padding:"10px 14px",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
        <div><span style={{fontSize:".72rem",color:"var(--muted)",textTransform:"uppercase",letterSpacing:".5px",fontWeight:700}}>Share link · </span><span style={{fontFamily:"Orbitron,sans-serif",fontSize:".75rem",color:"var(--cyan)",letterSpacing:1}}>{shareUrl}</span></div>
        <button onClick={()=>navigator.clipboard.writeText(shareUrl)} style={{fontFamily:"Orbitron,sans-serif",fontSize:".6rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".5px",padding:"5px 10px",borderRadius:6,border:"1px solid rgba(0,212,255,.3)",background:"rgba(0,212,255,.08)",color:"var(--cyan)",cursor:"pointer"}}>Copy</button>
      </div>
      {settings.deadline&&<Countdown deadline={settings.deadline}/>}
      {signupsLocked&&<div style={{background:"rgba(255,71,87,.1)",border:"1px solid rgba(255,71,87,.3)",borderRadius:9,padding:"12px 16px",marginBottom:14,color:"var(--red)",fontWeight:600,fontSize:".9rem"}}>🔒 Registration is closed.</div>}
      <div style={{display:"grid",gridTemplateColumns:"300px 1fr",gap:16}}>
        {isHost&&(
          <div style={{...C.card,display:"flex",flexDirection:"column",gap:9}}>
            <div style={C.ctitle}>➕ Add Player</div>
            <input style={{...C.inp,...(signupsLocked?{opacity:.4,pointerEvents:"none"}:{})}} placeholder="Gamertag / Display Name" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&addPlayer()} disabled={signupsLocked}/>
            <span style={{display:"block",fontSize:".72rem",fontWeight:600,color:"var(--muted)",margin:"8px 0 3px",textTransform:"uppercase",letterSpacing:".4px"}}>Current Rank</span>
            <select style={{...C.inp,...(signupsLocked?{opacity:.4,pointerEvents:"none"}:{})}} value={form.rank} onChange={e=>setForm(f=>({...f,rank:e.target.value}))} disabled={signupsLocked}>{RANKS.map(r=><option key={r}>{r}</option>)}</select>
            <span style={{display:"block",fontSize:".72rem",fontWeight:600,color:"var(--muted)",margin:"8px 0 3px",textTransform:"uppercase",letterSpacing:".4px"}}>Peak Rank (optional)</span>
            <input style={{...C.inp,...(signupsLocked?{opacity:.4,pointerEvents:"none"}:{})}} placeholder="e.g. Diamond III" value={form.peak} onChange={e=>setForm(f=>({...f,peak:e.target.value}))} disabled={signupsLocked}/>
            <button style={{...C.primaryBtn,...(signupsLocked?{opacity:.4,pointerEvents:"none"}:{})}} onClick={addPlayer} disabled={signupsLocked}>+ Add Player</button>
            <div style={{height:1,background:"var(--border)",margin:"3px 0"}}/>
            <button style={C.ghostBtn} onClick={loadDemo} disabled={signupsLocked}>🎮 Load Demo Players</button>
          </div>
        )}
        <div style={{...C.card,...(!isHost?{gridColumn:"1 / -1"}:{})}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
            <span style={{...C.ctitle,marginBottom:0}}>Registered Players</span>
            <span style={C.pill}>{players.length}</span>
          </div>
          {!players.length&&<p style={{color:"var(--muted)",fontStyle:"italic",fontSize:".85rem",padding:"16px 0",textAlign:"center"}}>{isHost?"No players yet. Use the form to register!":"No players registered yet. Check back soon!"}</p>}
          <div style={{maxHeight:280,overflowY:"auto",display:"flex",flexDirection:"column",gap:4,marginBottom:10}}>
            {sorted.map((p,i)=>(
              <div key={p.id} style={C.prow}>
                <span style={{fontFamily:"Orbitron,sans-serif",fontSize:".6rem",color:"var(--muted)",minWidth:20}}>#{i+1}</span>
                <span style={{fontWeight:700,fontSize:".72rem",minWidth:100,color:rankColor(p.rank)}}>{p.rank}</span>
                <span style={{flex:1,fontWeight:600,fontSize:".9rem"}}>{p.name}</span>
                {isHost&&<button style={{background:"none",border:"none",color:"var(--muted)",cursor:"pointer",fontSize:".85rem",padding:"1px 5px",borderRadius:4}} onClick={()=>removePlayer(p.id)}>✕</button>}
              </div>
            ))}
          </div>
          {isHost&&(
            <div style={{display:"flex",flexDirection:"column",gap:7,borderTop:"1px solid var(--border)",paddingTop:12}}>
              {players.length<min&&<p style={{color:"var(--orange)",fontSize:".82rem",fontWeight:600}}>⚠ Need {min-players.length} more player{min-players.length!==1?"s":""} for {settings.gameMode}</p>}
              {players.length%ppt!==0&&players.length>=min&&<p style={{color:"var(--cyan)",fontSize:".82rem"}}>ℹ {players.length%ppt} extra player{players.length%ppt>1?"s":""} will become wildcard sub{players.length%ppt>1?"s":""}</p>}
              {players.length>=min&&!signupsLocked&&<button style={{...C.primaryBtn,width:"100%",justifyContent:"center",padding:"13px 18px",marginTop:4}} onClick={closeSignups}>Close Sign-Ups &amp; Generate Teams →</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TeamsView({teams,wildcards,startTournament,back,rename,settings,isHost}){
  return(
    <div>
      <h1 style={C.h1}>⚡ Team Reveal</h1>
      <p style={C.sub}>{settings.gameMode==="1v1"?"1v1 — each player competes solo.":`Balanced via snake draft (${settings.gameMode}).`}{isHost?" Click ✏️ to rename any team.":""}</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:14,marginBottom:16}}>
        {teams.map(t=><TeamCard key={t.id} t={t} onRename={rename} isHost={isHost}/>)}
      </div>
      {wildcards.length>0&&<div style={{...C.card,color:"var(--orange)",borderColor:"rgba(255,107,53,.25)",marginBottom:16,fontSize:".88rem"}}>🃏 <strong>Wildcard Sub{wildcards.length>1?"s":""}:</strong> {wildcards.map(p=><span key={p.id}>{p.name} <span style={{color:rankColor(p.rank)}}>({p.rank})</span> </span>)}</div>}
      {isHost&&(
        <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
          <button style={C.ghostBtn} onClick={back}>← Back</button>
          <button style={{...C.primaryBtn,flex:1,justifyContent:"center",padding:"13px 18px"}} onClick={startTournament}>🏟️ Generate Bracket &amp; Start Tournament!</button>
        </div>
      )}
    </div>
  );
}

function BracketPhase({groups,featured,spectCode,currentRound,upsets,openModal,bracket,settings,isHost}){
  return(
    <div>
      <h1 style={C.h1}>🏟️ Live Bracket</h1>
      {currentRound?<p style={C.sub}>Round {currentRound} in progress · {settings.goldenGoal?"Golden goal OT":"No overtime"}{isHost?" · Click any ready match to enter scores":""}</p>:<p style={C.sub}>All matches complete!</p>}
      {featured&&(
        <div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap",background:"linear-gradient(135deg,rgba(0,212,255,.07),rgba(168,85,247,.07))",border:"1px solid rgba(0,212,255,.35)",borderRadius:11,padding:"14px 18px",marginBottom:14}}>
          <span style={{fontFamily:"Orbitron,sans-serif",fontSize:".6rem",fontWeight:900,letterSpacing:"2px",color:"var(--cyan)",background:"rgba(0,212,255,.12)",border:"1px solid rgba(0,212,255,.3)",borderRadius:5,padding:"3px 9px",whiteSpace:"nowrap"}}>🎮 FEATURED MATCH</span>
          <div style={{flex:1}}>
            <div style={{fontSize:".72rem",color:"var(--muted)",textTransform:"uppercase",letterSpacing:"1px",marginBottom:3}}>{featured.roundLabel}</div>
            <div style={{display:"flex",alignItems:"center",gap:10,fontSize:"1.05rem",fontWeight:700}}><span>{featured.teamA?.name}</span><span style={{color:"var(--orange)",fontFamily:"Orbitron,sans-serif",fontSize:".75rem"}}>VS</span><span>{featured.teamB?.name}</span></div>
          </div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:2}}>
            <span style={{fontSize:".7rem",color:"var(--muted)"}}>Spectator Code</span>
            <strong style={{fontFamily:"Orbitron,sans-serif",fontSize:".9rem",color:"var(--gold)",letterSpacing:2}}>{spectCode}</strong>
            <span style={{fontSize:".7rem",color:"var(--green)"}}>Starting in ~3 min</span>
          </div>
        </div>
      )}
      {upsets.length>0&&<div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>{upsets.map((u,i)=><span key={i} style={{background:"rgba(255,71,87,.1)",border:"1px solid rgba(255,71,87,.3)",borderRadius:5,padding:"5px 10px",fontSize:".78rem",color:"var(--red)"}}>🚨 UPSET · <strong>{u.w}</strong>(#{u.ws}) def. <strong>{u.l}</strong>(#{u.ls}) · {u.round}</span>)}</div>}
      <div style={{display:"flex",flexDirection:"column",gap:14,marginBottom:18}}>
        <BracketSection title="🏆 Winners Bracket" color="wb" rounds={groups.WB} openModal={openModal} isHost={isHost}/>
        {bracket?.type==="DE"&&Object.keys(groups.LB).length>0&&<BracketSection title="💀 Losers Bracket" color="lb" rounds={groups.LB} openModal={openModal} isHost={isHost}/>}
        {groups.GF?.length>0&&(
          <div style={{...C.card,borderColor:"rgba(255,215,0,.3)"}}>
            <div style={{fontFamily:"Orbitron,sans-serif",fontSize:".75rem",fontWeight:900,letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:14,color:"var(--gf)"}}>⭐ Grand Final</div>
            <div style={{display:"flex",gap:12}}><div style={{minWidth:180,display:"flex",flexDirection:"column",gap:9}}>{groups.GF.map(m=><MatchCard key={m.id} match={m} onClick={()=>openModal(m)} isGF isHost={isHost}/>)}</div></div>
          </div>
        )}
      </div>
      {bracket&&currentRound&&(
        <div style={C.card}>
          <div style={C.ctitle}>📋 Round {currentRound} · Simultaneous Lobbies</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {Object.values(bracket.matches).filter(m=>m.roundNum===currentRound&&!m.isBye).map((m,i)=>(
              <div key={m.id} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 12px",background:"var(--surf)",borderRadius:7,fontSize:".84rem",flexWrap:"wrap",...(m.isComplete?{opacity:.55}:{})}}>
                <span style={{fontFamily:"Orbitron,sans-serif",fontSize:".58rem",color:"var(--muted)",minWidth:55}}>Lobby {i+1}</span>
                <span style={{fontSize:".65rem",fontWeight:700,padding:"2px 6px",borderRadius:3,textTransform:"uppercase",...(m.bracket==="WB"?{background:"rgba(0,212,255,.1)",color:"var(--wb)"}:{background:"rgba(255,107,53,.1)",color:"var(--lb)"})}}>{m.bracket}</span>
                <span style={{flex:1,fontWeight:600}}>{m.teamA?.name||"TBD"}<em style={{fontStyle:"normal",color:"var(--muted)",margin:"0 5px"}}>vs</em>{m.teamB?.name||"TBD"}</span>
                <span style={{fontSize:".68rem",color:"var(--purple)",background:"rgba(168,85,247,.1)",padding:"2px 6px",borderRadius:3}}>{m.format}</span>
                {m.isComplete?<span style={{fontFamily:"Orbitron,sans-serif",fontSize:".78rem",color:"var(--green)",fontWeight:700}}>{m.scoreA}–{m.scoreB} ✓ {m.winner?.name}</span>:isHost&&m.teamA&&m.teamB?<button style={{fontFamily:"Rajdhani,sans-serif",fontWeight:700,fontSize:".75rem",textTransform:"uppercase",padding:"3px 10px",background:"rgba(0,212,255,.08)",border:"1px solid rgba(0,212,255,.3)",color:"var(--cyan)",borderRadius:5,cursor:"pointer"}} onClick={()=>openModal(m)}>Enter Score</button>:<span style={{color:"var(--muted)",fontSize:".78rem",fontStyle:"italic"}}>{m.teamA&&m.teamB?"Waiting for result...":"Waiting..."}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ResultsView({standings,upsets,teams,mvp,resetWinner,settings}){
  if(!standings)return<div><h1 style={C.h1}>Results</h1><p style={C.sub}>Tournament still in progress...</p></div>;
  const bu=upsets.length?upsets.reduce((a,b)=>(b.ws-b.ls)>(a.ws-a.ls)?b:a,upsets[0]):null;
  const podiumStyle=(h,bc,bb)=>({width:"100%",minWidth:130,height:h,borderRadius:"5px 5px 0 0",background:`linear-gradient(180deg,${bc},transparent)`,border:`1px solid ${bb}`});
  return(
    <div>
      <h1 style={C.h1}>🎉 Tournament Complete!</h1>
      <p style={C.sub}>GG WP everyone — what a show!</p>
      {resetWinner&&<div style={{...C.card,color:"var(--gold)",borderColor:"rgba(255,215,0,.3)",marginBottom:18,fontWeight:600,fontSize:".88rem"}}>🔄 After a bracket reset, <strong>{resetWinner.name}</strong> is the ultimate champion!</div>}
      <div style={{display:"flex",justifyContent:"center",alignItems:"flex-end",gap:10,marginBottom:24,flexWrap:"wrap"}}>
        {standings.second&&<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:7,textAlign:"center",minWidth:145}}><div style={{fontSize:"2rem"}}>🥈</div><div style={{fontFamily:"Orbitron,sans-serif",fontSize:".88rem",fontWeight:700}}>{standings.second.name}</div><div style={{fontSize:".76rem",color:"var(--muted)",marginBottom:3}}>{standings.second.players.map(p=>p.name).join(" & ")}</div><div style={podiumStyle(58,"rgba(192,192,192,.25)","rgba(192,192,192,.25)")}/></div>}
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:7,textAlign:"center",minWidth:145}}><div style={{fontSize:"2rem"}}>🏆</div><div style={{fontFamily:"Orbitron,sans-serif",fontSize:".88rem",fontWeight:700,color:"var(--gold)"}}>{standings.first?.name}</div><div style={{fontSize:".76rem",color:"var(--muted)",marginBottom:3}}>{standings.first?.players.map(p=>p.name).join(" & ")}</div><div style={podiumStyle(80,"rgba(255,215,0,.35)","rgba(255,215,0,.4)")}/></div>
        {standings.third&&<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:7,textAlign:"center",minWidth:145}}><div style={{fontSize:"2rem"}}>🥉</div><div style={{fontFamily:"Orbitron,sans-serif",fontSize:".88rem",fontWeight:700}}>{standings.third.name}</div><div style={{fontSize:".76rem",color:"var(--muted)",marginBottom:3}}>{standings.third.players.map(p=>p.name).join(" & ")}</div><div style={podiumStyle(42,"rgba(205,127,50,.2)","rgba(205,127,50,.25)")}/></div>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:12,marginBottom:18}}>
        {mvp&&<div style={C.card}><div style={{fontFamily:"Orbitron,sans-serif",fontSize:".63rem",color:"var(--cyan)",letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:7}}>⚡ MVP Team</div><div style={{fontFamily:"Orbitron,sans-serif",fontSize:"1.2rem",fontWeight:700,color:"var(--gold)",marginBottom:5}}>{mvp.team?.name}</div><div style={{fontSize:".78rem",color:"var(--muted)"}}>{mvp.wins} match wins · {mvp.team?.players.map(p=>p.name).join(" & ")}</div></div>}
        {bu&&<div style={C.card}><div style={{fontFamily:"Orbitron,sans-serif",fontSize:".63rem",color:"var(--cyan)",letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:7}}>🚨 Biggest Upset</div><div style={{fontFamily:"Orbitron,sans-serif",fontSize:"1.2rem",fontWeight:700,color:"var(--gold)",marginBottom:5}}>{bu.w}</div><div style={{fontSize:".78rem",color:"var(--muted)"}}>def. {bu.l} (gap +{bu.ws-bu.ls}) in {bu.round}</div></div>}
        <div style={C.card}><div style={{fontFamily:"Orbitron,sans-serif",fontSize:".63rem",color:"var(--cyan)",letterSpacing:"1.5px",textTransform:"uppercase",marginBottom:7}}>📋 Format</div><div style={{fontFamily:"Orbitron,sans-serif",fontSize:"1.2rem",fontWeight:700,color:"var(--gold)",marginBottom:5}}>{settings.gameMode}</div><div style={{fontSize:".78rem",color:"var(--muted)"}}>{settings.bracketType==="DE"?"Double Elimination":"Single Elimination"}</div></div>
      </div>
      <div style={C.card}>
        <div style={C.ctitle}>📊 Final Standings</div>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:".84rem"}}>
          <thead><tr>{["Seed","Team","Players"].map(h=><th key={h} style={{textAlign:"left",fontSize:".65rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".5px",color:"var(--muted)",padding:"0 9px 9px 0",borderBottom:"1px solid var(--border)"}}>{h}</th>)}</tr></thead>
          <tbody>{teams.map(t=>{const pl=t.id===standings.first?.id?1:t.id===standings.second?.id?2:t.id===standings.third?.id?3:null;return(<tr key={t.id} style={pl===1?{background:"rgba(255,215,0,.04)"}:pl===2?{background:"rgba(192,192,192,.03)"}:pl===3?{background:"rgba(205,127,50,.03)"}:{}}><td style={{padding:"9px 9px 9px 0",borderBottom:"1px solid rgba(255,255,255,.04)"}}>{pl===1?"🏆":pl===2?"🥈":pl===3?"🥉":""}#{t.seed}</td><td style={{padding:"9px 9px 9px 0",borderBottom:"1px solid rgba(255,255,255,.04)"}}><strong>{t.name}</strong></td><td style={{padding:"9px 9px 9px 0",borderBottom:"1px solid rgba(255,255,255,.04)"}}>{t.players.map(p=><span key={p.id} style={{display:"inline-flex",alignItems:"center",gap:4,marginRight:9,fontSize:".78rem"}}><span style={{color:rankColor(p.rank)}}>{p.rank}</span> {p.name}</span>)}</td></tr>);})}</tbody>
        </table>
      </div>
    </div>
  );
}

const CSS=`
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=Rajdhani:wght@400;500;600;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{--bg:#05080f;--surf:#0b1120;--card:#101828;--border:rgba(0,210,255,0.13);--cyan:#00d4ff;--orange:#ff6b35;--gold:#ffd700;--green:#00ff88;--red:#ff4757;--purple:#a855f7;--text:#dde4f0;--muted:#5a6985;--wb:#00d4ff;--lb:#ff6b35;--gf:#ffd700;}
html{font-size:16px;}body{background:var(--bg);color:var(--text);font-family:"Rajdhani",sans-serif;}
select option{background:#101828;}a{text-decoration:none;color:inherit;}
`;
