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
    addWord: (w) => run(sb.from('words').insert(w).select()),
    updateWord: (id, w) => run(sb.from('words').update(w).eq('id', id).select()),
    deleteWord: (id) => run(sb.from('words').delete().eq('id', id)),
    drops: () => run(sb.from('drops').select('*').order('id')),
    addDrop: (d) => run(sb.from('drops').insert(d).select()),
    updateDrop: (id, d) => run(sb.from('drops').update(d).eq('id', id).select()),
    deleteDrop: (id) => run(sb.from('drops').delete().eq('id', id)),
    opens: () => run(sb.from('opens').select('*')),
    markOpen: (drop_day, who) => run(sb.from('opens').upsert({ drop_day, who }, { onConflict: 'drop_day,who', ignoreDuplicates: true })),
    vouchers: () => run(sb.from('vouchers').select('*').order('id')),
    // source is unique (special:DATE, level:N), so a treat or reward is only ever given once
    addVoucher: (v) => run(sb.from('vouchers').upsert(v, { onConflict: 'source', ignoreDuplicates: true }).select()),
    issueVoucher: (v) => run(sb.from('vouchers').insert(v).select()),
    redeemVoucher: (id, done = false) => { const now = new Date().toISOString(); return run(sb.from('vouchers').update({ redeemed_at: now, ...(done ? { delivered_at: now } : {}) }).eq('id', id).select()); },
    deliverVoucher: (id) => run(sb.from('vouchers').update({ delivered_at: new Date().toISOString() }).eq('id', id).select()),
    xp: () => run(sb.from('xp').select('*').order('id')),
    // ref is unique (drop:DATE), so the same drop never pays twice; returns [] when it already paid
    addXp: (row) => run(sb.from('xp').upsert(row, { onConflict: 'ref', ignoreDuplicates: true }).select()),
    rewards: () => run(sb.from('rewards').select('*').order('sort')),
    addReward: (r) => run(sb.from('rewards').insert(r).select()),
    updateReward: (id, r) => run(sb.from('rewards').update(r).eq('id', id).select()),
    deleteReward: (id) => run(sb.from('rewards').delete().eq('id', id)),
    deleteXp: (id) => run(sb.from('xp').delete().eq('id', id)),
    updateVoucher: (id, v) => run(sb.from('vouchers').update(v).eq('id', id).select()),
    deleteVoucher: (id) => run(sb.from('vouchers').delete().eq('id', id)),
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
