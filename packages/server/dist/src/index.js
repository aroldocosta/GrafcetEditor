"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@grafcet/core");
// Garantir que os geradores estão registrados
core_1.CodeGeneratorRegistry.register(new core_1.Userver03Generator());
const PORT = Number(process.env.PORT) || 3000;
const server = Bun.serve({
    port: PORT,
    async fetch(req) {
        const url = new URL(req.url);
        // CORS Headers
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        };
        if (req.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }
        // GET /health
        if (url.pathname === '/health' && req.method === 'GET') {
            return Response.json({ status: 'ok', service: 'grafcet-server', time: new Date() }, { headers: corsHeaders });
        }
        // GET /api/targets
        if (url.pathname === '/api/targets' && req.method === 'GET') {
            const targets = core_1.CodeGeneratorRegistry.list();
            return Response.json({ targets }, { headers: corsHeaders });
        }
        // POST /api/compile
        if (url.pathname === '/api/compile' && req.method === 'POST') {
            try {
                const body = await req.json();
                const targetId = body.targetId || 'userver03';
                const ir = body.ir || body;
                const output = core_1.CodeGeneratorRegistry.generate(targetId, ir);
                return Response.json({ success: true, output }, { headers: corsHeaders });
            }
            catch (err) {
                return Response.json({ success: false, error: err.message }, { status: 400, headers: corsHeaders });
            }
        }
        // POST /api/deploy
        if (url.pathname === '/api/deploy' && req.method === 'POST') {
            try {
                const body = await req.json();
                const deviceIp = body.deviceIp; // Ex: "192.168.1.50" ou "10.10.0.5"
                const targetId = body.targetId || 'userver03';
                const ir = body.ir;
                if (!deviceIp) {
                    return Response.json({ success: false, error: "O campo 'deviceIp' é obrigatório." }, { status: 400, headers: corsHeaders });
                }
                const compiled = core_1.CodeGeneratorRegistry.generate(targetId, ir);
                // Despachar a configuração via HTTP POST para o dispositivo IoT
                const targetEndpoint = `http://${deviceIp}/code_param.cfg`;
                console.log(`[Deploy] Enviando payload (${compiled.targetId}) para ${targetEndpoint}...`);
                let responseText = '';
                let ok = false;
                try {
                    const iotResponse = await fetch(targetEndpoint, {
                        method: 'POST',
                        headers: { 'Content-Type': compiled.mimeType },
                        body: compiled.content,
                    });
                    ok = iotResponse.ok;
                    responseText = await iotResponse.text();
                }
                catch (fetchErr) {
                    responseText = `Falha na conexão HTTP com o dispositivo IoT: ${fetchErr.message}`;
                }
                return Response.json({
                    success: ok,
                    deviceIp,
                    endpoint: targetEndpoint,
                    compiledOutput: compiled,
                    deviceResponse: responseText
                }, { headers: corsHeaders });
            }
            catch (err) {
                return Response.json({ success: false, error: err.message }, { status: 500, headers: corsHeaders });
            }
        }
        return Response.json({ error: 'Endpoint não encontrado' }, { status: 404, headers: corsHeaders });
    },
});
console.log(`🚀 Grafcet Deploy Server rodando na porta ${server.port}`);
