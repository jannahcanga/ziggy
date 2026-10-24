// Talks to Supabase. Nothing personal lives in this file.
export async function createSupabaseBackend(url, key) {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  const sb = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });

  const run = async (p) => {
    const { data, error } = await p;
    if (error) throw new Error(error.message);
    return data;
  };

  return {
    async getSession() { const { data } = await sb.auth.getSession(); return data.session; },
    async signIn(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
      return data.session;
    },
    async signOut() { await sb.auth.signOut(); },
    members: () => run(sb.from('members').select('*')),
    settings: async () => Object.fromEntries((await run(sb.from('settings').select('*'))).map(r => [r.key, r.value])),
    words: () => run(sb.from('words').select('*')),
    drops: () => run(sb.from('drops').select('*').order('id')),
    opens: () => run(sb.from('opens').select('*')),
    markOpen: (drop_day, who) => run(sb.from('opens').upsert({ drop_day, who }, { onConflict: 'drop_day,who', ignoreDuplicates: true })),
    vouchers: () => run(sb.from('vouchers').select('*').order('id')),
    addVoucher: (v) => run(sb.from('vouchers').upsert(v, { onConflict: 'from_drop', ignoreDuplicates: true }).select()),
    issueVoucher: (v) => run(sb.from('vouchers').insert(v).select()),
    redeemVoucher: (id) => run(sb.from('vouchers').update({ redeemed_at: new Date().toISOString() }).eq('id', id).select()),
    timeline: () => run(sb.from('timeline').select('*').order('happened_on')),
    addMoment: (m) => run(sb.from('timeline').insert(m).select()),
    updateMoment: (id, m) => run(sb.from('timeline').update(m).eq('id', id).select()),
    deleteMoment: (id) => run(sb.from('timeline').delete().eq('id', id)),
    places: () => run(sb.from('places').select('*').order('created_at')),
    addPlace: (p) => run(sb.from('places').insert(p).select()),
    updatePlace: (id, p) => run(sb.from('places').update(p).eq('id', id).select()),
    deletePlace: (id) => run(sb.from('places').delete().eq('id', id)),
    checkins: () => run(sb.from('checkins').select('*').order('created_at', { ascending: false }).limit(10)),
    addCheckin: (c) => run(sb.from('checkins').insert(c)),
  };
}
