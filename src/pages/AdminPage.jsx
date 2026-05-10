import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useUser } from '@clerk/clerk-react';
import { supabase } from '../lib/supabase.js';

const ADMIN_EMAIL = 'steyversv@gmail.com';

export default function AdminPage() {
  const { isSignedIn, isLoaded, user } = useUser();
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [deleting, setDeleting]       = useState(null);
  const [search, setSearch]           = useState('');

  const adminEmail = user?.emailAddresses?.[0]?.emailAddress;
  const isAdmin = isSignedIn && adminEmail === ADMIN_EMAIL;

  useEffect(() => {
    if (!isLoaded) return;
    if (!isAdmin) { setLoading(false); return; }
    fetchAll();
  }, [isLoaded, isAdmin]);

  async function fetchAll() {
    setLoading(true);
    const { data, error } = await supabase
      .from('tournaments')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error) setTournaments(data || []);
    setLoading(false);
  }

  async function deleteTournament(code, name) {
    if (!window.confirm(`Delete "${name}" (${code})? This cannot be undone.`)) return;
    setDeleting(code);
    await supabase.from('tournaments').delete().eq('code', code);
    setTournaments(t => t.filter(x => x.code !== code));
    setDeleting(null);
  }

  const PHASE_COLORS = { signup:'#00d4ff', teams:'#a855f7', bracket:'#ffd700', results:'#00ff88' };
  const filtered = tournaments.filter(t =>
    t.name?.toLowerCase().includes(search.toLowerCase()) ||
    t.code?.toLowerCase().includes(search.toLowerCase()) ||
    t.host_name?.toLowerCase().includes(search.toLowerCase())
  );

  /* ── Not loaded yet ── */
  if (!isLoaded || loading) return (
    <div style={S.center}>
      <style>{FONTS}</style>
      <div style={S.loadText}>Loading...</div>
    </div>
  );

  /* ── Not admin ── */
  if (!isAdmin) return (
    <div style={S.center}>
      <style>{FONTS}</style>
      <div style={{textAlign:'center'}}>
        <div style={{fontSize:'3rem',marginBottom:16}}>🚫</div>
        <div style={{fontFamily:'Orbitron,sans-serif',fontSize:'1.1rem',color:'#ff4757',marginBottom:8}}>Access Denied</div>
        <div style={{color:'#5a6985',fontSize:'.88rem',marginBottom:24}}>This page is restricted to admins only.</div>
        <Link to="/" style={S.backBtn}>← Back to Home</Link>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:'100vh',background:'#05080f',color:'#dde4f0',fontFamily:'Rajdhani,sans-serif'}}>
      <style>{FONTS}</style>

      {/* NAV */}
      <nav style={S.nav}>
        <div style={{display:'flex',alignItems:'center',gap:14}}>
          <Link to="/" style={S.logo}>🚀 RL Tournament</Link>
          <div style={S.divider}/>
          <div style={S.navTitle}>⚙️ Admin Panel</div>
        </div>
        <div style={{fontSize:'.8rem',color:'#5a6985'}}>Signed in as <strong style={{color:'#00d4ff'}}>{adminEmail}</strong></div>
      </nav>

      <div style={{maxWidth:1100,margin:'0 auto',padding:'28px 18px 60px'}}>
        {/* Header */}
        <div style={{marginBottom:24}}>
          <div style={{fontFamily:'Orbitron,sans-serif',fontSize:'clamp(1.2rem,3vw,1.8rem)',fontWeight:900,background:'linear-gradient(135deg,#fff 30%,#00d4ff)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',backgroundClip:'text',marginBottom:6}}>
            All Tournaments
          </div>
          <div style={{color:'#5a6985',fontSize:'.9rem'}}>{tournaments.length} total · {tournaments.filter(t=>t.phase!=='results').length} active</div>
        </div>

        {/* Toolbar */}
        <div style={{display:'flex',gap:10,marginBottom:18,flexWrap:'wrap',alignItems:'center'}}>
          <input
            style={S.searchInput}
            placeholder="Search by name, code or host…"
            value={search}
            onChange={e=>setSearch(e.target.value)}
          />
          <button onClick={fetchAll} style={S.refreshBtn}>🔄 Refresh</button>
        </div>

        {/* Stats row */}
        {[
          {label:'Total',value:tournaments.length,color:'#00d4ff'},
          {label:'Sign-Ups',value:tournaments.filter(t=>t.phase==='signup').length,color:'#00d4ff'},
          {label:'Live',value:tournaments.filter(t=>t.phase==='bracket').length,color:'#ffd700'},
          {label:'Completed',value:tournaments.filter(t=>t.phase==='results').length,color:'#00ff88'},
        ].map(s=>(
          <span key={s.label} style={{display:'inline-flex',flexDirection:'column',alignItems:'center',background:'rgba(255,255,255,.04)',border:'1px solid rgba(255,255,255,.08)',borderRadius:10,padding:'10px 20px',marginRight:10,marginBottom:10}}>
            <span style={{fontFamily:'Orbitron,sans-serif',fontSize:'1.3rem',fontWeight:900,color:s.color}}>{s.value}</span>
            <span style={{fontSize:'.72rem',color:'#5a6985',textTransform:'uppercase',letterSpacing:'.5px'}}>{s.label}</span>
          </span>
        ))}

        {/* Table */}
        {filtered.length === 0 ? (
          <div style={{textAlign:'center',color:'#5a6985',padding:'40px 0',fontStyle:'italic'}}>No tournaments found.</div>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:10,marginTop:18}}>
            {filtered.map(t => {
              const phaseColor = PHASE_COLORS[t.phase] || '#5a6985';
              const isPublic = t.settings?.isPublic;
              const created = t.created_at ? new Date(t.created_at).toLocaleString() : '—';
              const updated = t.updated_at ? new Date(t.updated_at).toLocaleString() : '—';
              return (
                <div key={t.code} style={S.row}>
                  {/* Left: info */}
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:6}}>
                      <span style={{fontFamily:'Orbitron,sans-serif',fontSize:'.85rem',fontWeight:700,color:'#dde4f0'}}>{t.name}</span>
                      <span style={{fontFamily:'Orbitron,sans-serif',fontSize:'.6rem',color:'#5a6985',background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.1)',borderRadius:4,padding:'2px 7px',letterSpacing:2}}>{t.code}</span>
                      <span style={{fontFamily:'Orbitron,sans-serif',fontSize:'.58rem',fontWeight:700,padding:'2px 7px',borderRadius:4,textTransform:'uppercase',letterSpacing:'.5px',background:`${phaseColor}18`,border:`1px solid ${phaseColor}50`,color:phaseColor}}>{t.phase}</span>
                      <span style={{fontFamily:'Orbitron,sans-serif',fontSize:'.58rem',fontWeight:700,padding:'2px 7px',borderRadius:4,textTransform:'uppercase',letterSpacing:'.5px',background:isPublic?'rgba(0,255,136,.1)':'rgba(90,105,133,.1)',border:`1px solid ${isPublic?'rgba(0,255,136,.3)':'rgba(90,105,133,.3)'}`,color:isPublic?'#00ff88':'#5a6985'}}>{isPublic?'🌐 Public':'🔒 Private'}</span>
                    </div>
                    <div style={{display:'flex',gap:16,flexWrap:'wrap',fontSize:'.78rem',color:'#5a6985'}}>
                      <span>Host: <strong style={{color:'#aab'}}>{t.host_name||'—'}</strong></span>
                      <span>Players: <strong style={{color:'#aab'}}>{t.players?.length||0}</strong></span>
                      <span>Teams: <strong style={{color:'#aab'}}>{t.teams?.length||0}</strong></span>
                      <span>Created: <strong style={{color:'#aab'}}>{created}</strong></span>
                      <span>Updated: <strong style={{color:'#aab'}}>{updated}</strong></span>
                    </div>
                  </div>
                  {/* Right: actions */}
                  <div style={{display:'flex',gap:8,alignItems:'center',flexShrink:0}}>
                    <Link to={`/t/${t.code}`} style={S.viewBtn} target="_blank" rel="noopener noreferrer">👁 View</Link>
                    <button
                      onClick={()=>deleteTournament(t.code, t.name)}
                      disabled={deleting===t.code}
                      style={{...S.deleteBtn,...(deleting===t.code?{opacity:.5,cursor:'not-allowed'}:{})}}
                    >{deleting===t.code?'Deleting…':'🗑 Delete'}</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const FONTS = '@import url("https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Rajdhani:wght@400;600;700&display=swap");';

const S = {
  center:{minHeight:'100vh',background:'#05080f',display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:16,fontFamily:'Rajdhani,sans-serif'},
  loadText:{fontFamily:'Orbitron,sans-serif',color:'#00d4ff',fontSize:'1rem',letterSpacing:2,textTransform:'uppercase'},
  backBtn:{fontFamily:'Orbitron,sans-serif',fontSize:'.7rem',fontWeight:700,letterSpacing:1,textTransform:'uppercase',color:'#00d4ff',textDecoration:'none',border:'1px solid rgba(0,212,255,.3)',borderRadius:8,padding:'8px 18px'},
  nav:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 24px',background:'rgba(5,8,15,.9)',borderBottom:'1px solid rgba(0,210,255,.13)',backdropFilter:'blur(12px)',position:'sticky',top:0,zIndex:100,flexWrap:'wrap',gap:8},
  logo:{fontFamily:'Orbitron,sans-serif',fontSize:'.85rem',fontWeight:900,color:'#00d4ff',letterSpacing:1,textDecoration:'none'},
  navTitle:{fontFamily:'Orbitron,sans-serif',fontSize:'.75rem',fontWeight:700,color:'#dde4f0'},
  divider:{width:1,height:16,background:'rgba(0,210,255,.13)'},
  searchInput:{background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.12)',borderRadius:8,padding:'9px 14px',color:'#dde4f0',fontFamily:'Rajdhani,sans-serif',fontSize:'.9rem',flex:1,minWidth:200,outline:'none'},
  refreshBtn:{fontFamily:'Orbitron,sans-serif',fontSize:'.65rem',fontWeight:700,letterSpacing:'1px',textTransform:'uppercase',padding:'9px 16px',borderRadius:8,border:'1px solid rgba(0,212,255,.3)',background:'rgba(0,212,255,.07)',color:'#00d4ff',cursor:'pointer',whiteSpace:'nowrap'},
  row:{display:'flex',alignItems:'flex-start',gap:14,background:'rgba(255,255,255,.03)',border:'1px solid rgba(255,255,255,.08)',borderRadius:12,padding:'14px 18px',flexWrap:'wrap'},
  viewBtn:{fontFamily:'Orbitron,sans-serif',fontSize:'.62rem',fontWeight:700,letterSpacing:'1px',textTransform:'uppercase',padding:'7px 13px',borderRadius:7,border:'1px solid rgba(0,212,255,.3)',background:'rgba(0,212,255,.07)',color:'#00d4ff',textDecoration:'none',whiteSpace:'nowrap'},
  deleteBtn:{fontFamily:'Orbitron,sans-serif',fontSize:'.62rem',fontWeight:700,letterSpacing:'1px',textTransform:'uppercase',padding:'7px 13px',borderRadius:7,border:'1px solid rgba(255,71,87,.4)',background:'rgba(255,71,87,.1)',color:'#ff4757',cursor:'pointer',whiteSpace:'nowrap'},
};
