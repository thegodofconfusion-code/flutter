// tts-proxy.js
// Node 18+ (uses global fetch). Simple proxy for Azure TTS.
// Usage: AZURE_ENDPOINT=https://<region>.tts.speech.microsoft.com AZURE_KEY=your_sub_key node tts-proxy.js

import express from 'express';
import cors from 'cors';

const app = express();
const port = process.env.PORT || 3000;
const AZURE_ENDPOINT = process.env.AZURE_ENDPOINT; // e.g. https://qatarcentral.tts.speech.microsoft.com
const AZURE_KEY = process.env.AZURE_KEY;

if (!AZURE_ENDPOINT || !AZURE_KEY) {
  console.error('Please set AZURE_ENDPOINT and AZURE_KEY environment variables.');
  process.exit(1);
}

// We need raw body because Azure expects SSML XML.
app.use(cors());
app.use(express.raw({ type: '*/*', limit: '2mb' }));

app.post('/cognitiveservices/v1', async (req, res) => {
  try {
    const url = `${AZURE_ENDPOINT.replace(/\/$/, '')}/cognitiveservices/v1`;
    const headers = {
      'Ocp-Apim-Subscription-Key': AZURE_KEY,
      'Content-Type': req.get('Content-Type') || 'application/ssml+xml',
    };
    // forward X-Microsoft-OutputFormat if provided by client
    const outFmt = req.get('X-Microsoft-OutputFormat');
    if (outFmt) headers['X-Microsoft-OutputFormat'] = outFmt;

    const azureResp = await fetch(url, {
      method: 'POST',
      headers,
      body: req.body, // raw SSML bytes
    });

    // Forward status and content-type
    res.status(azureResp.status);
    azureResp.headers.forEach((value, name) => {
      // Avoid exposing server internals; but forward content-type and length
      if (name.toLowerCase() === 'content-type' || name.toLowerCase() === 'content-length') {
        res.setHeader(name, value);
      }
    });

    const arrayBuffer = await azureResp.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error('Proxy error', err);
    res.status(500).json({ error: 'proxy_error', details: String(err) });
  }
});

app.listen(port, () => {
  console.log(`TTS proxy listening on http://localhost:${port}`);
});
