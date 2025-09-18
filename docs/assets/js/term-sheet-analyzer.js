
document.addEventListener('DOMContentLoaded', () => {
    const uploadForm = document.getElementById('upload-form');
    const fileInput = document.getElementById('term-sheet-file');
    const resultDiv = document.getElementById('analysis-result');
    const loadingIndicator = document.getElementById('loading-indicator');
    const errorMessage = document.getElementById('error-message');
    const analysisOutput = document.getElementById('analysis-output');

    // IMPORTANT: Replace with your actual Supabase URL and anon key
    const SUPABASE_URL = 'https://imtuovchucjgxnzfablu.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImltdHVvdmNodWNqZ3huemZhYmx1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgyMjY0ODEsImV4cCI6MjA3MzgwMjQ4MX0.nzWIvlvEdAZRavL-Z7LsXCh5wZqLm4Uba_lKht08rT0';

    const { createClient } = window.supabase;
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const file = fileInput.files[0];
        if (!file) {
            errorMessage.textContent = 'Please select a file to upload.';
            resultDiv.style.display = 'block';
            return;
        }

        // Reset UI
        resultDiv.style.display = 'block';
        loadingIndicator.style.display = 'block';
        errorMessage.textContent = '';
        analysisOutput.textContent = '';

        try {
            // 1. Upload file to Supabase
            const fileName = `${Date.now()}-${file.name}`;
            const { error: uploadError } = await supabase.storage
                .from('term-sheet-uploads')
                .upload(fileName, file);

            if (uploadError) {
                throw new Error(`Upload error: ${uploadError.message}`);
            }

            // 2. Call our serverless function
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ fileName }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Analysis failed.');
            }

            const { analysis } = await response.json();
            analysisOutput.textContent = analysis;

        } catch (error) {
            errorMessage.textContent = error.message;
        } finally {
            loadingIndicator.style.display = 'none';
        }
    });
});
