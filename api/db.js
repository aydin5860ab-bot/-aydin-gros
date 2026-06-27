export default async function handler(req, res) {
  const DB_URL = 'https://jsonblob.com/api/jsonBlob/019f0673-4992-7b6d-916a-3a0dd2181397';
  const coll = req.query.coll;

  try {
    if (req.method === 'GET') {
      const r = await fetch(DB_URL, { headers: { 'Accept': 'application/json' } });
      const data = await r.json();
      if (coll && data[coll]) {
        return res.status(200).json(data[coll]);
      }
      return res.status(200).json(data);
    } 
    
    if (req.method === 'POST' || req.method === 'PUT') {
      const r = await fetch(DB_URL, { headers: { 'Accept': 'application/json' } });
      let full = {};
      if (r.ok) {
        full = await r.json();
      }
      
      if (coll) {
        full[coll] = req.body;
      } else {
        full = req.body;
      }

      const put = await fetch(DB_URL, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(full)
      });
      
      return res.status(200).json({ success: true });
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
