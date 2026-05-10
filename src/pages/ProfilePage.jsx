import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUser, useClerk } from '@clerk/clerk-react';
import { supabase } from '../lib/supabase.js';

export default function ProfilePage() {
  const { isSignedIn, user } = useUser();
  const { signOut } = useClerk();
  const navigate = useNavigate();
  const [hosted,        setHosted]        = useState([]);
  const [joined,        setJoined]        = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(null); // tournament code to delete
  const [deleting,      setDeleting]      = useState(false);

  useEffect(() => {
    if (!isSignedIn) { navigate('/'); return; }
    async function load() {
      // Tournaments the user hosts
      const { data: h } = await supabase
        .from('tournaments')
        .select('code,name,phase,created_at,players')
        .eq('host_id', user.id)
        .order('created_at', { ascending: false });

      // Tournaments the user joined as a player (has user_id in players array)
      const { data: all } = await supabase
        .from('tournaments')
        .select('code,name,phase,created_at,host_name,players')
        .neq('host_id', user.id)
        .order('created_at', { ascending: false });

      const hostedCodes = new Set((h||[]).map(t => t.code));
      const joinedList = (all||[]).filter(t =>
        Array.isArray(t.players) && t.players.some(p => p.user_id === user.id)
      );

      setHosted(h || []);
      setJoined(joinedList);
      setLoading(false);
    }
    load();
  }, [isSignedIn, user]);

  const phaseLabel = p => ({ signup:'Sign-Ups Open', teams:'Teams Set', bracket:'Live', results:'Complete', ended:'Ended' }[p] || p);
  const phaseColor = p => ({ signup:'#00d4ff', teams:'#a855f7', bracket:'#00ff88', results:'#ffd700', ended:'#5a6985' }[p] || '#5a6985');

  async function deleteTournament(code) {
    setDeleting(true);
    await supabase.from('tournaments').delete().eq('code', code);
    setHosted(prev => prev.filter(t => t.code !== code));
    setConfirmDelete(null);
    setDeleting(false);
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
          {/* Header */}
          <div className="prof-header">
            <div className="prof-avatar">
              {user?.imageUrl
                ? <img src={user.imageUrl} alt="avatar" style={{width:'100%',height:'100%',borderRadius:'50%',objectFit:'cover'}}/>
                : <span>{(user?.fullName||user?.username||'?')[0].toUpperCase()}</span>}
            </div>
            <div className="prof-info">
              <h1 className="prof-name">{user?.fullName || user?.username}</h1>
              <p className="prof-email">{user?.primaryEmailAddress?.emailAddress}</p>
              <Link to="/" className="prof-host-btn">+ Host New Tournament</Link>
            </div>
          </div>

          {/* Hosted Tournaments */}
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
                    <button className="end-btn" onClick={() => setConfirmDelete({code:t.code, name:t.name})}>
                      ✕ End Tournament
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Joined Tournaments */}
          {joined.length > 0 && (
            <div className="prof-section">
              <h2 className="prof-section-title">🎮 Tournaments You Joined</h2>
              <div className="prof-grid">
                {joined.map(t => (
                  <Link to={`/t/${t.code}`} key={t.code} className="prof-card">
                    <div className="prof-card-top">
                      <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                        <span className="prof-card-name">{t.name}</span>
                        <span className="role-badge player-badge">🎮 PLAYER</span>
                      </div>
                      <span className="prof-card-status" style={{color:phaseColor(t.phase)}}>{phaseLabel(t.phase)}</span>
                    </div>
                    <div className="prof-card-bottom">
                      <span className="prof-card-code">#{t.code}</span>
                      <span className="prof-card-date">Hosted by {t.host_name}</span>
                    </div>
                    <div className="prof-card-arrow">→</div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Confirm Delete Modal */}
        {confirmDelete && (
          <div className="confirm-overlay" onClick={e=>{if(e.target===e.currentTarget)setConfirmDelete(null);}}>
            <div className="confirm-modal">
              <div className="confirm-icon">⚠️</div>
              <h2 className="confirm-title">End Tournament?</h2>
              <p className="confirm-desc">Are you sure you want to end <strong>{confirmDelete.name}</strong>? This will mark it as ended and players won't be able to make changes. You can still view it.</p>
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
.prof-header{display:flex;align-items:center;gap:24px;margin-bottom:40px;padding:28px;background:var(--card);border:1px solid var(--border);border-radius:16px;flex-wrap:wrap;}
.prof-avatar{width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,var(--cyan),var(--purple));display:flex;align-items:center;justify-content:center;font-family:"Orbitron",sans-serif;font-size:1.6rem;font-weight:900;color:#000;flex-shrink:0;overflow:hidden;}
.prof-name{font-family:"Orbitron",sans-serif;font-size:1.2rem;font-weight:700;margin-bottom:4px;}
.prof-email{color:var(--muted);font-size:.85rem;margin-bottom:12px;}
.prof-host-btn{display:inline-flex;align-items:center;font-family:"Rajdhani",sans-serif;font-weight:800;font-size:.85rem;text-transform:uppercase;letter-spacing:.5px;padding:8px 16px;border-radius:8px;background:linear-gradient(135deg,var(--cyan),#008ab8);color:#000;cursor:pointer;border:none;}

.prof-section{margin-bottom:32px;}
.prof-section-title{font-family:"Orbitron",sans-serif;font-size:.85rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--cyan);margin-bottom:16px;}
.prof-empty{color:var(--muted);font-size:.9rem;}
.prof-empty-box{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:28px;text-align:center;color:var(--muted);}

.prof-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;}
.prof-card-wrap{display:flex;flex-direction:column;gap:0;}
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

.confirm-overlay{position:fixed;inset:0;background:rgba(0,0,0,.8);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:600;padding:18px;}
.confirm-modal{background:var(--card);border:1px solid rgba(255,71,87,.3);border-radius:16px;padding:32px;max-width:440px;width:100%;text-align:center;box-shadow:0 24px 80px rgba(0,0,0,.6);}
.confirm-icon{font-size:2.5rem;margin-bottom:12px;}
.confirm-title{font-family:"Orbitron",sans-serif;font-size:1.2rem;font-weight:700;margin-bottom:12px;color:#ff4757;}
.confirm-desc{color:var(--muted);font-size:.85rem;line-height:1.7;}
.confirm-btns{display:flex;flex-direction:column;gap:9px;margin-top:24px;}
.confirm-cancel{padding:11px;font-family:"Rajdhani",sans-serif;font-weight:700;font-size:.9rem;text-transform:uppercase;border-radius:9px;border:1px solid var(--border);background:transparent;color:var(--text);cursor:pointer;}
.confirm-end{padding:11px;font-family:"Rajdhani",sans-serif;font-weight:800;font-size:.9rem;text-transform:uppercase;border-radius:9px;border:none;background:linear-gradient(135deg,var(--cyan),#008ab8);color:#000;cursor:pointer;}
.confirm-delete{padding:11px;font-family:"Rajdhani",sans-serif;font-weight:800;font-size:.9rem;text-transform:uppercase;border-radius:9px;border:none;background:rgba(255,71,87,.15);border:1px solid rgba(255,71,87,.4);color:#ff4757;cursor:pointer;}
.confirm-delete:disabled{opacity:.5;cursor:not-allowed;}
`;
