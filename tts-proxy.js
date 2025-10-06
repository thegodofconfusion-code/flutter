// tts-proxy.js
import express from 'express';
import cors from 'cors';

const app = express();
const port = process.env.PORT || 3000;
const AZURE_ENDPOINT = process.env.AZURE_ENDPOINT;
const AZURE_KEY = process.env.AZURE_KEY;

if (!AZURE_ENDPOINT || !AZURE_KEY) {
  console.error('Please set AZURE_ENDPOINT and AZURE_KEY environment variables.');
  process.exit(1);
}

console.log('✅ TTS Proxy starting...');
console.log('   Endpoint:', AZURE_ENDPOINT);
console.log('   Key:', AZURE_KEY ? `${AZURE_KEY.substring(0, 8)}...` : 'MISSING');

app.use(cors());

// IMPORTANT: Parse raw body as Buffer, don't parse as JSON
app.use(express.raw({ 
  type: 'application/ssml+xml',
  limit: '2mb' 
}));

// Also handle text/xml and catch-all
app.use(express.raw({ 
  type: 'text/xml',
  limit: '2mb' 
}));

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'TTS proxy is running' });
});

app.post('/cognitiveservices/v1', async (req, res) => {
  console.log('📥 Received TTS request');
  console.log('   Content-Type:', req.get('Content-Type'));
  console.log('   Output Format:', req.get('X-Microsoft-OutputFormat'));
  console.log('   Body type:', typeof req.body);
  console.log('   Body is Buffer:', Buffer.isBuffer(req.body));
  console.log('   Body length:', req.body?.length || 0);
  
  // Log first 200 chars of SSML for debugging
  if (req.body && req.body.length > 0) {
    const ssmlPreview = req.body.toString('utf8').substring(0, 200);
    console.log('   SSML preview:', ssmlPreview);
  }
  
  try {
    const url = `${AZURE_ENDPOINT.replace(/\/$/, '')}/cognitiveservices/v1`;
    console.log('   Forwarding to:', url);
    
    const headers = {
      'Ocp-Apim-Subscription-Key': AZURE_KEY,
      'Content-Type': 'application/ssml+xml', // Force correct content-type
    };
    
    const outFmt = req.get('X-Microsoft-OutputFormat');
    if (outFmt) {
      headers['X-Microsoft-OutputFormat'] = outFmt;
      console.log('   Using format:', outFmt);
    }
    
    console.log('   Making Azure request...');
    const azureResp = await fetch(url, {
      method: 'POST',
      headers,
      body: req.body, // Send raw Buffer
    });
    
    console.log('   Azure response status:', azureResp.status);
    
    // If error, log the error body
    if (azureResp.status !== 200) {
      const errorText = await azureResp.text();
      console.error('   Azure error response:', errorText);
      res.status(azureResp.status).send(errorText);
      return;
    }
    
    res.status(azureResp.status);
    azureResp.headers.forEach((value, name) => {
      if (name.toLowerCase() === 'content-type' || name.toLowerCase() === 'content-length') {
        res.setHeader(name, value);
      }
    });
    
    const arrayBuffer = await azureResp.arrayBuffer();
    console.log('   Sending', arrayBuffer.byteLength, 'bytes back to client');
    res.send(Buffer.from(arrayBuffer));
    console.log('✅ Request completed successfully');
    
  } catch (err) {
    console.error('❌ Proxy error:', err);
    console.error('   Stack:', err.stack);
    res.status(500).json({ error: 'proxy_error', details: String(err) });
  }
});

app.listen(port, () => {
  console.log(`🚀 TTS proxy listening on port ${port}`);
});
