import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useUser, useClerk } from '@clerk/clerk-react';
import { supabase } from '../lib/supabase.js';

const DEFAULT_SETTINGS = {
  gameMode:"2v2", earlyFormat:"BO3", finalsFormat:"BO5",
  finalsFrom:"SF", bracketType:"DE", maxTeams:8,
  deadline:"", goldenGoal:true, teamFormation:"snake", isPublic:false, hostTwitch:"", hostYoutube:"",
};

export default function Landing() {
  const { isSignedIn, user } = useUser();
  const { openSignIn } = useClerk();
  const navigate = useNavigate();

  const [showCreate,   setShowCreate]   = useState(false);
  const [showJoin,     setShowJoin]     = useState(false);
  const [tName,        setTName]        = useState('');
  const [joinCode,     setJoinCode]     = useState('');
  const [creating,     setCreating]     = useState(false);
  const [joining,      setJoining]      = useState(false);
  const [error,        setError]        = useState('');
  const [pending,      setPending]      = useState(null);
  const [publicTourneys, setPublicTourneys] = useState([]);
  const [loadingPublic,  setLoadingPublic]  = useState(true);

  useEffect(() => {
    async function fetchPublic() {
      const { data } = await supabase
        .from('tournaments')
        .select('code,name,host_name,phase,players,settings,created_at')
        .neq('phase','results')
        .order('created_at', { ascending: false })
        .limit(50);
      const pub = (data || []).filter(t => t.settings?.isPublic === true);
      setPublicTourneys(pub);
      setLoadingPublic(false);
    }
    fetchPublic();
  }, []);

  useEffect(() => {
    if (isSignedIn && pending === 'host') { setPending(null); setShowCreate(true); }
    if (isSignedIn && pending === 'join') { setPending(null); setShowJoin(true); }
  }, [isSignedIn, pending]);

  function handleHost() {
    setError('');
    if (!isSignedIn) { setPending('host'); openSignIn(); return; }
    setShowCreate(true);
  }

  function handleJoin() {
    setError('');
    if (!isSignedIn) { setPending('join'); openSignIn(); return; }
    setShowJoin(true);
  }

  async function createTournament() {
    if (!tName.trim()) return;
    setCreating(true); setError('');
    const code = Math.random().toString(36).substr(2, 6).toUpperCase();
    const spectCode = 'RL-' + Math.random().toString(36).substr(2, 6).toUpperCase();
    const { error: err } = await supabase.from('tournaments').insert({
      code, name: tName.trim(),
      host_id: user.id,
      host_name: user.fullName || user.username || 'Host',
      settings: DEFAULT_SETTINGS,
      phase: 'signup', players: [], teams: [], wildcards: [], upsets: [],
      spect_code: spectCode, featured: null, bracket: null, reset_winner: null,
    });
    if (err) { setCreating(false); setError('Failed to create. Try again.'); return; }
    navigate(`/t/${code}`);
  }

  async function joinTournament() {
    const code = joinCode.trim().toUpperCase();
    if (code.length < 6) return;
    setJoining(true); setError('');
    const { data, error: err } = await supabase.from('tournaments').select('code').eq('code', code).single();
    if (err || !data) { setJoining(false); setError('Tournament not found. Check the code and try again.'); return; }
    navigate(`/t/${code}`);
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="land">
        {/* NAV */}
        <nav className="land-nav">
          <div className="land-logo">🚀 RL Tournament</div>
          <div className="land-nav-right">
            {isSignedIn ? (
              <>
                <span className="land-user">👋 {user.fullName || user.username}</span>
                <Link to="/profile" className="land-profile-btn">My Profile</Link>
              </>
            ) : (
              <button className="land-signin-btn" onClick={() => openSignIn()}>Sign In</button>
            )}
          </div>
        </nav>

        {/* HERO */}
        <div className="land-hero">
          <div className="land-hero-inner">
            <div className="land-badge">🏆 Community Tournament Tool</div>
            <h1 className="land-title">Run Your Rocket League<br/>Tournament</h1>
            <p className="land-tagline">Auto-balanced teams · Double elimination bracket · Live spectator mode<br/>Built for streamers and community organizers.</p>

            <div className="land-cards">
              <div className="land-card host-card">
                <div className="land-card-icon">🏟️</div>
                <h2 className="land-card-title">Host a Tournament</h2>
                <p className="land-card-desc">Create and manage your own tournament. Invite players, auto-balance teams, run the live bracket from your stream.</p>
                <button className="land-card-btn host-btn" onClick={handleHost}>Get Started →</button>
              </div>

              <div className="land-divider">OR</div>

              <div className="land-card join-card">
                <div className="land-card-icon">🎮</div>
                <h2 className="land-card-title">Join a Tournament</h2>
                <p className="land-card-desc">Have a tournament code? Enter it to view the live bracket, spectate featured matches and follow the action.</p>
                <button className="land-card-btn join-btn" onClick={handleJoin}>Enter Code →</button>
              </div>
            </div>

            {error && <div className="land-error">{error}</div>}
          </div>
        </div>

        {/* LIVE PUBLIC TOURNAMENTS */}
        {(loadingPublic || publicTourneys.length > 0) && (
          <div className="land-public">
            <div className="land-public-header">
              <span className="land-public-title">🌐 Live Tournaments</span>
              <span className="land-public-sub">Public tournaments open to join right now</span>
            </div>
            {loadingPublic ? (
              <div className="land-public-loading">Loading…</div>
            ) : (
              <div className="land-public-list">
                {publicTourneys.map(t => {
                  const PHASE_LABEL = { signup:'🟢 Sign-Ups Open', teams:'🔵 Teams Set', bracket:'🔴 Live Bracket', results:'✅ Ended' };
                  return (
                    <div key={t.code} className="land-public-card" onClick={() => navigate(`/t/${t.code}`)}>
                      <div className="land-public-card-top">
                        <span className="land-public-name">{t.name}</span>
                        <span className="land-public-phase">{PHASE_LABEL[t.phase] || t.phase}</span>
                      </div>
                      <div className="land-public-card-meta">
                        <span>Host: <strong>{t.host_name}</strong></span>
                        <span>{t.players?.length || 0} players</span>
                        <span className="land-public-code">{t.code}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* FEATURES */}
        <div className="land-features">
          {[
            {icon:"⚡",title:"Snake Draft Balancing",desc:"Automatically pairs teams by rank — no stacked teams, fair competition guaranteed."},
            {icon:"🔄",title:"Double Elimination",desc:"One loss doesn't knock you out. Everyone gets a second chance in the Losers Bracket."},
            {icon:"📡",title:"Live Updates",desc:"Bracket updates in real-time for all spectators and players the moment a score is entered."},
            {icon:"🎯",title:"Featured Match",desc:"Auto-selects the most exciting match each round for spectators to watch."},
          ].map(f=>(
            <div key={f.title} className="land-feature">
              <span className="land-feature-icon">{f.icon}</span>
              <div>
                <strong>{f.title}</strong>
                <p>{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* FOOTER */}
        <div className="land-footer">
          Built by <a href="https://twitch.tv/chilly7383" target="_blank" rel="noopener noreferrer">chilly7383</a> · Free to use · No ads
        </div>

        {/* CREATE MODAL */}
        {showCreate && (
          <div className="land-overlay" onClick={e=>{if(e.target===e.currentTarget){setShowCreate(false);setTName('');setError('');}}}>
            <div className="land-modal">
              <button className="land-modal-x" onClick={()=>{setShowCreate(false);setTName('');setError('');}}>✕</button>
              <div className="land-modal-tag">NEW TOURNAMENT</div>
              <h2 className="land-modal-title">Name Your Tournament</h2>
              <p className="land-modal-sub">Give it a memorable name — you can always update it later.</p>
              <input className="land-modal-input" placeholder="e.g. Chilly's Friday Night Cup"
                value={tName} onChange={e=>setTName(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&createTournament()} autoFocus/>
              {error && <div className="land-modal-error">{error}</div>}
              <button className="land-modal-btn" onClick={createTournament} disabled={creating||!tName.trim()}>
                {creating ? 'Creating...' : 'Create Tournament →'}
              </button>
            </div>
          </div>
        )}

        {/* JOIN MODAL */}
        {showJoin && (
          <div className="land-overlay" onClick={e=>{if(e.target===e.currentTarget){setShowJoin(false);setJoinCode('');setError('');}}}>
            <div className="land-modal">
              <button className="land-modal-x" onClick={()=>{setShowJoin(false);setJoinCode('');setError('');}}>✕</button>
              <div className="land-modal-tag">JOIN TOURNAMENT</div>
              <h2 className="land-modal-title">Enter Tournament Code</h2>
              <p className="land-modal-sub">Get the 6-character code from the host or stream chat.</p>
              <input className="land-modal-input code-inp" placeholder="e.g. K8X3PQ"
                value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={e=>e.key==='Enter'&&joinTournament()}
                maxLength={6} autoFocus/>
              {error && <div className="land-modal-error">{error}</div>}
              <button className="land-modal-btn" onClick={joinTournament} disabled={joining||joinCode.length<6}>
                {joining ? 'Searching...' : 'Go to Tournament →'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Rajdhani:wght@400;600;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{--bg:#05080f;--card:#101828;--surf:#0b1120;--border:rgba(0,210,255,0.13);--cyan:#00d4ff;--orange:#ff6b35;--gold:#ffd700;--green:#00ff88;--purple:#a855f7;--text:#dde4f0;--muted:#5a6985;}
body{background:var(--bg);color:var(--text);font-family:"Rajdhani",sans-serif;}
a{color:inherit;text-decoration:none;}

.land{min-height:100vh;background:var(--bg);background-image:radial-gradient(ellipse 80% 60% at 50% -20%,rgba(0,212,255,.09),transparent),radial-gradient(ellipse 60% 60% at 90% 110%,rgba(168,85,247,.08),transparent);}

.land-nav{display:flex;align-items:center;justify-content:space-between;padding:16px 32px;border-bottom:1px solid var(--border);background:rgba(5,8,15,.8);backdrop-filter:blur(12px);position:sticky;top:0;z-index:100;}
.land-logo{font-family:"Orbitron",sans-serif;font-size:1rem;font-weight:900;color:var(--cyan);letter-spacing:1px;}
.land-nav-right{display:flex;align-items:center;gap:14px;}
.land-user{font-size:.88rem;color:var(--muted);}
.land-profile-btn{font-family:"Orbitron",sans-serif;font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;padding:7px 14px;border-radius:8px;border:1px solid rgba(0,212,255,.3);background:rgba(0,212,255,.07);color:var(--cyan);cursor:pointer;}
.land-signin-btn{font-family:"Orbitron",sans-serif;font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;padding:7px 14px;border-radius:8px;border:1px solid var(--border);background:transparent;color:var(--text);cursor:pointer;}

.land-hero{padding:80px 24px 60px;display:flex;justify-content:center;}
.land-hero-inner{max-width:900px;width:100%;text-align:center;}
.land-badge{display:inline-block;font-family:"Orbitron",sans-serif;font-size:.65rem;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--gold);background:rgba(255,215,0,.08);border:1px solid rgba(255,215,0,.25);border-radius:20px;padding:5px 16px;margin-bottom:24px;}
.land-title{font-family:"Orbitron",sans-serif;font-size:clamp(2rem,5vw,3.2rem);font-weight:900;line-height:1.15;margin-bottom:20px;background:linear-gradient(135deg,#fff 40%,var(--cyan));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
.land-tagline{color:var(--muted);font-size:1rem;line-height:1.8;margin-bottom:48px;}

.land-cards{display:flex;align-items:stretch;gap:0;justify-content:center;flex-wrap:wrap;gap:20px;margin-bottom:24px;}
.land-card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:32px 28px;max-width:340px;width:100%;display:flex;flex-direction:column;align-items:center;text-align:center;transition:transform .2s,box-shadow .2s;}
.land-card:hover{transform:translateY(-4px);}
.host-card{border-color:rgba(0,212,255,.25);box-shadow:0 0 40px rgba(0,212,255,.06);}
.host-card:hover{box-shadow:0 8px 40px rgba(0,212,255,.15);}
.join-card{border-color:rgba(255,107,53,.25);box-shadow:0 0 40px rgba(255,107,53,.06);}
.join-card:hover{box-shadow:0 8px 40px rgba(255,107,53,.15);}
.land-card-icon{font-size:2.4rem;margin-bottom:16px;}
.land-card-title{font-family:"Orbitron",sans-serif;font-size:1rem;font-weight:700;margin-bottom:12px;}
.land-card-desc{color:var(--muted);font-size:.88rem;line-height:1.7;flex:1;margin-bottom:24px;}
.land-card-btn{font-family:"Rajdhani",sans-serif;font-weight:800;font-size:.9rem;text-transform:uppercase;letter-spacing:.5px;padding:11px 24px;border-radius:9px;border:none;cursor:pointer;width:100%;transition:all .18s;}
.host-btn{background:linear-gradient(135deg,var(--cyan),#008ab8);color:#000;}
.host-btn:hover{filter:brightness(1.1);transform:translateY(-1px);box-shadow:0 6px 24px rgba(0,212,255,.35);}
.join-btn{background:linear-gradient(135deg,var(--orange),#cc4400);color:#fff;}
.join-btn:hover{filter:brightness(1.1);transform:translateY(-1px);box-shadow:0 6px 24px rgba(255,107,53,.35);}
.land-divider{display:flex;align-items:center;color:var(--muted);font-size:.8rem;font-weight:700;letter-spacing:1px;}
.land-error{color:#ff4757;font-size:.85rem;margin-top:8px;}

.land-features{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;max-width:900px;margin:0 auto;padding:0 24px 60px;}
.land-feature{display:flex;gap:14px;align-items:flex-start;background:var(--card);border:1px solid var(--border);border-radius:12px;padding:18px;}
.land-feature-icon{font-size:1.4rem;flex-shrink:0;}
.land-feature strong{display:block;font-size:.88rem;margin-bottom:4px;}
.land-feature p{color:var(--muted);font-size:.8rem;line-height:1.6;}

.land-footer{text-align:center;padding:20px;color:var(--muted);font-size:.8rem;border-top:1px solid var(--border);}
.land-footer a{color:var(--purple);}

.land-overlay{position:fixed;inset:0;background:rgba(0,0,0,.8);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:500;padding:18px;}
.land-modal{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:32px;max-width:440px;width:100%;position:relative;box-shadow:0 24px 80px rgba(0,0,0,.6);}
.land-modal-x{position:absolute;top:14px;right:14px;background:none;border:none;color:var(--muted);font-size:1rem;cursor:pointer;}
.land-modal-tag{font-family:"Orbitron",sans-serif;font-size:.6rem;color:var(--cyan);letter-spacing:2px;text-transform:uppercase;margin-bottom:8px;}
.land-modal-title{font-family:"Orbitron",sans-serif;font-size:1.2rem;font-weight:700;margin-bottom:8px;}
.land-modal-sub{color:var(--muted);font-size:.85rem;margin-bottom:20px;line-height:1.6;}
.land-modal-input{background:var(--surf);border:1px solid var(--border);border-radius:8px;padding:11px 14px;color:var(--text);font-family:"Rajdhani",sans-serif;font-size:1rem;width:100%;margin-bottom:12px;}
.land-modal-input:focus{outline:none;border-color:var(--cyan);box-shadow:0 0 0 3px rgba(0,212,255,.1);}
.code-inp{font-family:"Orbitron",sans-serif;font-size:1.3rem;letter-spacing:4px;text-align:center;}
.land-modal-error{color:#ff4757;font-size:.82rem;margin-bottom:10px;}
.land-modal-btn{font-family:"Rajdhani",sans-serif;font-weight:800;font-size:.95rem;text-transform:uppercase;padding:12px 20px;border-radius:9px;border:none;cursor:pointer;background:linear-gradient(135deg,var(--cyan),#008ab8);color:#000;width:100%;transition:all .18s;}
.land-modal-btn:hover:not(:disabled){filter:brightness(1.1);}
.land-modal-btn:disabled{opacity:.5;cursor:not-allowed;}

.land-public{max-width:900px;margin:0 auto 48px;padding:0 24px;}
.land-public-header{display:flex;align-items:baseline;gap:12px;margin-bottom:14px;flex-wrap:wrap;}
.land-public-title{font-family:"Orbitron",sans-serif;font-size:.9rem;font-weight:900;color:var(--cyan);letter-spacing:1px;}
.land-public-sub{color:var(--muted);font-size:.82rem;}
.land-public-loading{color:var(--muted);font-size:.85rem;font-style:italic;padding:16px 0;}
.land-public-list{display:flex;flex-direction:column;gap:10px;}
.land-public-card{background:var(--card);border:1px solid var(--border);border-radius:11px;padding:14px 18px;cursor:pointer;transition:border-color .18s,box-shadow .18s;}
.land-public-card:hover{border-color:rgba(0,212,255,.4);box-shadow:0 4px 24px rgba(0,212,255,.08);}
.land-public-card-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px;flex-wrap:wrap;}
.land-public-name{font-family:"Orbitron",sans-serif;font-size:.82rem;font-weight:700;color:var(--text);}
.land-public-phase{font-size:.75rem;font-weight:600;color:var(--green);}
.land-public-card-meta{display:flex;gap:16px;font-size:.78rem;color:var(--muted);flex-wrap:wrap;}
.land-public-code{font-family:"Orbitron",sans-serif;font-size:.65rem;color:var(--cyan);letter-spacing:2px;background:rgba(0,212,255,.08);border:1px solid rgba(0,212,255,.2);border-radius:4px;padding:1px 7px;}

@media(max-width:600px){
  .land-nav{padding:12px 16px;}
  .land-hero{padding:48px 16px 36px;}
  .land-title{font-size:1.7rem;}
  .land-tagline{font-size:.88rem;}
  .land-cards{flex-direction:column;align-items:center;}
  .land-card{max-width:100%;}
  .land-divider{transform:rotate(90deg);margin:4px 0;}
  .land-features{padding:0 16px 40px;grid-template-columns:1fr;}
  .land-public{padding:0 16px;}
  .land-modal{padding:22px 18px;}
}
`;
