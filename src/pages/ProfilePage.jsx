import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUser, useClerk } from '@clerk/clerk-react';
import { supabase } from '../lib/supabase.js';

export default function ProfilePage() {
  const { isSignedIn, user } = useUser();
  const { signOut } = useClerk();
  const navigate = useNavigate();
  const [hosted,  setHosted]  = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSignedIn) { navigate('/'); return; }
    async function load() {
      const { data: h } = await supabase
        .from('tournaments')
        .select('code,name,phase,created_at')
        .eq('host_id', user.id)
        .order('created_at', { ascending: false });
      setHosted(h || []);
      setLoading(false);
    }
    load();
  }, [isSignedIn, user]);

  const phaseLabel = p => ({ signup:'Sign-Ups Open', teams:'Teams Set', bracket:'Live', results:'Complete' }[p] || p);
  const phaseColor = p => ({ signup:'#00d4ff', teams:'#a855f7', bracket:'#00ff88', results:'#ffd700' }[p] || '#5a6985');

  function handleSignOut() {
    signOut();
    navigate('/');
  }

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
            <h2 className="prof-section-title">🏟️ Your Tournaments</h2>
            {loading && <p className="prof-empty">Loading...</p>}
            {!loading && hosted.length === 0 && (
              <div className="prof-empty-box">
                <p>You haven't hosted any tournaments yet.</p>
                <Link to="/" className="prof-host-btn" style={{marginTop:14,display:'inline-block'}}>Host your first tournament →</Link>
              </div>
            )}
            <div className="prof-grid">
              {hosted.map(t => (
                <Link to={`/t/${t.code}`} key={t.code} className="prof-card">
                  <div className="prof-card-top">
                    <span className="prof-card-name">{t.name}</span>
                    <span className="prof-card-status" style={{color:phaseColor(t.phase)}}>{phaseLabel(t.phase)}</span>
                  </div>
                  <div className="prof-card-bottom">
                    <span className="prof-card-code">#{t.code}</span>
                    <span className="prof-card-date">{new Date(t.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="prof-card-arrow">→</div>
                </Link>
              ))}
            </div>
          </div>
        </div>
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
.prof-signout:hover{color:var(--text);border-color:var(--border);}

.prof-content{max-width:900px;margin:0 auto;padding:36px 24px 60px;}

.prof-header{display:flex;align-items:center;gap:24px;margin-bottom:40px;padding:28px;background:var(--card);border:1px solid var(--border);border-radius:16px;}
.prof-avatar{width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,var(--cyan),var(--purple));display:flex;align-items:center;justify-content:center;font-family:"Orbitron",sans-serif;font-size:1.6rem;font-weight:900;color:#000;flex-shrink:0;overflow:hidden;}
.prof-name{font-family:"Orbitron",sans-serif;font-size:1.2rem;font-weight:700;margin-bottom:4px;}
.prof-email{color:var(--muted);font-size:.85rem;margin-bottom:12px;}
.prof-host-btn{display:inline-flex;align-items:center;font-family:"Rajdhani",sans-serif;font-weight:800;font-size:.85rem;text-transform:uppercase;letter-spacing:.5px;padding:8px 16px;border-radius:8px;background:linear-gradient(135deg,var(--cyan),#008ab8);color:#000;cursor:pointer;border:none;}

.prof-section{margin-bottom:32px;}
.prof-section-title{font-family:"Orbitron",sans-serif;font-size:.85rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--cyan);margin-bottom:16px;}
.prof-empty{color:var(--muted);font-size:.9rem;}
.prof-empty-box{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:28px;text-align:center;color:var(--muted);}

.prof-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;}
.prof-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:18px;cursor:pointer;transition:all .18s;position:relative;display:block;}
.prof-card:hover{border-color:rgba(0,212,255,.3);transform:translateY(-2px);box-shadow:0 6px 24px rgba(0,212,255,.08);}
.prof-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:12px;}
.prof-card-name{font-family:"Orbitron",sans-serif;font-size:.82rem;font-weight:700;line-height:1.3;}
.prof-card-status{font-size:.72rem;font-weight:700;white-space:nowrap;}
.prof-card-bottom{display:flex;align-items:center;justify-content:space-between;}
.prof-card-code{font-family:"Orbitron",sans-serif;font-size:.65rem;color:var(--muted);letter-spacing:2px;}
.prof-card-date{font-size:.75rem;color:var(--muted);}
.prof-card-arrow{position:absolute;bottom:16px;right:16px;color:var(--cyan);font-size:.9rem;opacity:.6;}
`;
