import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { formidable } from 'formidable';
import mammoth from 'mammoth';
import pdf from 'pdf-parse';
import fs from 'fs';

// Import context files
import context from './context.json';
import negotiationContext from './negotiation-context.json';

// --- Initialize API Clients ---
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });

// --- Vercel-specific config to disable body parsing ---
export const config = {
  api: {
    bodyParser: false,
  },
};

// --- Main Handler ---
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  // We need to parse the form data to get the 'action'
  const form = formidable({});
  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('Form parsing error:', err);
      return res.status(500).json({ error: 'Failed to parse form data.' });
    }
    
    const action = fields.action?.[0];

    try {
      switch (action) {
        case 'create':
          return await createNegotiation(req, res, { fields, files });
        case 'send_message':
          // For send_message, the body is JSON, so we need to handle it differently.
          // This part requires a re-architecture as Vercel's body parser is disabled.
          // A simple approach is to re-enable it for specific actions or parse JSON manually.
          // For this MVP, we'll assume JSON body can be parsed from fields if sent via form-data,
          // or we need a separate endpoint. Let's adjust the client to send send_message as JSON.
          // The correct fix is to have two endpoints or a more complex handler.
          // Let's assume the client sends JSON for send_message and we re-parse it here.
          // A better fix is to re-read the raw body if action is 'send_message'.
          // This implementation will be simplified to handle JSON body passed through formidable.
          const body = JSON.parse(fields.body); // A workaround
          return await handleMessage(req, res, body);
        default:
          // If action is not 'create', we assume it's a JSON request for 'send_message'
          // This requires the client to send JSON for 'send_message'
          if (req.headers['content-type']?.includes('application/json')) {
              let jsonBody = '';
              req.on('data', chunk => { jsonBody += chunk.toString(); });
              req.on('end', async () => {
                  try {
                      const parsedBody = JSON.parse(jsonBody);
                      if (parsedBody.action === 'send_message') {
                          await handleMessage(req, res, parsedBody);
                      } else {
                          res.status(400).json({ error: 'Invalid action in JSON body.' });
                      }
                  } catch (jsonError) {
                      res.status(400).json({ error: 'Invalid JSON body.' });
                  }
              });
          } else {
               res.status(400).json({ error: 'Invalid action or content type.' });
          }
      }
    } catch (err) {
      console.error('Server error:', err);
      return res.status(500).json({ error: 'An unexpected error occurred.' });
    }
  });
}


// --- Helper: Extract text from a file buffer ---
async function extractTextFromFile({ filepath, mimetype }) {
  if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const { value } = await mammoth.extractRawText({ path: filepath });
    return value;
  }
  if (mimetype === 'application/pdf') {
    const data = await pdf(fs.readFileSync(filepath));
    return data.text;
  }
  throw new Error('Unsupported file type. Please upload a .docx or .pdf file.');
}


// --- Action: Create a new negotiation session ---
async function createNegotiation(req, res, { fields, files }) {
  const userRole = fields.userRole?.[0];
  const termSheetFile = files.termSheetFile?.[0];

  if (!userRole || !termSheetFile) {
    return res.status(400).json({ error: 'userRole and termSheetFile are required.' });
  }
  if (userRole !== 'NewCo' && userRole !== 'BigTech') {
    return res.status(400).json({ error: 'Invalid userRole. Must be "NewCo" or "BigTech".' });
  }

  try {
    const termSheetText = await extractTextFromFile(termSheetFile);
    const aiRole = userRole === 'NewCo' ? 'BigTech' : 'NewCo';

    const { data, error } = await supabase
      .from('negotiations')
      .insert([{
        user_role: userRole,
        ai_role: aiRole,
        original_term_sheet: termSheetText,
        status: 'initializing',
        history: [],
      }])
      .select('id')
      .single();

    if (error) {
      console.error('Supabase insert error:', error);
      return res.status(500).json({ error: 'Failed to create negotiation session.' });
    }

    return res.status(201).json({ sessionId: data.id });
  } catch (extractError) {
    console.error("Error extracting text from file:", extractError);
    return res.status(400).json({ error: extractError.message });
  }
}

// --- Action: Handle a user's message ---
async function handleMessage(req, res, { sessionId, message }) {
  // This function is now called after manual JSON parsing if content-type is correct
  if (!sessionId || !message) {
    return res.status(400).json({ error: 'sessionId and message are required.' });
  }

  // 1. Load Session State
  const { data: session, error: sessionError } = await supabase
    .from('negotiations')
    .select('ai_role, history')
    .eq('id', sessionId)
    .single();

  if (sessionError || !session) {
    console.error('Supabase select error:', sessionError);
    return res.status(404).json({ error: 'Negotiation session not found.' });
  }

  const { ai_role, history } = session;

  // 2. Construct the Prompt
  const aiPersona = negotiationContext[ai_role];
  const prompt = `
    **Case Context:**
    ${JSON.stringify(context)}

    **Your Persona:**
    ${JSON.stringify(aiPersona)}

    **Negotiation History:**
    ${(history || []).map(turn => `${turn.speaker}: ${turn.content}`).join('\n')}

    **User's Latest Message:**
    ${message}

    **Your Task:**
    Based on your persona, the context, and the history, provide a concise and strategic response to the user's message.
  `;

  // 3. Call the Gemini API
  const result = await model.generateContent(prompt);
  const aiResponse = result.response.text();

  // 4. Update Session State
  const newHistory = [
    ...(history || []),
    { speaker: 'user', content: message },
    { speaker: 'ai', content: aiResponse },
  ];

  const { error: updateError } = await supabase
    .from('negotiations')
    .update({ history: newHistory })
    .eq('id', sessionId);

  if (updateError) {
    console.error('Supabase update error:', updateError);
    return res.status(500).json({ error: 'Failed to update negotiation session.' });
  }

  // 5. Return Response
  return res.status(200).json({ aiResponse });
}