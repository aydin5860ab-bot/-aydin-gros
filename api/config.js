// Tarayıcıya yalnızca PUBLIC Supabase bilgilerini verir.
// Service role key bu endpoint'e ASLA eklenmez.
export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const url = process.env.SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    return res.status(503).json({ error: 'Supabase yapılandırılmamış' })
  }

  res.setHeader('Cache-Control', 'public, max-age=3600')
  return res.status(200).json({ url, anonKey })
}
