const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

// Load API Key from local config.json if present
let localApiKey = '';
function loadLocalConfig() {
    try {
        const configPath = path.join(__dirname, 'config.json');
        if (fs.existsSync(configPath)) {
            const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            localApiKey = configData.apiKey || '';
            if (localApiKey) {
                console.log('[Config] Successfully loaded local NVIDIA API key from config.json');
            }
        } else {
            console.log('[Config] config.json not found, relying on browser key configuration.');
        }
    } catch (err) {
        console.error('[Config Error] Failed to read or parse config.json:', err);
    }
}
loadLocalConfig();

// Content types map
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
    // Enable CORS for development
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Proxy request to NVIDIA NIM API
    if (req.url === '/api/chat' && req.method === 'POST') {
        console.log('[Proxy] Forwarding chat request to NVIDIA NIM...');

        // Determine which API key to use
        const authHeader = req.headers['authorization'] || '';
        let apiKeyToUse = localApiKey;
        
        // If client sends a custom header, use it instead unless it's a placeholder
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const customKey = authHeader.substring(7).trim();
            if (customKey && !customKey.includes('已載入本地伺服器密鑰') && !customKey.includes('●●●●')) {
                apiKeyToUse = customKey;
            }
        }

        if (!apiKeyToUse) {
            console.error('[Proxy Error] No API key provided in config.json or client headers!');
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'NVIDIA API key missing. Please configure config.json or input it in Settings.' }));
            return;
        }

        // Set up the options for the request to NVIDIA
        const options = {
            hostname: 'integrate.api.nvidia.com',
            port: 443,
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': req.headers['content-type'] || 'application/json',
                'Authorization': `Bearer ${apiKeyToUse}`,
                'Accept': req.headers['accept'] || 'text/event-stream'
            }
        };

        const proxyReq = https.request(options, (proxyRes) => {
            // Forward NVIDIA response headers (especially Content-Type for streaming)
            res.writeHead(proxyRes.statusCode, {
                'Content-Type': proxyRes.headers['content-type'] || 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            });

            // Pipe the response stream directly back to the client
            proxyRes.pipe(res);

            proxyRes.on('error', (err) => {
                console.error('[Proxy Error] Response streaming failed:', err);
                if (!res.headersSent) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Failed to stream from NVIDIA NIM API' }));
                }
            });
        });

        proxyReq.on('error', (err) => {
            console.error('[Proxy Error] Request failed:', err);
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'NVIDIA API connection error: ' + err.message }));
            }
        });

        // Pipe the client request body into NVIDIA's request
        req.pipe(proxyReq);
        return;
    }

    // Shutdown server endpoint gracefully
    if (req.url === '/api/shutdown' && req.method === 'POST') {
        console.log('[Server] Shutdown request received. Exiting progress gracefully...');
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, message: 'Server is stopping gracefully...' }));
        
        setTimeout(() => {
            console.log('[Server] Service terminated.');
            process.exit(0);
        }, 1000);
        return;
    }

    // Get server configuration status
    if (req.url === '/api/config' && req.method === 'GET') {
        loadLocalConfig();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ hasApiKey: !!localApiKey }));
        return;
    }

    // Get all stored sessions
    if (req.url === '/api/sessions' && req.method === 'GET') {
        const dbPath = path.join(__dirname, 'database.json');
        fs.readFile(dbPath, 'utf8', (err, data) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    // Send empty sessions list if no db file yet
                    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end('[]');
                    return;
                }
                console.error('[DB Error] Failed to read database.json:', err);
                res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'Failed to read database' }));
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(data || '[]');
        });
        return;
    }

    // Save/update sessions
    if (req.url === '/api/sessions' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                // Ensure it's valid JSON
                JSON.parse(body);
                const dbPath = path.join(__dirname, 'database.json');
                fs.writeFile(dbPath, body, 'utf8', (err) => {
                    if (err) {
                        console.error('[DB Error] Failed to save database.json:', err);
                        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                        res.end(JSON.stringify({ error: 'Failed to save database' }));
                        return;
                    }
                    console.log('[DB] Successfully synced conversations to database.json');
                    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ success: true }));
                });
            } catch (e) {
                console.error('[DB Error] Received invalid JSON for saving sessions:', e);
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'Invalid JSON data payload' }));
            }
        });
        return;
    }

    // Static files serving
    let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
    
    // Normalize path to prevent directory traversal
    filePath = path.normalize(filePath);
    if (!filePath.startsWith(__dirname)) {
        res.writeHead(403);
        res.end('Access Denied');
        return;
    }

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                console.log(`[Server 404] File not found: ${req.url}`);
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 Not Found</h1>', 'utf-8');
            } else {
                console.error(`[Server 500] Error reading ${req.url}:`, err);
                res.writeHead(500);
                res.end(`Server Error: ${err.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.log(`\n🚀 Premium ChatGPT UI is active!`);
    console.log(`👉 Access URL: http://localhost:${PORT}`);
    console.log(`💡 Connecting to NVIDIA NIM API with streaming support.\n`);
});
