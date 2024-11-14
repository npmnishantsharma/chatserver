const router = require('express').Router(); 
const multer = require('multer');
const upload = multer({ dest: 'tmp/' });
const {
    GoogleGenerativeAI,
    HarmCategory,
    HarmBlockThreshold,
  } = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");

const apiKey ="AIzaSyCMv1sPPJuKcAQeVc0OcL39-SUzcv1mHxs";
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });
const fileManager = new GoogleAIFileManager(apiKey);
async function uploadToGemini(path, mimeType) {
    const uploadResult = await fileManager.uploadFile(path, {
      mimeType,
      displayName: path,
    });
    const file = uploadResult.file;
    console.log(`Uploaded file ${file.displayName} as: ${file.name}`);
    return file;
  }

router.post('/upload', upload.single('image'), async (req, res) => {
    const files = [await uploadToGemini(req.file.path, req.file.mimetype)];
    const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
      });
      const generationConfig = {
        temperature: 1,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 8192,
        responseMimeType: "text/plain",
      };
      const chatSession = model.startChat({
        generationConfig,
        history: [
            {
                role:"user",
                parts:[
                    {text:"Analyze the image and give me the text in the image and instructions to draw that image on a canvas. Give the result in JSON format. USE CAPITAL LETTERS AND KIND OF SYSTEM INSTRUCTIONS LIKE TO DRAW A LINE: 'LINE_STRAIGHT_{SIZE}CM', 'CIRCLE_RADIUS_{SIZE}CM'"}
                ]
            },
            {
              role: "user",
              parts: [
                {
                  fileData: {
                    mimeType: files[0].mimeType,
                    fileUri: files[0].uri,
                  },
                },
              ],
            },
          ],
      })    
      const result = await chatSession.sendMessage("What is this?");
      res.json({result: result.response.text()});
      
});

// Add route for serving HTML page
router.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>MathSketch Image Analysis</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
                .loading {
                    display: none;
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                .loading.active {
                    display: block;
                }
            </style>
        </head>
        <body class="bg-gray-900 text-white min-h-screen">
            <div class="container mx-auto px-4 py-8">
                <header class="text-center mb-12">
                    <h1 class="text-4xl font-bold mb-4">MathSketch Image Analysis</h1>
                    <p class="text-gray-400">Upload mathematical expressions and get instant analysis</p>
                </header>

                <div class="max-w-xl mx-auto bg-gray-800 rounded-lg p-6 shadow-xl">
                    <form id="uploadForm" class="space-y-6">
                        <div class="space-y-2">
                            <label class="block text-sm font-medium text-gray-300">
                                Upload Image
                            </label>
                            <div class="flex items-center justify-center w-full">
                                <label class="flex flex-col w-full h-32 border-2 border-gray-600 border-dashed rounded-lg cursor-pointer hover:bg-gray-700 transition-all">
                                    <div class="flex flex-col items-center justify-center pt-7">
                                        <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                                        </svg>
                                        <p class="pt-1 text-sm tracking-wider text-gray-400">
                                            Select an image
                                        </p>
                                    </div>
                                    <input type="file" class="opacity-0" accept="image/*" id="imageInput" />
                                </label>
                            </div>
                        </div>

                        <div id="imagePreview" class="hidden">
                            <img id="preview" class="w-full rounded-lg" />
                        </div>

                        <button type="submit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                            <span class="loading" id="loading">
                                <svg class="animate-spin h-5 w-5 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                            </span>
                            <span id="submitText">Analyze Image</span>
                        </button>
                    </form>

                    <div id="result" class="mt-6 hidden">
                        <h2 class="text-xl font-semibold mb-4">Analysis Result</h2>
                        <div id="resultContent" class="bg-gray-700 rounded-lg p-4 text-gray-200"></div>
                    </div>
                </div>
            </div>

            <script>
                document.getElementById('imageInput').addEventListener('change', function(e) {
                    const file = e.target.files[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = function(e) {
                            document.getElementById('preview').src = e.target.result;
                            document.getElementById('imagePreview').classList.remove('hidden');
                        }
                        reader.readAsDataURL(file);
                    }
                });

                document.getElementById('uploadForm').addEventListener('submit', async function(e) {
                    e.preventDefault();
                    const file = document.getElementById('imageInput').files[0];
                    if (!file) {
                        alert('Please select an image first');
                        return;
                    }

                    // Show loading state
                    document.getElementById('loading').classList.add('active');
                    document.getElementById('submitText').classList.add('hidden');

                    const formData = new FormData();
                    formData.append('image', file);

                    try {
                        const response = await fetch('/web/upload', {
                            method: 'POST',
                            body: formData
                        });
                        const data = await response.json();
                        console.log(data);
                        
                        // Display result
                        document.getElementById('result').classList.remove('hidden');
                        document.getElementById('resultContent').textContent = data.result;
                    } catch (error) {
                        console.error('Error:', error);
                        alert('An error occurred while analyzing the image');
                    } finally {
                        // Hide loading state
                        document.getElementById('loading').classList.remove('active');
                        document.getElementById('submitText').classList.remove('hidden');
                    }
                });
            </script>
        </body>
        </html>
    `);
});

module.exports = router;
