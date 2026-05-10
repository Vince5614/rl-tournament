import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useUser } from '@clerk/clerk-react';
import { supabase } from '../lib/supabase.js';
import TournamentApp from '../components/TournamentApp.jsx';

export default function TournamentPage() {
  const { code } = useParams();
  const { isSignedIn, user } = useUser();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    async function load() {
      const { data: t, error: err } = await supabase
        .from('tournaments')
        .select('*')
        .eq('code', code.toUpperCase())
        .single();
      if (err || !t) { setError('Tournament not found. Check the code.'); setLoading(false); return; }
      setData(t);
      setLoading(false);
    }
    load();
  }, [code]);

  if (loading) return (
    <div style={{minHeight:'100vh',background:'#05080f',display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:16}}>
      <style>{'@import url("https://fonts.googleapis.com/css2?family=Orbitron:wght@700&display=swap");'}</style>
      <div style={{fontFamily:'Orbitron,sans-serif',color:'#00d4ff',fontSize:'1rem',letterSpacing:2,textTransform:'uppercase'}}>Loading Tournament...</div>
      <div style={{color:'#5a6985',fontSize:'.85rem'}}>{code?.toUpperCase()}</div>
    </div>
  );

  if (error) return (
    <div style={{minHeight:'100vh',background:'#05080f',display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:16}}>
      <style>{'@import url("https://fonts.googleapis.com/css2?family=Orbitron:wght@700&display=swap");'}</style>
      <div style={{fontFamily:'Orbitron,sans-serif',color:'#ff4757',fontSize:'1rem'}}>Tournament Not Found</div>
      <div style={{color:'#5a6985',fontSize:'.85rem'}}>{error}</div>
      <Link to="/" style={{marginTop:8,fontFamily:'Orbitron,sans-serif',fontSize:'.7rem',color:'#00d4ff',letterSpacing:1,textTransform:'uppercase'}}>← Back to Home</Link>
    </div>
  );

  const isHost = isSignedIn && user?.id === data.host_id;

  return (
    <TournamentApp
      tournamentCode={code.toUpperCase()}
      isHost={isHost}
      initialData={data}
    />
  );
}
