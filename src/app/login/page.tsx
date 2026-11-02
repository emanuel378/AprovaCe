'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Marca, NomeMarca } from '@/components/Marca';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [modo, setModo] = useState<'entrar' | 'criar'>('entrar');
  const [msg, setMsg] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    setEnviando(true);
    const { data, error } = modo === 'entrar'
      ? await supabase.auth.signInWithPassword({ email, password: senha })
      : await supabase.auth.signUp({ email, password: senha });
    setEnviando(false);
    if (error) return setMsg(error.message);
    // Com "Confirm email" desligado no Supabase, o cadastro já devolve sessão e entra direto.
    if (data.session) return router.push('/');
    setMsg('Conta criada. Confirme o e-mail para entrar.');
  }

  return (
    <main className="min-h-screen grid lg:grid-cols-2">
      <section className="hero hidden lg:flex flex-col justify-between p-12">
        <div className="flex items-center gap-3 relative z-10"><Marca size={48} /><span className="text-2xl"><NomeMarca claro /></span></div>
        <div className="relative z-10 max-w-md">
          <h2 className="font-display text-4xl font-bold leading-tight">Sua aprovação em <span style={{ color: 'var(--gold)' }}>Soldado PMCE</span>, questão por questão.</h2>
          <p className="mt-4 opacity-80">Banco de questões comentadas, edital verticalizado e acompanhamento do seu progresso em um só lugar.</p>
        </div>
        <p className="text-sm opacity-60 relative z-10">Material de organização não oficial</p>
      </section>

      <section className="grid place-items-center p-6">
        <form onSubmit={enviar} className="card w-full max-w-sm p-7 space-y-4">
          <div className="lg:hidden flex items-center gap-2"><Marca size={36} /><span className="text-xl"><NomeMarca /></span></div>
          <div>
            <h1 className="text-2xl font-bold text-brand">{modo === 'entrar' ? 'Bem-vindo de volta' : 'Criar sua conta'}</h1>
            <p className="text-sm text-muted">{modo === 'entrar' ? 'Entre para continuar estudando.' : 'Leva menos de um minuto.'}</p>
          </div>
          <input className="field" type="email" required placeholder="E-mail" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="field" type="password" required minLength={6} placeholder="Senha (mín. 6 caracteres)" autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'} value={senha} onChange={(e) => setSenha(e.target.value)} />
          <button disabled={enviando} className="btn btn-primary w-full">{enviando ? 'Aguarde…' : modo === 'entrar' ? 'Entrar' : 'Criar conta'}</button>
          <button type="button" className="text-sm text-blue font-medium hover:underline" onClick={() => { setMsg(''); setModo(modo === 'entrar' ? 'criar' : 'entrar'); }}>
            {modo === 'entrar' ? 'Não tenho conta' : 'Já tenho conta'}
          </button>
          {msg && <p role="alert" className="text-sm text-red">{msg}</p>}
        </form>
      </section>
    </main>
  );
}
