import { VercelRequest, VercelResponse } from '@vercel/node'

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  const q = req.query || {}
  const recetitleRaw = Array.isArray(q.recetitle) ? q.recetitle[0] : (q.recetitle as string | undefined)
  const recetitle = recetitleRaw ? String(recetitleRaw).trim() : ''

  // Build redirect target: keep all query params except `recetitle`
  const params = new URLSearchParams()
  Object.keys(q).forEach((k) => {
    if (k === 'recetitle') return
    const v = q[k]
    if (Array.isArray(v)) v.forEach((x) => params.append(k, String(x)))
    else if (v !== undefined) params.set(k, String(v))
  })
  const redirectPath = `/?${params.toString()}`.replace(/\?$/,'/')

  let html = '<!doctype html><html lang="ja"><head><meta charset="utf-8">'

  if (recetitle) {
    const safe = escapeHtml(recetitle)
    html += `<title>${safe}</title>`
    html += `<meta property="og:title" content="${safe}" />`
    html += `<meta name="twitter:card" content="summary" />`
    // Intentionally omit og:description and og:image to keep preview minimal
  } else {
    // No recetitle: produce minimal page so most link previews won't show extra info
    html += `<title></title>`
    html += `<meta name="robots" content="noimageindex" />`
  }

  // Add a short redirect for browsers/users after crawlers read meta
  const encoded = escapeHtml(redirectPath)
  html += `</head><body><script>location.replace("${encoded}")</script></body></html>`

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.status(200).send(html)
}
