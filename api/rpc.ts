export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const upstream = await fetch('https://studio.genlayer.com/api', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req.body),
    })

    const text = await upstream.text()
    res.status(upstream.status)
    res.setHeader('content-type', upstream.headers.get('content-type') || 'application/json')
    res.send(text)
  } catch (error: any) {
    res.status(502).json({
      jsonrpc: '2.0',
      id: req.body?.id ?? null,
      error: {
        code: -32098,
        message: 'StudioNet RPC proxy failed',
        data: String(error?.message ?? error ?? 'unknown error'),
      },
    })
  }
}
