// Import the Supabase client library
import { createClient } from '@supabase/supabase-js';

// Initialize the Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// The main handler for the serverless function
export default async function handler(req, res) {
  // Ensure the request is a POST request
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    // Destructure the required fields from the request body
    const { userRole, termSheetText } = req.body;

    // --- Input Validation ---
    if (!userRole || !termSheetText) {
      return res.status(400).json({ error: 'userRole and termSheetText are required.' });
    }
    if (userRole !== 'NewCo' && userRole !== 'BigTech') {
      return res.status(400).json({ error: 'Invalid userRole. Must be "NewCo" or "BigTech".' });
    }

    // --- Determine AI Role ---
    const docs/api/node_modules/tr46aiRole = userRole === 'NewCo' ? 'BigTech' : 'NewCo';

    // --- Create a New Negotiation Session in Supabase ---
    const { data, error } = await supabase
      .from('negotiations')
      .insert([
        {
          user_role: userRole,
          ai_role: aiRole,
          original_term_sheet: termSheetText,
          status: 'initializing',
          // Initialize history with a system message
          history: [{ speaker: 'system', content: 'Negotiation session created.' }],
        },
      ])
      .select('id') // Only return the 'id' of the new row
      .single(); // Ensure we get a single object back, not an array

    // --- Error Handling for Database Operation ---
    if (error) {
      console.error('Supabase insert error:', error);
      return res.status(500).json({ error: 'Failed to create negotiation session.' });
    }

    // --- Success Response ---
    // Return the unique ID of the newly created session
    res.status(201).json({ sessionId: data.id });

  } catch (err) {
    // --- General Error Handling ---
    console.error('Server error:', err);
    res.status(500).json({ error: 'An unexpected error occurred.' });
  }
}