"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const zod_1 = require("zod");
const pdf_parse_1 = __importDefault(require("pdf-parse"));
const tesseract_js_1 = __importDefault(require("tesseract.js"));
const openai_1 = __importDefault(require("openai"));
const app = (0, express_1.default)();
const port = process.env.PORT ? Number(process.env.PORT) : 8080;
const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
app.use((0, cors_1.default)({ origin: clientOrigin, credentials: false }));
app.use(express_1.default.json({ limit: '10mb' }));
const uploadsDir = path_1.default.join(process.cwd(), 'uploads');
if (!fs_1.default.existsSync(uploadsDir)) {
    fs_1.default.mkdirSync(uploadsDir, { recursive: true });
}
const upload = (0, multer_1.default)({ dest: uploadsDir });
const TrustedSource = zod_1.z.object({
    name: zod_1.z.string(),
    urlPattern: zod_1.z.string(),
    weight: zod_1.z.number().min(0).max(1)
});
const trustedSources = [
    { name: 'Radiopaedia', urlPattern: 'radiopaedia.org', weight: 0.9 },
    { name: 'RSNA', urlPattern: 'rsna.org', weight: 0.95 },
    { name: 'AJR', urlPattern: 'ajronline.org', weight: 0.9 },
    { name: 'Radiology Journal', urlPattern: 'pubs.rsna.org', weight: 0.9 },
    { name: 'BMJ', urlPattern: 'bmj.com', weight: 0.8 },
    { name: 'NEJM', urlPattern: 'nejm.org', weight: 0.9 },
    { name: 'Lancet', urlPattern: 'thelancet.com', weight: 0.9 },
    { name: 'Nature Medicine', urlPattern: 'nature.com', weight: 0.8 },
    { name: 'JAMA', urlPattern: 'jamanetwork.com', weight: 0.9 },
    { name: 'WHO', urlPattern: 'who.int', weight: 0.95 },
    { name: 'CDC', urlPattern: 'cdc.gov', weight: 0.95 },
    { name: 'NIH', urlPattern: 'nih.gov', weight: 0.95 },
    { name: 'NICE', urlPattern: 'nice.org.uk', weight: 0.9 },
    { name: 'ACR', urlPattern: 'acr.org', weight: 0.95 },
    { name: 'FDA', urlPattern: 'fda.gov', weight: 0.9 },
    { name: 'EMA', urlPattern: 'ema.europa.eu', weight: 0.85 },
    { name: 'NHS', urlPattern: 'nhs.uk', weight: 0.9 },
    { name: 'PubMed', urlPattern: 'pubmed.ncbi.nlm.nih.gov', weight: 0.8 },
    { name: 'ECR', urlPattern: 'myesr.org', weight: 0.8 }
];
const extractTextFromPdf = async (filePath) => {
    const dataBuffer = fs_1.default.readFileSync(filePath);
    const result = await (0, pdf_parse_1.default)(dataBuffer);
    return result.text || '';
};
const extractTextWithOcr = async (filePath) => {
    const result = await tesseract_js_1.default.recognize(filePath, 'eng');
    return result.data.text || '';
};
const readFileAsBase64 = (filePath) => {
    const data = fs_1.default.readFileSync(filePath);
    return data.toString('base64');
};
app.post('/api/analyze', upload.array('files', 5), async (req, res) => {
    try {
        const userQuery = req.body.query;
        const files = req.files;
        if (!process.env.OPENAI_API_KEY) {
            return res.status(500).json({ error: 'Missing OPENAI_API_KEY' });
        }
        const extractedTexts = [];
        const imageInputs = [];
        if (files && files.length > 0) {
            for (const file of files) {
                const ext = path_1.default.extname(file.originalname).toLowerCase();
                if (ext === '.pdf') {
                    const text = await extractTextFromPdf(file.path);
                    if (text.trim())
                        extractedTexts.push(`PDF ${file.originalname}:\n${text}`);
                }
                else if (['.png', '.jpg', '.jpeg', '.tiff', '.bmp', '.gif', '.webp'].includes(ext)) {
                    const base64 = readFileAsBase64(file.path);
                    imageInputs.push({ mimeType: file.mimetype, data: base64, filename: file.originalname });
                    try {
                        const ocrText = await extractTextWithOcr(file.path);
                        if (ocrText.trim())
                            extractedTexts.push(`OCR ${file.originalname}:\n${ocrText}`);
                    }
                    catch (_) { }
                }
                else if (['.txt'].includes(ext)) {
                    const txt = fs_1.default.readFileSync(file.path, 'utf-8');
                    extractedTexts.push(`Text ${file.originalname}:\n${txt}`);
                }
            }
        }
        const sourcesList = trustedSources
            .map(s => `- ${s.name} (${s.urlPattern}) weight=${s.weight}`)
            .join('\n');
        const systemPrompt = `You are a medical decision-support assistant. You must be conservative, cite only trusted sources, and include uncertainty. Do not provide definitive diagnoses. Provide differential diagnoses, next steps, and red flags. Use only web results from the following allowlist, prioritizing higher weights. Reject untrusted sources.\n\nTrusted sources (allowlist):\n${sourcesList}`;
        const messages = [
            { role: 'system', content: [{ type: 'input_text', text: systemPrompt }] },
            { role: 'user', content: [{ type: 'input_text', text: userQuery || 'Analyze the provided medical documents and images.' }] }
        ];
        for (const text of extractedTexts) {
            messages.push({ role: 'user', content: [{ type: 'input_text', text }] });
        }
        for (const img of imageInputs) {
            messages.push({
                role: 'user',
                content: [
                    { type: 'input_text', text: `Image: ${img.filename}` },
                    { type: 'input_image', image_url: `data:${img.mimeType};base64,${img.data}` }
                ]
            });
        }
        const allowedDomains = trustedSources.map(s => s.urlPattern);
        const response = await openai.responses.create({
            model: process.env.MODEL || 'gpt-4.1',
            input: messages,
            tools: [{ type: 'web_search' }],
            tool_choice: 'auto',
            temperature: 0.2,
            max_output_tokens: 800,
            metadata: { purpose: 'medical_differential_support', allowlist_hint: allowedDomains.join(',') }
        });
        const textOutput = response?.output_text || response?.content?.[0]?.text || JSON.stringify(response);
        res.json({ ok: true, result: textOutput });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: error?.message || 'Unknown error' });
    }
    finally {
        const files = req.files;
        if (files) {
            for (const file of files) {
                fs_1.default.unlink(file.path, () => { });
            }
        }
    }
});
app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
});
app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
});
