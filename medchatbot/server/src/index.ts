import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import pdfParse from 'pdf-parse';
import Tesseract from 'tesseract.js';
import OpenAI from 'openai';

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 8080;
const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(cors({ origin: clientOrigin, credentials: false }));
app.use(express.json({ limit: '10mb' }));

const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
const upload = multer({ dest: uploadsDir });

const TrustedSource = z.object({
  name: z.string(),
  urlPattern: z.string(),
  weight: z.number().min(0).max(1)
});

type TrustedSource = z.infer<typeof TrustedSource>;

const trustedSources: TrustedSource[] = [
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

const extractTextFromPdf = async (filePath: string): Promise<string> => {
  const dataBuffer = fs.readFileSync(filePath);
  const result = await pdfParse(dataBuffer);
  return result.text || '';
};

const extractTextWithOcr = async (filePath: string): Promise<string> => {
  const result = await Tesseract.recognize(filePath, 'eng');
  return result.data.text || '';
};

const readFileAsBase64 = (filePath: string): string => {
  const data = fs.readFileSync(filePath);
  return data.toString('base64');
};

app.post('/api/analyze', upload.array('files', 5), async (req, res) => {
  try {
    const userQuery = req.body.query as string | undefined;
    const files = req.files as Express.Multer.File[] | undefined;

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'Missing OPENAI_API_KEY' });
    }

    const extractedTexts: string[] = [];
    const imageInputs: Array<{ mimeType: string; data: string; filename: string }> = [];

    if (files && files.length > 0) {
      for (const file of files) {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext === '.pdf') {
          const text = await extractTextFromPdf(file.path);
          if (text.trim()) extractedTexts.push(`PDF ${file.originalname}:\n${text}`);
        } else if (['.png', '.jpg', '.jpeg', '.tiff', '.bmp', '.gif', '.webp'].includes(ext)) {
          const base64 = readFileAsBase64(file.path);
          imageInputs.push({ mimeType: file.mimetype, data: base64, filename: file.originalname });
          try {
            const ocrText = await extractTextWithOcr(file.path);
            if (ocrText.trim()) extractedTexts.push(`OCR ${file.originalname}:\n${ocrText}`);
          } catch (_) {}
        } else if (['.txt'].includes(ext)) {
          const txt = fs.readFileSync(file.path, 'utf-8');
          extractedTexts.push(`Text ${file.originalname}:\n${txt}`);
        }
      }
    }

    const sourcesList = trustedSources
      .map(s => `- ${s.name} (${s.urlPattern}) weight=${s.weight}`)
      .join('\n');

    const systemPrompt = `You are a medical decision-support assistant. You must be conservative, cite only trusted sources, and include uncertainty. Do not provide definitive diagnoses. Provide differential diagnoses, next steps, and red flags. Use only web results from the following allowlist, prioritizing higher weights. Reject untrusted sources.\n\nTrusted sources (allowlist):\n${sourcesList}`;

    const messages: Array<any> = [
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
    } as any);

    const textOutput = (response as any)?.output_text || (response as any)?.content?.[0]?.text || JSON.stringify(response);

    res.json({ ok: true, result: textOutput });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error?.message || 'Unknown error' });
  } finally {
    const files = req.files as Express.Multer.File[] | undefined;
    if (files) {
      for (const file of files) {
        fs.unlink(file.path, () => {});
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