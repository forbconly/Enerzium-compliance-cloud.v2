// api/proxy.js
// Vercel Serverless Function / Node handler to proxy OpenAI chat completions streaming
// Ensure OPENAI_API_KEY is set in environment variables.

const OPENAI_KEY = process.env.OPENAI_API_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }
  if (!OPENAI_KEY) {
    res.status(500).send('OPENAI_API_KEY not configured');
    return;
  }

  let clientPayload;
  try {
    clientPayload = req.body;
    if (!clientPayload) {
      res.status(400).send('Missing JSON body');
      return;
    }
  } catch (err) {
    res.status(400).send('Invalid JSON body');
    return;
  }

  // Force streaming on upstream
  clientPayload.stream = true;

  try {
    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(clientPayload)
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      res.status(upstream.status).setHeader('Content-Type', 'text/plain').send(text);
      return;
    }

    // Stream upstream body to client
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      // Forward chunk as-is (SSE 'data: ...' lines will be preserved)
      res.write(chunk);
    }
    res.end();
  } catch (err) {
    console.error('Proxy error:', err);
    try { res.status(500).send('Proxy internal error: ' + String(err)); } catch (e) {}
  }
}
