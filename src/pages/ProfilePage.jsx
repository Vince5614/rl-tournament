import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUser, useClerk } from '@clerk/clerk-react';
import { supabase } from '../lib/supabase.js';

/* ── Stat helpers ─────────────────────────────────────────────── */
function calcStats(allTournaments, userId) {
  let matchWins = 0, matchLosses = 0, firstPlace = 0, topThree = 0, played = 0;
  const history = [];

  for (const t of allTournaments) {
    const playerEntry = (t.players || []).find(p => p.user_id === userId);
    if (!playerEntry) continue;
    played++;

    // Find the team this player was on
    const team = (t.teams || []).find(tm =>
      tm.players?.some(p => p.user_id === userId)
    );

    let placement = null;

    if (team && t.bracket) {
      // Count match wins/losses for this team
      for (const m of Object.values(t.bracket.matches || {})) {
        if (!m.isComplete || m.isBye) continue;
        if (m.winner?.id === team.id) matchWins++;
        else if (m.loser?.id === team.id) matchLosses++;
      }

      // Find placement from Grand Final
      const gfId = Object.keys(t.bracket.flow || {}).find(id =>
        !t.bracket.flow[id].w && !t.bracket.flow[id].l
      );
      if (gfId) {
        const gf = t.bracket.matches[gfId];
        if (gf?.isComplete) {
          const winner = t.reset_winner || gf.winner;
          if (winner?.id === team.id) { placement = 1; firstPlace++; topThree++; }
          else {
            // Check if they were LB finalist (3rd) — lost in LB final before GF
            const lbFinalId = t.bracket.bracketSize <= 4 ? 'M5' : 'M13';
            const lbFinal = t.bracket.matches[lbFinalId];
            if (lbFinal?.loser?.id === team.id) { placement = 3; topThree++; }
            else { placement = 2; topThree++; }
          }
        }
      }
    }

    history.push({ code: t.code, name: t.name, phase: t.phase, placement,
      host_name: t.host_name, created_at: t.created_at });
  }

  const totalMatches = matchWins + matchLosses;
  const winRate = totalMatches > 0 ? Math.round((matchWins / totalMatches) * 100) : null;
  return { played, matchWins, matchLosses, winRate, firstPlace, topThree, history };
}

const TWITCH_SVG = <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/></svg>;
const YT_SVG    = <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/></svg>;

export default function ProfilePage() {
  const { isSignedIn, user } = useUser();
  const { signOut } = useClerk();
  const navigate = useNavigate();

  const [hosted,        setHosted]        = useState([]);
  const [stats,         setStats]         = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting,      setDeleting]      = useState(false);

  // Socials stored in localStorage per user
  const [twitch,  setTwitch]  = useState('');
  const [youtube, setYoutube] = useState('');
  const [editingSocials, setEditingSocials] = useState(false);
  const [socialDraft, setSocialDraft] = useState({ twitch:'', youtube:'' });

  useEffect(() => {
    if (!isSignedIn) { navigate('/'); return; }
    // Load saved socials
    const saved = JSON.parse(localStorage.getItem(`socials_${user.id}`) || '{}');
    setTwitch(saved.twitch || ''); setYoutube(saved.youtube || '');

    async function load() {
      const { data: h } = await supabase
        .from('tournaments')
        .select('code,name,phase,created_at,players,settings')
        .eq('host_id', user.id)
        .order('created_at', { ascending: false });

      // Fetch full data for player-joined tournaments for stat calc
      const { data: all } = await supabase
        .from('tournaments')
        .select('code,name,phase,created_at,host_name,players,teams,bracket,reset_winner')
        .neq('host_id', user.id)
        .order('created_at', { ascending: false });

      const joinedFull = (all || []).filter(t =>
        Array.isArray(t.players) && t.players.some(p => p.user_id === user.id)
      );

      setHosted(h || []);
      setStats(calcStats(joinedFull, user.id));
      setLoading(false);
    }
    load();
  }, [isSignedIn, user]);

  function saveSocials() {
    const s = { twitch: socialDraft.twitch.trim(), youtube: socialDraft.youtube.trim() };
    localStorage.setItem(`socials_${user.id}`, JSON.stringify(s));
    setTwitch(s.twitch); setYoutube(s.youtube);
    setEditingSocials(false);
  }

  const phaseLabel = p => ({ signup:'Sign-Ups Open', teams:'Teams Set', bracket:'Live', results:'Complete', ended:'Ended' }[p] || p);
  const phaseColor = p => ({ signup:'#00d4ff', teams:'#a855f7', bracket:'#00ff88', results:'#ffd700', ended:'#5a6985' }[p] || '#5a6985');
  const placementLabel = n => n===1?'🥇 1st':n===2?'🥈 2nd':n===3?'🥉 3rd':null;
  const placementColor = n => n===1?'#ffd700':n===2?'#c0c0c0':n===3?'#cd7f32':'#5a6985';

  async function deleteTournament(code) {
    setDeleting(true);
    await supabase.from('tournaments').delete().eq('code', code);
    setHosted(prev => prev.filter(t => t.code !== code));
    setConfirmDelete(null); setDeleting(false);
  }
  async function endTournament(code) {
    await supabase.from('tournaments').update({ phase: 'ended' }).eq('code', code);
    setHosted(prev => prev.map(t => t.code === code ? { ...t, phase: 'ended' } : t));
    setConfirmDelete(null);
  }
  function handleSignOut() { signOut(); navigate('/'); }

  return (
    <>
      <style>{CSS}</style>
      <div className="prof">
        <nav className="prof-nav">
          <Link to="/" className="prof-logo">🚀 RL Tournament</Link>
          <button className="prof-signout" onClick={handleSignOut}>Sign Out</button>
        </nav>

        <div className="prof-content">

          {/* ── Header card ── */}
          <div className="prof-header">
            <div className="prof-avatar">
              {user?.imageUrl
                ? <img src={user.imageUrl} alt="avatar" style={{width:'100%',height:'100%',borderRadius:'50%',objectFit:'cover'}}/>
                : <span>{(user?.fullName||user?.username||'?')[0].toUpperCase()}</span>}
            </div>
            <div className="prof-info" style={{flex:1}}>
              <h1 className="prof-name">{user?.fullName || user?.username}</h1>
              <p className="prof-email">{user?.primaryEmailAddress?.emailAddress}</p>
              {/* Socials display */}
              <div style={{display:'flex',alignItems:'center',gap:8,marginTop:6,flexWrap:'wrap'}}>
                {twitch && <a href={twitch.startsWith('http')?twitch:'https://'+twitch} target="_blank" rel="noopener noreferrer" className="prof-social-link prof-twitch">{TWITCH_SVG} {twitch.replace(/https?:\/\/(www\.)?twitch\.tv\//,'')}</a>}
                {youtube && <a href={youtube.startsWith('http')?youtube:'https://'+youtube} target="_blank" rel="noopener noreferrer" className="prof-social-link prof-youtube">{YT_SVG} {youtube.replace(/https?:\/\/(www\.)?youtube\.com\/@?/,'')}</a>}
                <button className="prof-social-edit" onClick={()=>{setSocialDraft({twitch,youtube});setEditingSocials(true);}}>
                  {twitch||youtube ? '✏️ Edit Socials' : '+ Add Socials'}
                </button>
              </div>
            </div>
            <Link to="/" className="prof-host-btn">+ Host New Tournament</Link>
          </div>

          {/* ── Stats bar ── */}
          {!loading && stats && stats.played > 0 && (
            <div className="prof-stats">
              {[
                { label:'Tournaments', value: stats.played, color:'#00d4ff' },
                { label:'Match Wins',  value: stats.matchWins, color:'#00ff88' },
                { label:'Match Losses',value: stats.matchLosses, color:'#ff4757' },
                { label:'Win Rate',    value: stats.winRate !== null ? stats.winRate+'%' : '—', color: stats.winRate >= 50 ? '#00ff88' : '#ff6b35' },
                { label:'🥇 1st Place', value: stats.firstPlace, color:'#ffd700' },
                { label:'Top 3',       value: stats.topThree, color:'#a855f7' },
              ].map(s => (
                <div key={s.label} className="prof-stat">
                  <span className="prof-stat-val" style={{color:s.color}}>{s.value}</span>
                  <span className="prof-stat-label">{s.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* ── Hosted Tournaments ── */}
          <div className="prof-section">
            <h2 className="prof-section-title">🏟️ Tournaments You Host</h2>
            {loading && <p className="prof-empty">Loading...</p>}
            {!loading && hosted.length === 0 && (
              <div className="prof-empty-box">
                <p>You haven't hosted any tournaments yet.</p>
                <Link to="/" className="prof-host-btn" style={{marginTop:14,display:'inline-block'}}>Host your first tournament →</Link>
              </div>
            )}
            <div className="prof-grid">
              {hosted.map(t => (
                <div key={t.code} className="prof-card-wrap">
                  <Link to={`/t/${t.code}`} className="prof-card">
                    <div className="prof-card-top">
                      <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                        <span className="prof-card-name">{t.name}</span>
                        <span className="role-badge host-badge">🏟️ HOST</span>
                      </div>
                      <span className="prof-card-status" style={{color:phaseColor(t.phase)}}>{phaseLabel(t.phase)}</span>
                    </div>
                    <div className="prof-card-bottom">
                      <span className="prof-card-code">#{t.code}</span>
                      <span className="prof-card-date">{new Date(t.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="prof-card-players">{(t.players||[]).length} player{(t.players||[]).length!==1?'s':''} registered</div>
                  </Link>
                  {t.phase !== 'ended' && (
                    <button className="end-btn" onClick={() => setConfirmDelete({code:t.code, name:t.name})}>✕ End Tournament</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ── Player History ── */}
          {!loading && stats && stats.history.length > 0 && (
            <div className="prof-section">
              <h2 className="prof-section-title">🎮 Tournament History</h2>
              <div className="prof-grid">
                {stats.history.map(t => (
                  <Link to={`/t/${t.code}`} key={t.code} className="prof-card">
                    <div className="prof-card-top">
                      <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                        <span className="prof-card-name">{t.name}</span>
                        <span className="role-badge player-badge">🎮 PLAYER</span>
                      </div>
                      <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:3}}>
                        <span className="prof-card-status" style={{color:phaseColor(t.phase)}}>{phaseLabel(t.phase)}</span>
                        {t.placement && <span style={{fontFamily:'Orbitron,sans-serif',fontSize:'.65rem',fontWeight:700,color:placementColor(t.placement)}}>{placementLabel(t.placement)}</span>}
                      </div>
                    </div>
                    <div className="prof-card-bottom">
                      <span className="prof-card-code">#{t.code}</span>
                      <span className="prof-card-date">Host: {t.host_name}</span>
                    </div>
                    <div className="prof-card-arrow">→</div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Edit Socials Modal ── */}
        {editingSocials && (
          <div className="confirm-overlay" onClick={e=>{if(e.target===e.currentTarget)setEditingSocials(false);}}>
            <div className="confirm-modal" style={{borderColor:'rgba(0,212,255,.25)'}}>
              <div style={{fontFamily:'Orbitron,sans-serif',fontSize:'.6rem',color:'#00d4ff',letterSpacing:'1.5px',textTransform:'uppercase',marginBottom:6}}>Your Socials</div>
              <h2 style={{fontFamily:'Orbitron,sans-serif',fontSize:'1.1rem',fontWeight:700,marginBottom:6}}>📡 Add Your Channels</h2>
              <p className="confirm-desc" style={{marginBottom:20}}>These will show on your profile so others can find your streams.</p>

              <label className="social-label" style={{color:'#bf94ff'}}>{TWITCH_SVG} Twitch URL</label>
              <input className="social-input" placeholder="https://twitch.tv/yourname"
                value={socialDraft.twitch} onChange={e=>setSocialDraft(d=>({...d,twitch:e.target.value}))}/>

              <label className="social-label" style={{color:'#ff6b6b',marginTop:12}}>{YT_SVG} YouTube URL</label>
              <input className="social-input" placeholder="https://youtube.com/@yourname"
                value={socialDraft.youtube} onChange={e=>setSocialDraft(d=>({...d,youtube:e.target.value}))}/>

              <div className="confirm-btns" style={{marginTop:20}}>
                <button className="confirm-cancel" onClick={()=>setEditingSocials(false)}>Cancel</button>
                <button className="confirm-end" onClick={saveSocials}>Save Socials ✓</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Confirm End/Delete Modal ── */}
        {confirmDelete && (
          <div className="confirm-overlay" onClick={e=>{if(e.target===e.currentTarget)setConfirmDelete(null);}}>
            <div className="confirm-modal">
              <div className="confirm-icon">⚠️</div>
              <h2 className="confirm-title">End Tournament?</h2>
              <p className="confirm-desc">Are you sure you want to end <strong>{confirmDelete.name}</strong>? This will mark it as ended. You can still view it.</p>
              <p className="confirm-desc" style={{color:'#ff4757',marginTop:8}}>To fully delete it and remove all data, use the delete option below.</p>
              <div className="confirm-btns">
                <button className="confirm-cancel" onClick={()=>setConfirmDelete(null)}>Cancel</button>
                <button className="confirm-end" onClick={()=>endTournament(confirmDelete.code)}>Mark as Ended</button>
                <button className="confirm-delete" onClick={()=>deleteTournament(confirmDelete.code)} disabled={deleting}>
                  {deleting ? 'Deleting...' : '🗑 Delete Permanently'}
                </button>
              </div>
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
:root{--bg:#05080f;--card:#101828;--surf:#0b1120;--border:rgba(0,210,255,0.13);--cyan:#00d4ff;--purple:#a855f7;--text:#dde4f0;--muted:#5a6985;}
body{background:var(--bg);color:var(--text);font-family:"Rajdhani",sans-serif;}
a{color:inherit;text-decoration:none;}

.prof{min-height:100vh;background:var(--bg);background-image:radial-gradient(ellipse 80% 50% at 10% -10%,rgba(0,212,255,.06),transparent);}
.prof-nav{display:flex;align-items:center;justify-content:space-between;padding:14px 28px;border-bottom:1px solid var(--border);background:rgba(5,8,15,.85);backdrop-filter:blur(12px);}
.prof-logo{font-family:"Orbitron",sans-serif;font-size:.95rem;font-weight:900;color:var(--cyan);letter-spacing:1px;}
.prof-signout{font-family:"Rajdhani",sans-serif;font-weight:700;font-size:.85rem;text-transform:uppercase;padding:7px 14px;border-radius:7px;border:1px solid var(--border);background:transparent;color:var(--muted);cursor:pointer;}

.prof-content{max-width:900px;margin:0 auto;padding:36px 24px 60px;}
.prof-header{display:flex;align-items:flex-start;gap:20px;margin-bottom:24px;padding:24px;background:var(--card);border:1px solid var(--border);border-radius:16px;flex-wrap:wrap;}
.prof-avatar{width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,var(--cyan),var(--purple));display:flex;align-items:center;justify-content:center;font-family:"Orbitron",sans-serif;font-size:1.6rem;font-weight:900;color:#000;flex-shrink:0;overflow:hidden;}
.prof-name{font-family:"Orbitron",sans-serif;font-size:1.2rem;font-weight:700;margin-bottom:4px;}
.prof-email{color:var(--muted);font-size:.85rem;}
.prof-host-btn{display:inline-flex;align-items:center;font-family:"Rajdhani",sans-serif;font-weight:800;font-size:.85rem;text-transform:uppercase;letter-spacing:.5px;padding:8px 16px;border-radius:8px;background:linear-gradient(135deg,var(--cyan),#008ab8);color:#000;cursor:pointer;border:none;white-space:nowrap;align-self:flex-start;}

.prof-social-link{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:6px;font-weight:700;font-size:.78rem;text-decoration:none;transition:filter .15s;}
.prof-social-link:hover{filter:brightness(1.2);}
.prof-twitch{background:rgba(145,70,255,.15);border:1px solid rgba(145,70,255,.4);color:#bf94ff;}
.prof-youtube{background:rgba(255,0,0,.12);border:1px solid rgba(255,0,0,.35);color:#ff6b6b;}
.prof-social-edit{font-family:"Rajdhani",sans-serif;font-weight:700;font-size:.78rem;text-transform:uppercase;padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--muted);cursor:pointer;}
.prof-social-edit:hover{color:var(--text);border-color:rgba(0,212,255,.3);}

.prof-stats{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:24px;}
.prof-stat{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:12px 18px;display:flex;flex-direction:column;align-items:center;min-width:80px;flex:1;}
.prof-stat-val{font-family:"Orbitron",sans-serif;font-size:1.4rem;font-weight:900;line-height:1;}
.prof-stat-label{font-size:.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-top:4px;text-align:center;}

.prof-section{margin-bottom:32px;}
.prof-section-title{font-family:"Orbitron",sans-serif;font-size:.85rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--cyan);margin-bottom:16px;}
.prof-empty{color:var(--muted);font-size:.9rem;}
.prof-empty-box{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:28px;text-align:center;color:var(--muted);}

.prof-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;}
.prof-card-wrap{display:flex;flex-direction:column;}
.prof-card{background:var(--card);border:1px solid var(--border);border-radius:12px 12px 0 0;padding:18px;cursor:pointer;transition:all .18s;position:relative;display:block;}
.prof-card-wrap .prof-card:only-child{border-radius:12px;}
.prof-card:hover{border-color:rgba(0,212,255,.3);transform:translateY(-1px);}
.prof-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px;}
.prof-card-name{font-family:"Orbitron",sans-serif;font-size:.8rem;font-weight:700;line-height:1.3;}
.prof-card-status{font-size:.72rem;font-weight:700;white-space:nowrap;}
.prof-card-bottom{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;}
.prof-card-code{font-family:"Orbitron",sans-serif;font-size:.65rem;color:var(--muted);letter-spacing:2px;}
.prof-card-date{font-size:.75rem;color:var(--muted);}
.prof-card-players{font-size:.75rem;color:var(--muted);}
.prof-card-arrow{position:absolute;bottom:16px;right:16px;color:var(--cyan);font-size:.9rem;opacity:.6;}

.role-badge{font-family:"Orbitron",sans-serif;font-size:.55rem;font-weight:700;letter-spacing:1px;padding:2px 7px;border-radius:4px;}
.host-badge{background:rgba(255,107,53,.12);color:#ff6b35;border:1px solid rgba(255,107,53,.3);}
.player-badge{background:rgba(0,212,255,.1);color:var(--cyan);border:1px solid rgba(0,212,255,.25);}

.end-btn{width:100%;padding:9px;font-family:"Rajdhani",sans-serif;font-weight:700;font-size:.8rem;text-transform:uppercase;letter-spacing:.5px;background:rgba(255,71,87,.07);border:1px solid rgba(255,71,87,.25);border-top:none;border-radius:0 0 12px 12px;color:#ff4757;cursor:pointer;transition:all .15s;}
.end-btn:hover{background:rgba(255,71,87,.15);}

.social-label{display:flex;align-items:center;gap:6px;font-family:"Rajdhani",sans-serif;font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px;}
.social-input{width:100%;background:#0b1120;border:1px solid rgba(0,210,255,.13);border-radius:7px;padding:9px 13px;color:#dde4f0;font-family:"Rajdhani",sans-serif;font-size:.9rem;margin-bottom:4px;}
.social-input:focus{outline:none;border-color:#00d4ff;box-shadow:0 0 0 2px rgba(0,212,255,.1);}

.confirm-overlay{position:fixed;inset:0;background:rgba(0,0,0,.8);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:600;padding:18px;}
.confirm-modal{background:var(--card);border:1px solid rgba(255,71,87,.3);border-radius:16px;padding:32px;max-width:440px;width:100%;text-align:center;box-shadow:0 24px 80px rgba(0,0,0,.6);}
.confirm-icon{font-size:2.5rem;margin-bottom:12px;}
.confirm-title{font-family:"Orbitron",sans-serif;font-size:1.2rem;font-weight:700;margin-bottom:12px;color:#ff4757;}
.confirm-desc{color:var(--muted);font-size:.85rem;line-height:1.7;}
.confirm-btns{display:flex;flex-direction:column;gap:9px;margin-top:24px;}
.confirm-cancel{padding:11px;font-family:"Rajdhani",sans-serif;font-weight:700;font-size:.9rem;text-transform:uppercase;border-radius:9px;border:1px solid var(--border);background:transparent;color:var(--text);cursor:pointer;}
.confirm-end{padding:11px;font-family:"Rajdhani",sans-serif;font-weight:800;font-size:.9rem;text-transform:uppercase;border-radius:9px;border:none;background:linear-gradient(135deg,var(--cyan),#008ab8);color:#000;cursor:pointer;}
.confirm-delete{padding:11px;font-family:"Rajdhani",sans-serif;font-weight:800;font-size:.9rem;text-transform:uppercase;border-radius:9px;background:rgba(255,71,87,.15);border:1px solid rgba(255,71,87,.4);color:#ff4757;cursor:pointer;}
.confirm-delete:disabled{opacity:.5;cursor:not-allowed;}

@media(max-width:600px){
  .prof-nav{padding:12px 16px;}
  .prof-content{padding:20px 14px 40px;}
  .prof-header{gap:14px;}
  .prof-stats{gap:7px;}
  .prof-stat{min-width:60px;padding:10px 10px;}
  .prof-stat-val{font-size:1.1rem;}
  .prof-grid{grid-template-columns:1fr;}
}
`;
