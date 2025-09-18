
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const mammoth = require('mammoth');
const pdf = require('pdf-parse');
const fs = require('fs').promises;
const path = require('path');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize Google Generative AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function getFileText(buffer, fileType) {
    if (fileType === 'application/pdf') {
        const data = await pdf(buffer);
        return data.text;
    } else if (fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const { value } = await mammoth.extractRawText({ buffer });
        return value;
    }
    throw new Error('Unsupported file type');
}

module.exports = async (req, res) => {
    try {
        const { fileName } = req.body;

        if (!fileName) {
            return res.status(400).json({ error: 'File name is required.' });
        }

        // 1. Download file from Supabase
        const { data: fileData, error: downloadError } = await supabase.storage
            .from('term-sheet-uploads')
            .download(fileName);

        if (downloadError) {
            throw new Error(`Error downloading file: ${downloadError.message}`);
        }

        const fileBuffer = Buffer.from(await fileData.arrayBuffer());
        const fileType = fileData.type;

        // 2. Extract text from the document
        const termSheetText = await getFileText(fileBuffer, fileType);

        // 3. Read context files
        const foundationsPath = path.join(__dirname, '..', '01-foundations.md');
        const theDealPath = path.join(__dirname, '..', '02-the-deal.md');

        const foundationsText = await fs.readFile(foundationsPath, 'utf-8');
        const theDealText = await fs.readFile(theDealPath, 'utf-8');

        // 4. Construct the prompt for Gemini
        const prompt = `
            **Case Study Context:**
            ${foundationsText}
            ${theDealText}

            **User's Term Sheet:**
            ${termSheetText}

            **Analysis Task:**
            As an expert in venture financing and intellectual property, please analyze the user's redlined term sheet in the context of the NewCo/BigTech case study. Provide a detailed analysis of the proposed changes, identifying potential issues and suggesting negotiation strategies for NewCo.
        `;

        // 5. Send to Gemini API
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const analysisText = response.text();

        // 6. Send response to the frontend
        res.status(200).json({ analysis: analysisText });

    } catch (error) {
        console.error('Error in analyze function:', error);
        res.status(500).json({ error: error.message });
    }
};
