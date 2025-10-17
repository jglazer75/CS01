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

  const contentType = req.headers['content-type'] || '';

  try {
    if (contentType.includes('application/json')) {
      // Handle JSON body for 'send_message'
      let body = '';
      for await (const chunk of req) {
        body += chunk;
      }
      const { action, ...data } = JSON.parse(body);

      if (action === 'send_message') {
        return await handleMessage(req, res, data);
      } else {
        return res.status(400).json({ error: 'Invalid action for JSON request.' });
      }
    } else if (contentType.includes('multipart/form-data')) {
      // Handle form-data for 'create'
      const form = formidable({});
      const { fields, files } = await new Promise((resolve, reject) => {
        form.parse(req, (err, fields, files) => {
          if (err) return reject(err);
          resolve({ fields, files });
        });
      });
      
      const action = fields.action?.[0];

      if (action === 'create') {
        return await createNegotiation(req, res, { fields, files });
      } else {
        return res.status(400).json({ error: 'Invalid action for form-data request.' });
      }
    } else {
      return res.status(415).json({ error: `Unsupported content-type: ${contentType}` });
    }
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'An unexpected error occurred.', details: err.message });
  }
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
  try {
    const userRole = fields.userRole?.[0];
    const termSheetFile = files.termSheetFile?.[0];

    // For debugging Vercel logs
    console.log('Received fields:', fields);
    console.log('Received files:', files);
    console.log('Selected termSheetFile:', termSheetFile);

    if (!userRole || !termSheetFile) {
      return res.status(400).json({ error: 'userRole and termSheetFile are required.' });
    }
    if (userRole !== 'NewCo' && userRole !== 'BigTech') {
      return res.status(400).json({ error: 'Invalid userRole. Must be "NewCo" or "BigTech".' });
    }

    const termSheetText = await extractTextFromFile(termSheetFile);
    const aiRole = userRole === 'NewCo' ? 'BigTech' : 'NewCo';

    const { data, error: supabaseError } = await supabase
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

    if (supabaseError) {
      console.error('Supabase insert error:', supabaseError);
      return res.status(500).json({ error: 'Failed to create negotiation session in database.' });
    }

    return res.status(201).json({ sessionId: data.id });
  } catch (error) {
    console.error("Error in createNegotiation:", error);
    return res.status(500).json({ error: 'Failed to process the request.', details: error.message });
  }
}

// --- Action: Handle a user's message ---
async function handleMessage(req, res, { sessionId, message }) {
  console.log(`handleMessage called for session: ${sessionId}`);
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
  try {
    if (!process.env.GEMINI_API_KEY) {
      console.error('GEMINI_API_KEY is not set.');
      return res.status(500).json({ error: 'Server configuration error: Missing API key.' });
    }
    console.log('Calling Gemini API...');
    const result = await model.generateContent(prompt);
    const aiResponse = result.response.text();
    console.log('Gemini API call successful.');

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
  } catch (aiError) {
    console.error('Gemini API error:', aiError);
    return res.status(500).json({ error: 'Failed to get a response from the AI model.' });
  }
}