const http = require('http');
http.get('http://localhost:5174/', (r) => {
  let d = '';
  r.on('data', c => d += c);
  r.on('end', () => {
    console.log('Status:', r.statusCode);
    console.log('Root div:', d.includes('id="root"') ? 'FOUND' : 'MISSING');
    console.log('Module script:', d.includes('type="module"') ? 'FOUND' : 'MISSING');
  });
}).on('error', e => console.error('Error:', e.message));
